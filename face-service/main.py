"""Serviço local de embedding/match facial.

Modos:
- opencv (padrão): YuNet + SFace (OpenCV Zoo) — leve e bom para LAN
- insightface: opcional se instalado (FACE_MODE=insightface)
"""

from __future__ import annotations

import base64
import os
import threading
import urllib.request
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

FACE_MODE = os.getenv("FACE_MODE", "opencv").lower()
FACE_SERVICE_TOKEN = os.getenv("FACE_SERVICE_TOKEN", "").strip()
MODEL_ROOT = Path(os.getenv("MODEL_ROOT", str(Path(__file__).resolve().parent / ".models")))
MODEL_ROOT.mkdir(parents=True, exist_ok=True)

MIN_FACE_RATIO = float(os.getenv("MIN_FACE_RATIO", "0.06"))
MIN_BLUR = float(os.getenv("MIN_BLUR", "40.0"))
MATCH_MARGIN = float(os.getenv("MATCH_MARGIN", "0.05"))
YUNET_SCORE = float(os.getenv("YUNET_SCORE", "0.45"))

YUNET_URL = (
    "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/"
    "face_detection_yunet_2023mar.onnx"
)
SFACE_URL = (
    "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/"
    "face_recognition_sface_2021dec.onnx"
)

app = FastAPI(title="Face Service", version="1.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_detector = None
_recognizer = None
_insight = None
_haar = None
# YuNet/SFace não são thread-safe — lock evita segfault sob carga
_opencv_lock = threading.Lock()


class FaceQualityError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def _download(url: str, dest: Path) -> Path:
    if dest.exists() and dest.stat().st_size > 1000:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    urllib.request.urlretrieve(url, tmp)
    tmp.replace(dest)
    return dest


def _decode_image(image_base64: str) -> np.ndarray:
    if not image_base64 or len(image_base64.strip()) < 32:
        raise ValueError("Imagem vazia ou inválida")
    raw = image_base64.split(",", 1)[-1].strip()
    try:
        data = base64.b64decode(raw, validate=True)
    except Exception as exc:
        raise ValueError("Base64 inválido") from exc
    if len(data) < 100 or len(data) > 15_000_000:
        raise ValueError("Tamanho de imagem inválido")
    if not (data[:3] == b"\xff\xd8\xff" or data[:4] == b"\x89PNG"):
        raise ValueError("Formato não suportado — use JPEG")
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None or img.size == 0:
        raise ValueError("JPEG corrompido ou ilegível")
    h, w = img.shape[:2]
    if h < 32 or w < 32:
        raise ValueError("Imagem muito pequena")
    return img


def _preprocess(img: np.ndarray) -> np.ndarray:
    """CLAHE no canal L para melhorar contraste em webcams/DroidCam."""
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l2 = clahe.apply(l)
    return cv2.cvtColor(cv2.merge([l2, a, b]), cv2.COLOR_LAB2BGR)


def _rotate(img: np.ndarray, degrees: int) -> np.ndarray:
    if degrees == 0:
        return img
    if degrees == 90:
        return cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
    if degrees == 180:
        return cv2.rotate(img, cv2.ROTATE_180)
    if degrees == 270:
        return cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)
    return img


def _blur_score(img: np.ndarray) -> float:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def _init_opencv(force: bool = False) -> None:
    global _detector, _recognizer, _haar
    if force:
        _detector = None
        _recognizer = None
        _haar = None
    yunet = _download(YUNET_URL, MODEL_ROOT / "face_detection_yunet_2023mar.onnx")
    sface = _download(SFACE_URL, MODEL_ROOT / "face_recognition_sface_2021dec.onnx")
    try:
        _detector = cv2.FaceDetectorYN.create(str(yunet), "", (320, 320), YUNET_SCORE, 0.3)
        _recognizer = cv2.FaceRecognizerSF.create(str(sface), "")
    except Exception:
        _detector = None
        _recognizer = None
        _haar = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")


def _init_insight() -> None:
    global _insight
    import insightface
    from insightface.app import FaceAnalysis

    app_face = FaceAnalysis(name="buffalo_s", root=str(MODEL_ROOT), providers=["CPUExecutionProvider"])
    app_face.prepare(ctx_id=-1, det_size=(640, 640))
    _insight = app_face


def ensure_ready() -> str:
    if FACE_MODE == "insightface":
        if _insight is None:
            _init_insight()
        return "insightface"
    if _detector is None and _haar is None:
        _init_opencv()
    return "opencv"


def _detect_yunet(img: np.ndarray) -> tuple[np.ndarray | None, float]:
    """Retorna (face_row, score_area) ou (None, 0). Caller must hold _opencv_lock."""
    assert _detector is not None
    h, w = img.shape[:2]
    if w % 2:
        w -= 1
    if h % 2:
        h -= 1
    if w < 32 or h < 32:
        return None, 0.0
    frame = img[:h, :w]
    _detector.setInputSize((w, h))
    _, faces = _detector.detect(frame)
    if faces is None or len(faces) == 0:
        return None, 0.0
    best = max(faces, key=lambda f: float(f[2] * f[3]) * float(f[14] if len(f) > 14 else 1.0))
    area = float(best[2] * best[3])
    det_score = float(best[14]) if len(best) > 14 else 1.0
    return best, area * det_score


