import os
from io import BytesIO

try:
    import numpy as np  # type: ignore
except Exception:
    np = None

try:
    import face_recognition  # type: ignore
    HAS_FACE_LIB = True
except Exception:
    HAS_FACE_LIB = False

try:
    import cv2  # type: ignore
    HAS_OPENCV = True
except Exception:
    HAS_OPENCV = False


class FaceLibNotAvailable(Exception):
    pass


def _runtime_hint() -> str:
    return (
        "Run the backend with the project virtualenv "
        "('.venv\\Scripts\\python.exe backend\\manage.py runserver') "
        "or the face-enabled run script."
    )


def _ensure_lib():
    if not HAS_FACE_LIB:
        raise FaceLibNotAvailable(
            "face_recognition library not available in the active Python runtime. "
            f"{_runtime_hint()}"
        )


def extract_embedding(file_obj) -> list:
    _ensure_lib()
    data = file_obj.read()
    try:
        file_obj.seek(0)
    except Exception:
        pass
    img = face_recognition.load_image_file(BytesIO(data))
    locator = os.getenv("FACE_LOCATOR", "hog")
    boxes = face_recognition.face_locations(img, model=locator)
    if not boxes:
        raise ValueError("No face detected in the image.")
    if len(boxes) > 1:
        raise ValueError("Multiple faces detected. Please upload a single-face image.")
    encs = face_recognition.face_encodings(img, known_face_locations=boxes)
    if not encs:
        raise ValueError("Failed to compute face encoding.")
    return encs[0].tolist()


def match_embedding(probe: list, candidates: list, tolerance: float = 0.6):
    _ensure_lib()
    if not candidates:
        return None, None
    probe_vec = np.array(probe)
    ids = []
    vecs = []
    for uid, emb in candidates:
        try:
            v = np.array(emb)
            if v.shape != probe_vec.shape:
                continue
            ids.append(uid)
            vecs.append(v)
        except Exception:
            continue
    if not vecs:
        return None, None
    mat = np.vstack(vecs)
    dists = np.linalg.norm(mat - probe_vec, axis=1)
    idx = int(np.argmin(dists))
    best_dist = float(dists[idx])
    best_id = ids[idx]
    second_best = None
    if len(dists) > 1:
        ordered = np.sort(dists)
        second_best = float(ordered[1])

    try:
        min_margin = float(os.getenv("FACE_MATCH_MIN_MARGIN", "0.03"))
    except Exception:
        min_margin = 0.03
    min_margin = max(0.0, min(0.1, min_margin))

    margin = None if second_best is None else (second_best - best_dist)
    if best_dist <= tolerance and (
        margin is None or margin >= min_margin or best_dist <= max(0.35, tolerance - 0.1)
    ):
        return best_id, best_dist
    return None, None


def average_embeddings(embeddings: list) -> list:
    if np is None:
        raise FaceLibNotAvailable("NumPy is required to average face embeddings.")
    if not embeddings:
        raise ValueError("No embeddings to average")
    arrs = [np.asarray(e, dtype=float) for e in embeddings]
    shapes = {a.shape for a in arrs}
    if len(shapes) != 1:
        raise ValueError("Embeddings have inconsistent shapes")
    avg = np.mean(np.vstack(arrs), axis=0)
    return avg.tolist()


def _ensure_opencv():
    if not HAS_OPENCV:
        raise FaceLibNotAvailable(
            "OpenCV fallback is not available in the active Python runtime. "
            f"{_runtime_hint()}"
        )


def _load_cv_image_from_file(file_obj):
    _ensure_opencv()
    data = file_obj.read()
    try:
        file_obj.seek(0)
    except Exception:
        pass
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Invalid image for OpenCV decoding.")
    return img


def _load_cv_image_from_path(path: str):
    _ensure_opencv()
    img = cv2.imread(path)
    if img is None:
        raise ValueError(f"Could not load stored face image: {path}")
    return img


def _extract_face_region(gray):
    _ensure_opencv()
    try:
        cascade_path = os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
        detector = cv2.CascadeClassifier(cascade_path)
        faces = detector.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(80, 80))
        if len(faces) > 0:
            x, y, w, h = max(faces, key=lambda item: item[2] * item[3])
            return gray[y:y + h, x:x + w]
    except Exception:
        pass
    return gray


def _face_signature(img):
    _ensure_opencv()
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.equalizeHist(gray)
    region = _extract_face_region(gray)
    region = cv2.resize(region, (160, 160))

    orb = cv2.ORB_create(nfeatures=256)
    _, orb_descriptors = orb.detectAndCompute(region, None)

    sift_descriptors = None
    if hasattr(cv2, "SIFT_create"):
        sift = cv2.SIFT_create(nfeatures=128)
        _, sift_descriptors = sift.detectAndCompute(region, None)

    hist = cv2.calcHist([region], [0], None, [32], [0, 256])
    hist = cv2.normalize(hist, hist).flatten()
    normalized = region.astype("float32") / 255.0
    edges = cv2.Canny(region, 60, 160).astype("float32") / 255.0
    return {
        "region": region,
        "normalized": normalized,
        "edges": edges,
        "orb": orb_descriptors,
        "sift": sift_descriptors,
        "hist": hist,
    }


