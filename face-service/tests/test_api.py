"""Testes do face-service: health, qualidade, rotação e match com margem."""

from __future__ import annotations

import base64
import sys
from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from main import (  # noqa: E402
    FaceQualityError,
    _check_quality,
    _rotate,
    app,
    cosine_similarity,
)

client = TestClient(app)


def _b64_jpeg(img: np.ndarray, quality: int = 90) -> str:
    ok, buf = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    assert ok
    return base64.b64encode(buf.tobytes()).decode("ascii")


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert "ok" in body
    assert "mode" in body


def test_embed_invalid_image():
    res = client.post("/embed", json={"image_base64": "a" * 64})
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is False
    assert "error" in body


def test_embed_blank_image_no_face():
    img = np.full((240, 320, 3), 180, dtype=np.uint8)
    res = client.post("/embed", json={"image_base64": _b64_jpeg(img)})
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is False
    assert body.get("code") in ("no_face", "error", "low_quality", "face_too_small", "face_blurry")


def test_match_empty_gallery():
    res = client.post(
        "/match",
        json={"embedding": [0.1] * 128, "gallery": [], "threshold": 0.38},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["match"] is None


def test_cosine_similarity_identical():
    a = np.array([1.0, 0.0, 0.0], dtype=np.float32)
    score = cosine_similarity(a, a)
    assert score > 0.99


def test_rotate_shapes():
    img = np.zeros((100, 200, 3), dtype=np.uint8)
    assert _rotate(img, 0).shape == (100, 200, 3)
    assert _rotate(img, 90).shape == (200, 100, 3)
    assert _rotate(img, 180).shape == (100, 200, 3)
    assert _rotate(img, 270).shape == (200, 100, 3)


def test_quality_rejects_small_face():
    img = np.zeros((400, 400, 3), dtype=np.uint8)
    face = np.array([10, 10, 8, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.9], dtype=np.float32)
    with pytest.raises(FaceQualityError) as exc:
        _check_quality(img, face, blur=200.0)
    assert exc.value.code == "face_too_small"


def test_quality_rejects_blurry():
    img = np.zeros((400, 400, 3), dtype=np.uint8)
    # face ~20% of min dim → ratio ok
    face = np.array([50, 50, 120, 120, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.9], dtype=np.float32)
    with pytest.raises(FaceQualityError) as exc:
        _check_quality(img, face, blur=5.0)
    assert exc.value.code == "face_blurry"


def test_quality_accepts_good_face():
    img = np.zeros((400, 400, 3), dtype=np.uint8)
    face = np.array([50, 50, 120, 120, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.9], dtype=np.float32)
    meta = _check_quality(img, face, blur=150.0)
    assert meta["quality"] > 0.2
    assert "face_box" in meta


def _unit(v: list[float]) -> list[float]:
    a = np.asarray(v, dtype=np.float32)
    return (a / (np.linalg.norm(a) + 1e-8)).tolist()


def test_match_by_customer_picks_best_embedding():
    query = _unit([1.0, 0.0, 0.0, 0.0])
    gallery = [
        {"id": "e1", "customer_id": "c1", "embedding": _unit([0.9, 0.1, 0.0, 0.0])},
        {"id": "e2", "customer_id": "c1", "embedding": _unit([0.2, 0.8, 0.0, 0.0])},
        {"id": "e3", "customer_id": "c2", "embedding": _unit([0.0, 1.0, 0.0, 0.0])},
    ]
    res = client.post(
        "/match",
        json={"embedding": query, "gallery": gallery, "threshold": 0.5, "margin": 0.05},
    )
    body = res.json()
    assert body["ok"] is True
    assert body["match"] is not None
    assert body["match"]["customer_id"] == "c1"
    assert body["match"]["id"] == "e1"


def test_match_rejects_below_threshold():
    query = _unit([1.0, 0.0, 0.0])
    gallery = [
        {"id": "e1", "customer_id": "c1", "embedding": _unit([0.5, 0.5, 0.0])},
    ]
    res = client.post(
        "/match",
        json={"embedding": query, "gallery": gallery, "threshold": 0.95, "margin": 0.05},
    )
    body = res.json()
    assert body["match"] is None
    assert body["reason"] == "below_threshold"
    assert body["best_score"] is not None
    assert body["best_customer_id"] == "c1"


def test_match_rejects_ambiguous_margin():
    query = _unit([1.0, 0.0, 0.0])
    # dois clientes quase empatados
    gallery = [
        {"id": "e1", "customer_id": "c1", "embedding": _unit([0.99, 0.1, 0.0])},
        {"id": "e2", "customer_id": "c2", "embedding": _unit([0.98, 0.15, 0.0])},
    ]
    res = client.post(
        "/match",
        json={"embedding": query, "gallery": gallery, "threshold": 0.5, "margin": 0.05},
    )
    body = res.json()
    assert body["match"] is None
    assert body["reason"] == "ambiguous"
    assert body["second_score"] is not None