def _pick_orientation(img: np.ndarray) -> tuple[np.ndarray, int, Any, float]:
    """Escolhe rotação 0/90/180/270 com melhor detecção de face."""
    best_img = img
    best_rot = 0
    best_face = None
    best_metric = -1.0

    for rot in (0, 90, 180, 270):
        candidate = _rotate(img, rot)
        if _detector is not None:
            face, metric = _detect_yunet(candidate)
            if face is not None and metric > best_metric:
                best_metric = metric
                best_img = candidate
                best_rot = rot
                best_face = face
        else:
            gray = cv2.cvtColor(candidate, cv2.COLOR_BGR2GRAY)
            assert _haar is not None
            faces = _haar.detectMultiScale(gray, 1.1, 5, minSize=(60, 60))
            if len(faces) == 0:
                continue
            x, y, fw, fh = max(faces, key=lambda f: f[2] * f[3])
            metric = float(fw * fh)
            if metric > best_metric:
                best_metric = metric
                best_img = candidate
                best_rot = rot
                best_face = (x, y, fw, fh)

    if best_face is None:
        raise FaceQualityError("no_face", "Nenhum rosto detectado")
    return best_img, best_rot, best_face, best_metric


def _check_quality(img: np.ndarray, face: Any, blur: float) -> dict[str, Any]:
    h, w = img.shape[:2]
    min_dim = float(min(h, w))
    if hasattr(face, "__len__") and len(face) >= 4:
        fw, fh = float(face[2]), float(face[3])
        fx, fy = float(face[0]), float(face[1])
    else:
        raise FaceQualityError("no_face", "Nenhum rosto detectado")

    face_ratio = (fw * fh) ** 0.5 / min_dim
    if face_ratio < MIN_FACE_RATIO:
        raise FaceQualityError(
            "face_too_small",
            f"Rosto muito pequeno ({face_ratio:.0%}). Aproxime a câmera.",
        )
    if blur < MIN_BLUR:
        raise FaceQualityError(
            "face_blurry",
            f"Imagem borrada (nitidez {blur:.0f}). Segure firme e melhore a luz.",
        )

    quality = min(1.0, max(0.0, (face_ratio - MIN_FACE_RATIO) / 0.25)) * 0.6
    quality += min(1.0, blur / 200.0) * 0.4

    return {
        "face_ratio": round(face_ratio, 4),
        "blur": round(blur, 2),
        "quality": round(quality, 3),
        "face_box": {
            "x": round(fx, 1),
            "y": round(fy, 1),
            "w": round(fw, 1),
            "h": round(fh, 1),
        },
    }


def _embed_opencv(img: np.ndarray) -> tuple[list[float], dict[str, Any]]:
    processed = _preprocess(img)
    with _opencv_lock:
        oriented, rotation, face, _metric = _pick_orientation(processed)
        blur = _blur_score(oriented)
        meta = _check_quality(oriented, face, blur)
        meta["rotation_used"] = rotation

        if _detector is not None and _recognizer is not None:
            aligned = _recognizer.alignCrop(oriented, face)
            feat = _recognizer.feature(aligned)
            vec = np.asarray(feat).reshape(-1).astype(np.float32)
            return vec.tolist(), meta

        # Fallback Haar
        assert _haar is not None
        x, y, fw, fh = face  # type: ignore[misc]
        gray = cv2.cvtColor(oriented, cv2.COLOR_BGR2GRAY)
        crop = gray[int(y) : int(y + fh), int(x) : int(x + fw)]
        crop = cv2.resize(crop, (64, 64))
        hist = cv2.calcHist([crop], [0], None, [64], [0, 256]).flatten()
        hist = hist / (np.linalg.norm(hist) + 1e-8)
        flat = crop.astype(np.float32).flatten() / 255.0
        flat = flat / (np.linalg.norm(flat) + 1e-8)
        vec = np.concatenate([hist, flat]).astype(np.float32)
        return vec.tolist(), meta