def _mean_match_distance(matches, scale):
    if not matches:
        return 1.0
    matches = sorted(matches, key=lambda m: m.distance)[:25]
    return min(1.0, float(sum(m.distance for m in matches) / len(matches)) / scale)


def get_image_match_threshold(candidate_count: int) -> float:
    try:
        single_threshold = float(os.getenv("FACE_IMAGE_MATCH_THRESHOLD_SINGLE", "0.34"))
    except Exception:
        single_threshold = 0.34
    try:
        multi_threshold = float(os.getenv("FACE_IMAGE_MATCH_THRESHOLD_MULTI", "0.38"))
    except Exception:
        multi_threshold = 0.38

    single_threshold = max(0.2, min(0.6, single_threshold))
    multi_threshold = max(0.2, min(0.6, multi_threshold))
    return single_threshold if candidate_count <= 1 else multi_threshold


def match_face_image(probe_file_obj, candidates: list, threshold: float = 0.42):
    _ensure_opencv()
    if not candidates:
        return None, None

    probe_img = _load_cv_image_from_file(probe_file_obj)
    probe_sig = _face_signature(probe_img)

    orb_matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
    sift_matcher = cv2.BFMatcher(cv2.NORM_L2, crossCheck=True)
    best_user_id = None
    best_score = None
    second_best = None

    for user_id, image_path in candidates:
        try:
            cand_img = _load_cv_image_from_path(image_path)
            cand_sig = _face_signature(cand_img)

            hist_score = float(
                cv2.compareHist(
                    probe_sig["hist"].astype("float32"),
                    cand_sig["hist"].astype("float32"),
                    cv2.HISTCMP_BHATTACHARYYA,
                )
            )

            orb_score = 1.0
            if (
                probe_sig["orb"] is not None
                and cand_sig["orb"] is not None
                and len(probe_sig["orb"])
                and len(cand_sig["orb"])
            ):
                orb_score = _mean_match_distance(
                    orb_matcher.match(probe_sig["orb"], cand_sig["orb"]),
                    100.0,
                )

            sift_score = 1.0
            if (
                probe_sig["sift"] is not None
                and cand_sig["sift"] is not None
                and len(probe_sig["sift"])
                and len(cand_sig["sift"])
            ):
                sift_score = _mean_match_distance(
                    sift_matcher.match(probe_sig["sift"], cand_sig["sift"]),
                    300.0,
                )

            pixel_score = float(np.mean(np.abs(probe_sig["normalized"] - cand_sig["normalized"])))
            edge_score = float(np.mean(np.abs(probe_sig["edges"] - cand_sig["edges"])))

            score = (
                (hist_score * 0.20)
                + (orb_score * 0.20)
                + (sift_score * 0.25)
                + (pixel_score * 0.25)
                + (edge_score * 0.10)
            )
            if best_score is None or score < best_score:
                second_best = best_score
                best_user_id = user_id
                best_score = score
            elif second_best is None or score < second_best:
                second_best = score
        except Exception:
            continue

    try:
        min_margin = float(os.getenv("FACE_IMAGE_MATCH_MIN_MARGIN", "0.08"))
    except Exception:
        min_margin = 0.08
    min_margin = max(0.0, min(0.2, min_margin))

    margin = None if best_score is None or second_best is None else (second_best - best_score)
    if best_score is not None and best_score <= threshold and (
        margin is None or margin >= min_margin or best_score <= (threshold * 0.75)
    ):
        return best_user_id, best_score
    return None, best_score


def validate_face_image(file_obj):
    if HAS_FACE_LIB:
        data = file_obj.read()
        try:
            file_obj.seek(0)
        except Exception:
            pass
        img = face_recognition.load_image_file(BytesIO(data))
        locator = os.getenv("FACE_LOCATOR", "hog")
        boxes = face_recognition.face_locations(img, model=locator)
        if not boxes:
            raise ValueError("No face detected in the image.")
        if len(boxes) > 1:
            raise ValueError("Multiple faces detected. Please upload a single-face image.")
        return

    _ensure_opencv()
    img = _load_cv_image_from_file(file_obj)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    cascade_path = os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
    detector = cv2.CascadeClassifier(cascade_path)
    faces = detector.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(80, 80))
    if len(faces) == 0:
        raise ValueError("No face detected in the image.")
    if len(faces) > 1:
        raise ValueError("Multiple faces detected. Please upload a single-face image.")


def detect_face_count(file_obj) -> int:
    if HAS_FACE_LIB:
        data = file_obj.read()
        try:
            file_obj.seek(0)
        except Exception:
            pass
        img = face_recognition.load_image_file(BytesIO(data))
        locator = os.getenv("FACE_LOCATOR", "hog")
        boxes = face_recognition.face_locations(img, model=locator)
        return len(boxes)

    _ensure_opencv()
    img = _load_cv_image_from_file(file_obj)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    cascade_path = os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
    detector = cv2.CascadeClassifier(cascade_path)
    faces = detector.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(80, 80))
    return len(faces)
