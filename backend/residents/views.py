from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth import authenticate
from residents.serializers import (
    ResidentProfileSerializer,
    ResidentIDSerializer,
    AdminResidentUpdateSerializer,
    VerificationRequestSerializer,
)
from django.db import models
from django.contrib.auth import get_user_model
from residents.models import ResidentProfile, VerificationRequest
from accounts.serializers import ResidentRegisterSerializer, LoginSerializer
from accounts.utils import generate_token_response
from accounts.permissions import IsResidentUserRole, IsAdminUserRole
from PIL import Image, ImageOps
try:
    # Prefer explicit enum for resampling to satisfy type checkers
    from PIL.Image import Resampling as PilResampling  # type: ignore
except Exception:  # pragma: no cover - fallback for older Pillow
    PilResampling = None  # type: ignore
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
import os
from io import BytesIO
from typing import Any, cast
from accounts.face_utils import extract_embedding, average_embeddings, validate_face_image, FaceLibNotAvailable
from datetime import date, timedelta
from rest_framework import generics
from django.utils import timezone
from sync.outbox import emit as emit_outbox
from common.audit import audit_log
import logging

logger = logging.getLogger("accounts")


def _emit(event_type: str, aggregate: str, aggregate_id, payload):
    try:
        emit_outbox(event_type, aggregate, aggregate_id, payload)
    except Exception as exc:
        logger.info("[SYNC_EMIT_SKIP] %s err=%s", event_type, exc)


def _resident_label(profile):
    user = getattr(profile, "user", None)
    if not user:
        return str(getattr(profile, "barangay_id", "resident"))
    full_name = f"{(user.first_name or '').strip()} {(user.last_name or '').strip()}".strip()
    return full_name or user.username or str(getattr(profile, "barangay_id", "resident"))


# Register a new resident (uses shared serializer for consistency)
@api_view(['POST'])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def register_resident(request):
    serializer = ResidentRegisterSerializer(data=request.data, context={'request': request})
    if serializer.is_valid():
        # Help static analysis understand the saved instance type
        user = cast(Any, serializer.save())
        return Response(
            {
                'message': 'Resident registered successfully',
                'user': {
                    'id': getattr(user, 'id', None),
                    'username': getattr(user, 'username', ''),
                    'email': getattr(user, 'email', ''),
                    'is_resident': getattr(user, 'is_resident', False),
                    'date_joined': str(getattr(user, 'date_joined', '')),
                },
            },
            status=status.HTTP_201_CREATED,
        )
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# Resident Login (shared serializer + unified token response)
@api_view(['POST'])
@permission_classes([AllowAny])
def login_resident(request):
    login_serializer = LoginSerializer(data=request.data)
    login_serializer.is_valid(raise_exception=True)

    data = cast(dict[str, Any], login_serializer.validated_data)
    username = cast(str, data.get('username', ''))
    password = cast(str, data.get('password', ''))
    user = authenticate(username=username, password=password)
    if not user:
        return Response({'error': 'Invalid username or password'}, status=status.HTTP_401_UNAUTHORIZED)
    if not getattr(user, 'is_resident', False):
        return Response({'error': 'Access denied: Not a resident account'}, status=status.HTTP_403_FORBIDDEN)

    profile_data = None
    # Use getattr to satisfy type checker about dynamic reverse relation
    p = getattr(user, 'profile', None)
    if p is not None:
        profile_data = {
            'barangay_id': str(p.barangay_id),
            'address': p.address,
            'birthdate': str(p.birthdate),
            'date_registered': str(p.date_registered),
            'expiry_date': str(p.expiry_date),
        }

    resp = generate_token_response(
        user,
        message='Resident login successful',
        role='Resident',
        profile_data=profile_data,
    )
    audit_log(
        request,
        actor=user,
        action="login_success",
        target_type="auth",
        target_id=user.id,
        target_label=user.username,
        metadata={"role": "Resident"},
    )
    return Response(resp, status=status.HTTP_200_OK)


# Resident profile
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def resident_profile(request):
    user = request.user
    if not hasattr(user, 'profile'):
        return Response({'error': 'Profile not found'}, status=status.HTTP_404_NOT_FOUND)
    serializer = ResidentProfileSerializer(
        user.profile,
        context={'request': request, 'reveal_sensitive': True},
    )
    return Response(serializer.data)


