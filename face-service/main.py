"""Serviço local de embedding/match facial.

Modos:
- opencv (padrão): YuNet + SFace (OpenCV Zoo) — leve e bom para LAN
- insightface: opcional se instalado (FACE_MODE=insightface)
"""

from __future__ import annotations

import base64
import os
import urllib.request
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

FACE_MODE = os.getenv("FACE_MODE", "opencv").lower()
MODEL_ROOT = Path(os.getenv("MODEL_ROOT", str(Path(__file__).resolve().parent / ".models")))
MODEL_ROOT.mkdir(parents=True, exist_ok=True)

YUNET_URL = (
    "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/"
    "face_detection_yunet_2023mar.onnx"
)
SFACE_URL = (
    "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/"
    "face_recognition_sface_2021dec.onnx"
)

app = FastAPI(title="Face Service", version="1.0.0")
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


def _download(url: str, dest: Path) -> Path:
    if dest.exists() and dest.stat().st_size > 1000:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    urllib.request.urlretrieve(url, tmp)
    tmp.replace(dest)
    return dest


def _decode_image(image_base64: str) -> np.ndarray:
    raw = image_base64.split(",", 1)[-1]
    data = base64.b64decode(raw)
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Imagem inválida")
    return img


def _init_opencv() -> None:
    global _detector, _recognizer, _haar
    yunet = _download(YUNET_URL, MODEL_ROOT / "face_detection_yunet_2023mar.onnx")
    sface = _download(SFACE_URL, MODEL_ROOT / "face_recognition_sface_2021dec.onnx")
    try:
        _detector = cv2.FaceDetectorYN.create(str(yunet), "", (320, 320), 0.7, 0.3)
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


def _embed_opencv(img: np.ndarray) -> list[float]:
    h, w = img.shape[:2]
    if _detector is not None and _recognizer is not None:
        _detector.setInputSize((w, h))
        _, faces = _detector.detect(img)
        if faces is None or len(faces) == 0:
            raise ValueError("Nenhum rosto detectado")
        # maior face
        faces = sorted(faces, key=lambda f: f[2] * f[3], reverse=True)
        face = faces[0]
        aligned = _recognizer.alignCrop(img, face)
        feat = _recognizer.feature(aligned)
        vec = np.asarray(feat).reshape(-1).astype(np.float32)
        return vec.tolist()

    # Fallback Haar + histograma LBP-ish
    assert _haar is not None
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces = _haar.detectMultiScale(gray, 1.1, 5, minSize=(60, 60))
    if len(faces) == 0:
        raise ValueError("Nenhum rosto detectado")
    x, y, fw, fh = max(faces, key=lambda f: f[2] * f[3])
    crop = gray[y : y + fh, x : x + fw]
    crop = cv2.resize(crop, (64, 64))
    hist = cv2.calcHist([crop], [0], None, [64], [0, 256]).flatten()
    hist = hist / (np.linalg.norm(hist) + 1e-8)
    flat = crop.astype(np.float32).flatten() / 255.0
    flat = flat / (np.linalg.norm(flat) + 1e-8)
    vec = np.concatenate([hist, flat]).astype(np.float32)
    return vec.tolist()


def _embed_insight(img: np.ndarray) -> list[float]:
    assert _insight is not None
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    faces = _insight.get(rgb)
    if not faces:
        raise ValueError("Nenhum rosto detectado")
    face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
    return face.normed_embedding.astype(np.float32).tolist()


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
    threshold: float = 0.45


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
    return {"ok": ready, "mode": mode}


@app.post("/embed")
def embed(body: EmbedIn) -> dict[str, Any]:
    try:
        mode = ensure_ready()
        img = _decode_image(body.image_base64)
        if mode == "insightface":
            vec = _embed_insight(img)
        else:
            vec = _embed_opencv(img)
        return {"ok": True, "embedding": vec, "faces": 1, "dim": len(vec), "mode": mode}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}


@app.post("/match")
def match(body: MatchIn) -> dict[str, Any]:
    try:
        query = np.asarray(body.embedding, dtype=np.float32)
        best = None
        best_score = -1.0
        for item in body.gallery:
            score = cosine_similarity(query, np.asarray(item.embedding, dtype=np.float32))
            if score > best_score:
                best_score = score
                best = item
        if best is None or best_score < body.threshold:
            return {"ok": True, "match": None, "best_score": best_score if best else None}
        return {
            "ok": True,
            "match": {
                "id": best.id,
                "customer_id": best.customer_id,
                "score": best_score,
            },
        }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc), "match": None}
