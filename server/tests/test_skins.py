"""The player's own asset packs (rhythm_server/skins.py, docs/CUSTOM_ASSETS.md)."""

from __future__ import annotations

import io
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from rhythm_server import skins
from rhythm_server.api.app import create_app

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture()
def data(tmp_path: Path) -> Path:
    d = tmp_path / "data"
    subprocess.run([sys.executable, str(ROOT / "scripts" / "assets" / "make_test_pack.py"), str(d / "skins")], check=True, capture_output=True)
    return d


@pytest.fixture()
def client(data: Path):
    with TestClient(create_app(data, client_dist=None, synchronous_jobs=True)) as c:
        yield c


def by_id(packs: list[dict]) -> dict[str, dict]:
    return {p["id"]: p for p in packs}


def test_packs_are_built_into_the_games_layouts(client: TestClient, data: Path) -> None:
    res = client.get("/api/skins")
    assert res.status_code == 200
    packs = by_id(res.json()["packs"])
    assert set(packs) == {"시험 팩", "broken", "sheet-only"}
    pack = packs["시험 팩"]
    assert pack["author"] == "코드"
    assert {k: v["status"] for k, v in pack["parts"].items()} == {"note": "ok", "panel": "ok", "hit": "ok"}
    # the panel came 3:2 (as ChatGPT gives): cropped, and said so
    assert any("잘랐습니다" in w for w in pack["parts"]["panel"]["warnings"])
    burst = pack["parts"]["hit"]["textures"]["hitBurst"]
    assert burst["flipbook"]["peak"] == 0 and burst["flipbook"]["frames"] == skins.BURST_FRAMES
    assert burst["flipbook"]["frames"] / burst["flipbook"]["fps"] == pytest.approx(skins.BURST_SECONDS + 1 / burst["flipbook"]["fps"], abs=0.01)
    assert burst["plain"] is True and burst["tone"].startswith("#ff")
    # every file in the size of the game's own picture it stands in for
    sizes = {"note.png": (1024, 256), "long.png": (512, 256), "panel.webp": (2048, 876), "hit_burst.webp": (1536, 1536), "hit_hold.webp": (1024, 1024)}
    for name, size in sizes.items():
        r = client.get(f"/api/skins/시험 팩/files/{name}")
        assert r.status_code == 200, name
        assert Image.open(io.BytesIO(r.content)).size == size
    # the note: a tint picture (red the lane colour, green toward white), see-through round the tap
    note = np.asarray(Image.open(io.BytesIO(client.get("/api/skins/시험 팩/files/note.png").content)))
    assert note[0, 0, 3] == 0 and note[128, 512, 3] == 255 and note[..., 2].max() == 0
    # the burst's first frame its brightest
    sheet = np.asarray(Image.open(io.BytesIO(client.get("/api/skins/시험 팩/files/hit_burst.webp").content)), np.float32)
    light = [sheet[(i // 4) * 384 : (i // 4 + 1) * 384, (i % 4) * 384 : (i % 4 + 1) * 384].mean() for i in range(10)]
    assert light[0] == max(light) and light[-1] < light[0] * 0.2
    # the pack's own files are not touched
    assert sorted(os.listdir(data / "skins" / "시험 팩")) == ["hit.png", "long.png", "note.png", "pack.json", "panel.png"]


def test_a_part_that_cannot_be_used_says_why(client: TestClient) -> None:
    packs = by_id(client.get("/api/skins").json()["packs"])
    broken = packs["broken"]["parts"]
    assert broken["note"]["status"] == "error" and "배경" in broken["note"]["message"]
    assert broken["panel"]["status"] == "error" and "비율" in broken["panel"]["message"]
    assert broken["hit"]["status"] == "error" and "검정" in broken["hit"]["message"]
    sheet_only = packs["sheet-only"]["parts"]
    assert sheet_only["panel"]["status"] == "missing"
    # a 4 x 4 sheet whose third frame is the brightest starts there
    assert sheet_only["hit"]["textures"]["hitBurst"]["flipbook"]["peak"] == 2
    # a see-through note is taken as it is
    assert sheet_only["note"]["status"] == "ok"
    assert client.get("/api/skins/broken/files/note.png").status_code == 404


def test_built_once_and_again_when_a_file_changes(client: TestClient, data: Path) -> None:
    first = by_id(client.get("/api/skins").json()["packs"])["시험 팩"]["parts"]["panel"]["key"]
    built = next((data / "cache" / "skins").glob("p-*/panel.webp"))
    stamp = built.stat().st_mtime_ns
    assert by_id(client.get("/api/skins").json()["packs"])["시험 팩"]["parts"]["panel"]["key"] == first
    assert built.stat().st_mtime_ns == stamp
    src = data / "skins" / "시험 팩" / "panel.png"
    Image.new("RGB", (2048, 876), (10, 20, 30)).save(src)
    again = by_id(client.get("/api/skins").json()["packs"])["시험 팩"]["parts"]["panel"]
    assert again["key"] != first and again["warnings"] == []


def test_a_pack_taken_away_is_taken_out_of_the_cache(client: TestClient, data: Path) -> None:
    import shutil

    client.get("/api/skins")
    assert (data / "cache" / "skins" / "sheet-only").is_dir()
    shutil.rmtree(data / "skins" / "sheet-only")
    assert "sheet-only" not in by_id(client.get("/api/skins").json()["packs"])
    assert not (data / "cache" / "skins" / "sheet-only").exists()
    assert client.get("/api/skins/sheet-only/files/note.png").status_code == 404


def test_only_pictures_of_the_packs_folder_are_read(client: TestClient, data: Path, tmp_path: Path) -> None:
    root = data / "skins"
    # a picture that is not one, an SVG and a script are not read as parts
    odd = root / "odd"
    odd.mkdir()
    (odd / "note.png").write_bytes(b"<svg xmlns='http://www.w3.org/2000/svg'/>")
    (odd / "panel.svg").write_text("<svg/>")
    (odd / "hit.png").write_text("#!/bin/sh\necho hi\n")
    parts = by_id(client.get("/api/skins").json()["packs"])["odd"]["parts"]
    assert parts["note"]["status"] == "error" and "그림" in parts["note"]["message"]
    assert parts["panel"]["status"] == "missing"
    assert parts["hit"]["status"] == "error"
    # a link to a folder or a picture outside is not followed
    outside = tmp_path / "outside"
    outside.mkdir()
    Image.new("RGB", (1200, 300), (255, 0, 255)).save(outside / "note.png")
    try:
        (root / "linked").symlink_to(outside, target_is_directory=True)
        (odd / "long.png").symlink_to(outside / "note.png")
    except (OSError, NotImplementedError):
        pytest.skip("no symlinks here")
    ids = set(by_id(client.get("/api/skins").json()["packs"]))
    assert "linked" not in ids
    # names that leave the folder, or files that are not a part's, are not served
    for path in ["/api/skins/../skins/files/note.png", "/api/skins/%2e%2e/files/note.png", "/api/skins/시험 팩/files/meta.json", "/api/skins/시험 팩/files/..%2fmeta.json", "/api/skins/linked/files/note.png"]:
        assert client.get(path).status_code == 404, path


def test_a_picture_too_large_is_not_decoded(tmp_path: Path, monkeypatch) -> None:
    big = tmp_path / "big.png"
    Image.new("L", (8000, 6000)).save(big)
    with pytest.raises(skins.PartError, match="너무 큽니다"):
        skins.load_picture(big)
    monkeypatch.setattr(skins, "MAX_BYTES", 10)
    with pytest.raises(skins.PartError, match="파일이 너무 큽니다"):
        skins.load_picture(big)


def test_layout_templates(client: TestClient) -> None:
    for kind, size in (("panel", (2048, 876)), ("note", (1024, 256))):
        r = client.get(f"/api/skins/templates/{kind}.png")
        assert r.status_code == 200
        assert Image.open(io.BytesIO(r.content)).size == size
    assert client.get("/api/skins/templates/x.png").status_code == 404