# Virtual Barangay ID
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def resident_virtual_id(request):
    user = request.user
    if not hasattr(user, 'profile'):
        return Response({'error': 'Profile not found'}, status=status.HTTP_404_NOT_FOUND)
    serializer = ResidentIDSerializer(user.profile)
    return Response(serializer.data)


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated, IsResidentUserRole])
def resident_verification_request(request):
    """
    Residents upload a government ID for verification.
    """
    user = request.user
    latest = VerificationRequest.objects.filter(user=user).order_by("-created_at").first()

    if request.method == 'GET':
        if not latest:
            return Response({"status": "none"}, status=status.HTTP_200_OK)
        serializer = VerificationRequestSerializer(latest, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    # POST: create a new request if none pending
    has_pending = VerificationRequest.objects.filter(
        user=user, status=VerificationRequest.Status.PENDING
    ).exists()
    if has_pending:
        return Response({"error": "You already have a pending verification request."}, status=status.HTTP_400_BAD_REQUEST)

    file = request.FILES.get('document') or request.FILES.get('id_image') or request.FILES.get('file')
    if not file:
        return Response({"error": "Upload your ID under field 'document'."}, status=status.HTTP_400_BAD_REQUEST)
    allowed_types = {'image/jpeg', 'image/png', 'image/webp', 'application/pdf'}
    if getattr(file, 'content_type', None) not in allowed_types:
        return Response({"error": "Unsupported file type. Use JPG, PNG, WEBP, or PDF."}, status=status.HTTP_400_BAD_REQUEST)
    if getattr(file, 'size', None) and file.size > 5 * 1024 * 1024:
        return Response({"error": "File too large. Max 5MB."}, status=status.HTTP_400_BAD_REQUEST)

    note = (request.data.get('note') or '').strip()
    vr = VerificationRequest.objects.create(user=user, document=file, note=note)
    _emit(
        "verification.changed",
        "residents.VerificationRequest",
        vr.id,
        {"verification_id": vr.id, "status": vr.status, "user_id": user.id},
    )
    serializer = VerificationRequestSerializer(vr, context={'request': request})
    return Response(serializer.data, status=status.HTTP_201_CREATED)


# Upload/replace or delete resident profile photo
@api_view(['POST', 'DELETE'])
@permission_classes([IsAuthenticated, IsResidentUserRole])
def update_profile_photo(request):
    user = request.user
    if not hasattr(user, 'profile'):
        return Response({'error': 'Profile not found'}, status=status.HTTP_404_NOT_FOUND)

    profile = user.profile

    if request.method == 'DELETE':
        # Remove existing file from storage if present, then clear field
        try:
            if profile.photo:
                base = os.path.basename(profile.photo.name)
                # delete original
                profile.photo.delete(save=False)
                # delete thumbnail
                thumb_rel = f"photos/thumbs/{base}"
                if default_storage.exists(thumb_rel):
                    try:
                        default_storage.delete(thumb_rel)
                    except Exception:
                        pass
        except Exception:
            # Ignore storage deletion errors; still clear DB field
            pass
        profile.photo = None
        profile.save(update_fields=['photo'])
        serializer = ResidentProfileSerializer(profile, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    # POST (upload)
    file = request.FILES.get('photo')
    if not file:
        return Response({'error': 'No file uploaded under field "photo"'}, status=status.HTTP_400_BAD_REQUEST)

    # Basic validation
    allowed_types = {'image/jpeg', 'image/png', 'image/webp'}
    if getattr(file, 'content_type', None) not in allowed_types:
        return Response({'error': 'Unsupported image type. Use JPG, PNG, or WEBP.'}, status=status.HTTP_400_BAD_REQUEST)
    max_mb = 5
    if file.size and file.size > max_mb * 1024 * 1024:
        return Response({'error': f'File too large. Max {max_mb}MB.'}, status=status.HTTP_400_BAD_REQUEST)

    # Process image: exif-orient, constrain max size, save
    try:
        img = Image.open(file)
        img = ImageOps.exif_transpose(img)
        # Validate minimum dimensions before any resize
        min_w = 128
        min_h = 128
        if img.width < min_w or img.height < min_h:
            return Response({'error': f'Image too small. Minimum size is {min_w}x{min_h} pixels.'}, status=status.HTTP_400_BAD_REQUEST)
        # Constrain max dimension (downscale only)
        max_dim = 1024
        img.thumbnail((max_dim, max_dim))
        buf = BytesIO()
        fmt = (img.format or 'PNG').upper()
        if fmt not in ('JPEG', 'PNG', 'WEBP'):
            fmt = 'PNG'
        save_kwargs = {'format': fmt}
        if fmt == 'JPEG' and img.mode in ('RGBA', 'P'):  # JPEG doesn't support alpha
            img = img.convert('RGB')
        img.save(buf, **save_kwargs)
        buf.seek(0)
        new_name = file.name
        content = ContentFile(buf.read(), name=new_name)
    except Exception as e:
        return Response({'error': f'Invalid image: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)

    profile.photo = content
    profile.save(update_fields=['photo'])

    # Generate thumbnail 128x128 stored at photos/thumbs/<basename>
    try:
        base = os.path.basename(profile.photo.name)
        thumb_rel = f"photos/thumbs/{base}"
        # Build thumbnail
        if PilResampling is not None:
            thumb = ImageOps.fit(img.copy(), (128, 128), method=PilResampling.LANCZOS)
        else:
            # Fallback for older Pillow where enum may not exist
            thumb = ImageOps.fit(img.copy(), (128, 128))
        tbuf = BytesIO()
        tfmt = fmt if fmt in ('JPEG', 'PNG', 'WEBP') else 'PNG'
        if tfmt == 'JPEG' and thumb.mode in ('RGBA', 'P'):
            thumb = thumb.convert('RGB')
        thumb.save(tbuf, format=tfmt)
        tbuf.seek(0)
        # Overwrite existing thumb path if present
        if default_storage.exists(thumb_rel):
            try:
                default_storage.delete(thumb_rel)
            except Exception:
                pass
        default_storage.save(thumb_rel, ContentFile(tbuf.read(), name=os.path.basename(thumb_rel)))
    except Exception:
        pass

    serializer = ResidentProfileSerializer(profile, context={'request': request})
    return Response(serializer.data, status=status.HTTP_200_OK)


# Enroll a resident face (store reference image + embedding). Supports single image 'image'
# or multiple images 'images' (FormData with multiple files). When multiple, embeddings are averaged.
@api_view(['POST'])
@permission_classes([IsAuthenticated, IsResidentUserRole])
def enroll_face(request):
    user = request.user
    if not hasattr(user, 'profile'):
        return Response({'error': 'Profile not found'}, status=status.HTTP_404_NOT_FOUND)
    profile = user.profile

    files = request.FILES.getlist('images')
    if not files:
        # Fallback to single key names
        single = request.FILES.get('image') or request.FILES.get('face') or request.FILES.get('face_image')
        if single:
            files = [single]
    if not files:
        return Response({'error': 'No image uploaded. Use field "image" or multiple "images".'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        # Validate type and size for each provided image
        allowed_types = {'image/jpeg', 'image/png', 'image/webp'}
        for f in files:
            ct = getattr(f, 'content_type', None)
            if ct not in allowed_types:
                return Response({'error': 'Unsupported image type. Use JPG, PNG, or WEBP.'}, status=status.HTTP_400_BAD_REQUEST)
            if getattr(f, 'size', None) and f.size > 5 * 1024 * 1024:
                return Response({'error': 'File too large. Max 5MB.'}, status=status.HTTP_400_BAD_REQUEST)

        # Compute embedding(s)
        embs = []
        first_file = None
        for idx, f in enumerate(files):
            emb = extract_embedding(f)
            embs.append(emb)
            if idx == 0:
                first_file = f
        embedding = embs[0] if len(embs) == 1 else average_embeddings(embs)

        # Reset cursor for first file and persist an example image
        if first_file is not None:
            try:
                first_file.seek(0)
            except Exception:
                pass
            profile.face_image = first_file
        profile.face_embedding = embedding
        profile.save(update_fields=['face_image', 'face_embedding', 'face_updated_at'])
        return Response({'message': 'Face enrolled successfully', 'has_face': True}, status=status.HTTP_200_OK)
    except FaceLibNotAvailable:
        first_file = files[0] if files else None
        if first_file is None:
            return Response({'error': 'No image uploaded. Use field "image" or multiple "images".'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_face_image(first_file)
            try:
                first_file.seek(0)
            except Exception:
                pass
            profile.face_image = first_file
            profile.face_embedding = None
            profile.save(update_fields=['face_image', 'face_embedding', 'face_updated_at'])
            return Response(
                {
                    'message': 'Face enrolled successfully in compatibility mode.',
                    'has_face': True,
                    'mode': 'image_only_fallback',
                },
                status=status.HTTP_200_OK,
            )
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': f'Failed to enroll face: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)
    except ValueError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({'error': f'Failed to enroll face: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def renew_resident_id(request):
    """
    Renew a resident's ID (extend for another 365 days) while keeping the same details.
    Accepts 'username' or 'barangay_id' in the payload.
    """
    username = request.data.get('username')
    barangay_id = request.data.get('barangay_id')
    qs = ResidentProfile.objects.select_related('user')
    profile = None
    if barangay_id:
        profile = qs.filter(barangay_id=barangay_id).first()
    elif username:
        profile = qs.filter(user__username=username).first()

    if not profile:
        return Response({'error': 'Resident profile not found'}, status=status.HTTP_404_NOT_FOUND)

    today = date.today()
    profile.date_registered = today
    profile.expiry_date = today + timedelta(days=365)
    profile.save(update_fields=['date_registered', 'expiry_date'])

    return Response({
        'message': 'Resident ID renewed for 365 days',
        'barangay_id': str(profile.barangay_id),
        'expiry_date': str(profile.expiry_date),
    }, status=status.HTTP_200_OK)


class ResidentListView(generics.ListAPIView):
    """
    Admin-only list of residents with basic profile info.
    Supports search via ?q= for username/first/last name.
    """
    serializer_class = ResidentProfileSerializer
    permission_classes = [IsAuthenticated, IsAdminUserRole]
    pagination_class = None  # return full list for admin view

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["reveal_sensitive"] = False
        return context

    def get_queryset(self):
        qs = ResidentProfile.objects.select_related('user').all()
        q = self.request.query_params.get('q')
        if q:
            qs = qs.filter(
                models.Q(user__username__icontains=q)
                | models.Q(user__first_name__icontains=q)
                | models.Q(user__last_name__icontains=q)
            )
        return qs.order_by('-date_registered')

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        result_count = len(response.data) if isinstance(response.data, list) else len(response.data.get("results", []))
        audit_log(
            request,
            action="resident_list_view",
            target_type="resident",
            target_label="resident directory",
            metadata={
                "query": (request.query_params.get("q") or "").strip(),
                "result_count": result_count,
                "resident_name": "resident directory",
            },
        )
        return response


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def admin_update_resident(request, user_id):
    User = get_user_model()
    user = User.objects.filter(id=user_id).first()
    if not user:
        return Response({'error': 'Resident not found'}, status=status.HTTP_404_NOT_FOUND)
    if getattr(user, 'is_admin', False):
        return Response({'error': 'Cannot edit admin accounts'}, status=status.HTTP_403_FORBIDDEN)
    profile = getattr(user, 'profile', None)
    if not profile:
        return Response({'error': 'Profile not found'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        reveal_reason = (request.query_params.get("reason") or "").strip().lower()
        audit_log(
            request,
            action="resident_sensitive_reveal" if reveal_reason == "reveal_sensitive" else "resident_detail_view",
            target_type="resident",
            target_id=user.id,
            target_label=_resident_label(profile),
            metadata={
                "barangay_id": str(profile.barangay_id),
                "username": getattr(user, "username", ""),
                "resident_user_id": user.id,
                "resident_name": _resident_label(profile),
                "reason": reveal_reason or "detail_view",
            },
        )
        serializer = ResidentProfileSerializer(
            profile,
            context={'request': request, 'reveal_sensitive': True},
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    serializer = AdminResidentUpdateSerializer(data=request.data, context={'user': user})
    serializer.is_valid(raise_exception=True)
    previous_state = {
        "username": getattr(user, "username", ""),
        "email": getattr(user, "email", ""),
        "first_name": getattr(user, "first_name", ""),
        "last_name": getattr(user, "last_name", ""),
        "address": getattr(profile, "address", ""),
        "birthdate": str(getattr(profile, "birthdate", "") or ""),
        "expiry_date": str(getattr(profile, "expiry_date", "") or ""),
        "phone_number": getattr(profile, "phone_number", "") or "",
        "gender": getattr(profile, "gender", "") or "",
    }
    try:
        serializer.update(profile, serializer.validated_data)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    changed_fields = {}
    for field, before in previous_state.items():
        after = getattr(user, field, None) if hasattr(user, field) else getattr(profile, field, None)
        after_value = str(after) if after is not None else ""
        if before != after_value:
            changed_fields[field] = {"from": before, "to": after_value}
    audit_log(
        request,
        action="resident_update",
        target_type="resident",
        target_id=user.id,
        target_label=_resident_label(profile),
        metadata={
            "barangay_id": str(profile.barangay_id),
            "resident_user_id": user.id,
            "resident_name": _resident_label(profile),
            "changed_fields": changed_fields,
        },
    )
    refreshed = ResidentProfileSerializer(
        profile,
        context={'request': request, 'reveal_sensitive': True},
    )
    return Response(refreshed.data, status=status.HTTP_200_OK)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def admin_delete_resident(request, user_id):
    User = get_user_model()
    user = User.objects.filter(id=user_id).first()
    if not user:
        return Response({'error': 'Resident not found'}, status=status.HTTP_404_NOT_FOUND)
    if getattr(user, 'is_admin', False):
        return Response({'error': 'Cannot delete admin accounts'}, status=status.HTTP_403_FORBIDDEN)
    profile = getattr(user, 'profile', None)
    target_label = _resident_label(profile) if profile else (user.username or f"user-{user.id}")
    audit_log(
        request,
        action="resident_delete",
        target_type="resident",
        target_id=user.id,
        target_label=target_label,
        metadata={
            "barangay_id": str(getattr(profile, "barangay_id", "") or ""),
            "username": getattr(user, "username", ""),
            "resident_user_id": user.id,
            "resident_name": target_label,
        },
    )
    user.delete()
    return Response({'message': 'Resident account deleted'}, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def admin_verification_requests(request):
    """
    List verification requests (filter by ?status=pending|approved|rejected).
    """
    status_filter = request.query_params.get('status')
    q = (request.query_params.get('q') or '').strip()
    qs = VerificationRequest.objects.select_related('user', 'reviewed_by').all()
    if status_filter in VerificationRequest.Status.values:
        qs = qs.filter(status=status_filter)
    if q:
        qs = qs.filter(
            models.Q(user__username__icontains=q)
            | models.Q(user__email__icontains=q)
            | models.Q(user__first_name__icontains=q)
            | models.Q(user__last_name__icontains=q)
            | models.Q(user__profile__phone_number__icontains=q)
        )
    serializer = VerificationRequestSerializer(qs, many=True, context={'request': request})
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsAdminUserRole])
def admin_review_verification_request(request, request_id):
    """
    Approve or reject a verification request.
    Body: action=approved|rejected, optional admin_note.
    """
    action = (request.data.get('action') or request.data.get('status') or '').lower()
    if action not in (VerificationRequest.Status.APPROVED, VerificationRequest.Status.REJECTED):
        return Response({"error": "Action must be 'approved' or 'rejected'."}, status=status.HTTP_400_BAD_REQUEST)

    vr = VerificationRequest.objects.select_related('user').filter(id=request_id).first()
    if not vr:
        return Response({"error": "Verification request not found."}, status=status.HTTP_404_NOT_FOUND)
    if vr.status == action:
        return Response({"error": f"Request is already marked as {action}."}, status=status.HTTP_400_BAD_REQUEST)

    vr.status = action
    admin_note = (request.data.get('admin_note') or '').strip()
    if not admin_note and action == VerificationRequest.Status.REJECTED:
        admin_note = "Please contact the admin and upload a new ID document for verification."
    vr.admin_note = admin_note
    vr.reviewed_by = request.user
    vr.reviewed_at = timezone.now()
    vr.save(update_fields=['status', 'admin_note', 'reviewed_by', 'reviewed_at'])

    # Sync profile verification flag
    prof = getattr(vr.user, 'profile', None)
    if prof:
        if action == VerificationRequest.Status.APPROVED:
            prof.is_verified = True
            prof.verified_at = vr.reviewed_at
        else:
            prof.is_verified = False
            prof.verified_at = None
        prof.save(update_fields=['is_verified', 'verified_at'])

    serializer = VerificationRequestSerializer(vr, context={'request': request})
    _emit(
        "verification.changed",
        "residents.VerificationRequest",
        vr.id,
        {
            "verification_id": vr.id,
            "status": vr.status,
            "reviewed_by_id": getattr(request.user, "id", None),
            "reviewed_at": vr.reviewed_at.isoformat() if vr.reviewed_at else None,
            "admin_note": vr.admin_note,
        },
    )
    audit_log(
        request,
        action="verification_review",
        target_type="verification_request",
        target_id=vr.id,
        target_label=getattr(vr.user, "username", f"verification-{vr.id}"),
        metadata={
            "resident_user_id": getattr(vr.user, "id", None),
            "resident_name": getattr(vr.user, "username", f"verification-{vr.id}"),
            "status": vr.status,
            "admin_note": vr.admin_note,
        },
    )
    return Response(serializer.data, status=status.HTTP_200_OK)