def _embed_insight(img: np.ndarray) -> tuple[list[float], dict[str, Any]]:
    assert _insight is not None
    processed = _preprocess(img)
    best_vec = None
    best_meta: dict[str, Any] = {}
    best_area = -1.0
    best_rot = 0

    for rot in (0, 90, 180, 270):
        candidate = _rotate(processed, rot)
        rgb = cv2.cvtColor(candidate, cv2.COLOR_BGR2RGB)
        faces = _insight.get(rgb)
        if not faces:
            continue
        face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
        area = float((face.bbox[2] - face.bbox[0]) * (face.bbox[3] - face.bbox[1]))
        if area <= best_area:
            continue
        best_area = area
        best_rot = rot
        best_vec = face.normed_embedding.astype(np.float32).tolist()
        h, w = candidate.shape[:2]
        fw = float(face.bbox[2] - face.bbox[0])
        fh = float(face.bbox[3] - face.bbox[1])
        blur = _blur_score(candidate)
        face_ratio = (fw * fh) ** 0.5 / float(min(h, w))
        if face_ratio < MIN_FACE_RATIO:
            continue
        if blur < MIN_BLUR:
            continue
        best_meta = {
            "face_ratio": round(face_ratio, 4),
            "blur": round(blur, 2),
            "quality": round(min(1.0, face_ratio / 0.3) * 0.6 + min(1.0, blur / 200.0) * 0.4, 3),
            "face_box": {
                "x": round(float(face.bbox[0]), 1),
                "y": round(float(face.bbox[1]), 1),
                "w": round(fw, 1),
                "h": round(fh, 1),
            },
            "rotation_used": best_rot,
        }

    if best_vec is None:
        raise FaceQualityError("no_face", "Nenhum rosto detectado")
    if not best_meta:
        raise FaceQualityError("low_quality", "Rosto detectado com qualidade insuficiente")
    return best_vec, best_meta


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    a = a.astype(np.float32).reshape(-1)
    b = b.astype(np.float32).reshape(-1)
    denom = (np.linalg.norm(a) * np.linalg.norm(b)) + 1e-8
    return float(np.dot(a, b) / denom)


class EmbedIn(BaseModel):
    image_base64: str = Field(..., min_length=32)


class GalleryItem(BaseModel):
    id: str
    customer_id: str
    embedding: list[float]


class MatchIn(BaseModel):
    embedding: list[float]
    gallery: list[GalleryItem]
    threshold: float = 0.38
    margin: float = MATCH_MARGIN


@app.on_event("startup")
def startup() -> None:
    try:
        ensure_ready()
    except Exception as exc:  # noqa: BLE001
        print(f"[face-service] init warning: {exc}")


@app.get("/health")
def health() -> dict[str, Any]:
    mode = FACE_MODE
    ready = True
    try:
        mode = ensure_ready()
    except Exception as exc:  # noqa: BLE001
        ready = False
        return {"ok": False, "mode": mode, "error": str(exc)}
    return {"ok": ready, "mode": mode, "version": "1.1.0", "auth": bool(FACE_SERVICE_TOKEN)}


def _require_token(authorization: str | None) -> None:
    """Se FACE_SERVICE_TOKEN estiver definido, exige Bearer igual (embed/match)."""
    if not FACE_SERVICE_TOKEN:
        return
    expected = f"Bearer {FACE_SERVICE_TOKEN}"
    if not authorization or authorization.strip() != expected:
        raise HTTPException(status_code=401, detail="Token do face-service inválido")


@app.post("/embed")
def embed(
    body: EmbedIn,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    _require_token(authorization)
    try:
        mode = ensure_ready()
        img = _decode_image(body.image_base64)
        if mode == "insightface":
            vec, meta = _embed_insight(img)
        else:
            vec, meta = _embed_opencv(img)
        return {
            "ok": True,
            "embedding": vec,
            "faces": 1,
            "dim": len(vec),
            "mode": mode,
            **meta,
        }
    except FaceQualityError as exc:
        return {"ok": False, "error": str(exc), "code": exc.code}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc), "code": "error"}


@app.post("/match")
def match(
    body: MatchIn,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    _require_token(authorization)
    try:
        query = np.asarray(body.embedding, dtype=np.float32)
        # Melhor score por customer_id
        best_by_customer: dict[str, dict[str, Any]] = {}
        for item in body.gallery:
            score = cosine_similarity(query, np.asarray(item.embedding, dtype=np.float32))
            prev = best_by_customer.get(item.customer_id)
            if prev is None or score > prev["score"]:
                best_by_customer[item.customer_id] = {
                    "id": item.id,
                    "customer_id": item.customer_id,
                    "score": score,
                }

        ranked = sorted(best_by_customer.values(), key=lambda x: x["score"], reverse=True)
        if not ranked:
            return {"ok": True, "match": None, "best_score": None, "second_score": None}

        best = ranked[0]
        second_score = ranked[1]["score"] if len(ranked) > 1 else None
        best_score = float(best["score"])
        margin = body.margin if body.margin is not None else MATCH_MARGIN

        if best_score < body.threshold:
            return {
                "ok": True,
                "match": None,
                "best_score": best_score,
                "best_customer_id": best["customer_id"],
                "second_score": second_score,
                "reason": "below_threshold",
            }

        if second_score is not None and (best_score - float(second_score)) < margin:
            return {
                "ok": True,
                "match": None,
                "best_score": best_score,
                "best_customer_id": best["customer_id"],
                "second_score": second_score,
                "reason": "ambiguous",
            }

        return {
            "ok": True,
            "match": {
                "id": best["id"],
                "customer_id": best["customer_id"],
                "score": best_score,
            },
            "best_score": best_score,
            "second_score": second_score,
        }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc), "match": None}
