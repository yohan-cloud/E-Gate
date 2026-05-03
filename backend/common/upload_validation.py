import mimetypes
import os
import subprocess
import tempfile
from dataclasses import dataclass

from django.conf import settings
from PIL import Image


MB = 1024 * 1024


@dataclass(frozen=True)
class UploadPolicy:
    allowed_content_types: set[str]
    max_size_mb: int = 5
    require_image_dimensions: bool = False
    min_width: int = 1
    min_height: int = 1


IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
DOCUMENT_TYPES = IMAGE_TYPES | {"application/pdf"}


def _safe_seek(file_obj, position=0):
    try:
        file_obj.seek(position)
    except Exception:
        pass


def _sniff_header(file_obj, size=16):
    _safe_seek(file_obj, 0)
    header = file_obj.read(size)
    _safe_seek(file_obj, 0)
    return header or b""


def _guess_content_type(file_obj):
    content_type = getattr(file_obj, "content_type", "") or ""
    if content_type:
        return content_type.lower()
    guessed, _encoding = mimetypes.guess_type(getattr(file_obj, "name", "") or "")
    return (guessed or "").lower()


def _validate_image(file_obj, policy: UploadPolicy):
    try:
        image = Image.open(file_obj)
        image.verify()
        _safe_seek(file_obj, 0)
        if policy.require_image_dimensions:
            image = Image.open(file_obj)
            width, height = image.size
            _safe_seek(file_obj, 0)
            if width < policy.min_width or height < policy.min_height:
                return f"Image too small. Minimum size is {policy.min_width}x{policy.min_height} pixels."
    except Exception:
        return "Invalid image file."
    return None


def _validate_pdf(file_obj):
    header = _sniff_header(file_obj, 8)
    if not header.startswith(b"%PDF-"):
        return "Invalid PDF file."
    return None


def _scan_with_clamav(file_obj):
    if not getattr(settings, "CLAMAV_SCAN_ENABLED", False):
        return None
    command = getattr(settings, "CLAMAV_SCAN_COMMAND", "clamscan")
    suffix = os.path.splitext(getattr(file_obj, "name", "") or "")[1][:16]
    _safe_seek(file_obj, 0)
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            for chunk in file_obj.chunks():
                tmp.write(chunk)
            tmp_path = tmp.name
        result = subprocess.run(
            [command, "--no-summary", tmp_path],
            check=False,
            capture_output=True,
            text=True,
            timeout=getattr(settings, "CLAMAV_SCAN_TIMEOUT_SECONDS", 15),
        )
        if result.returncode == 1:
            return "Malware scan rejected this file."
        if result.returncode not in (0, 1):
            return "Malware scan failed. Please try again later."
    except FileNotFoundError:
        return "Malware scanner is enabled but clamscan was not found."
    except Exception:
        return "Malware scan failed. Please try again later."
    finally:
        _safe_seek(file_obj, 0)
        try:
            if "tmp_path" in locals():
                os.unlink(tmp_path)
        except Exception:
            pass
    return None


def validate_upload(file_obj, policy: UploadPolicy):
    if not file_obj:
        return "No file uploaded."

    if getattr(file_obj, "size", 0) and file_obj.size > policy.max_size_mb * MB:
        return f"File too large. Max {policy.max_size_mb}MB."

    content_type = _guess_content_type(file_obj)
    if content_type not in policy.allowed_content_types:
        allowed = "JPG, PNG, WEBP, or PDF" if "application/pdf" in policy.allowed_content_types else "JPG, PNG, or WEBP"
        return f"Unsupported file type. Use {allowed}."

    if content_type in IMAGE_TYPES:
        image_error = _validate_image(file_obj, policy)
        if image_error:
            return image_error
    elif content_type == "application/pdf":
        pdf_error = _validate_pdf(file_obj)
        if pdf_error:
            return pdf_error

    return _scan_with_clamav(file_obj)
