#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import math
import shutil
import sys
from pathlib import Path

ASSET_NAME = "gorics-linux-gui-web-i386-r12.iso"
CHUNK_SIZE = 16 * 1024 * 1024


def digest(path: Path) -> str:
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def part_name(start: int, end: int) -> str:
    asset = Path(ASSET_NAME)
    return f"{asset.stem}-{start}-{end}{asset.suffix}"


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: build_visible_r12_bundle.py ISO BUNDLE_DIR")
    iso = Path(sys.argv[1]).resolve()
    bundle = Path(sys.argv[2]).resolve()
    if not iso.is_file() or iso.stat().st_size <= 0:
        raise SystemExit(f"missing ISO: {iso}")
    kernel = bundle / "vmlinuz"
    initrd = bundle / "initrd.img"
    if kernel.stat().st_size <= 1_000_000:
        raise SystemExit("kernel is too small")
    if initrd.stat().st_size <= 10_000_000:
        raise SystemExit("initrd is too small")

    parts = bundle / "v86-parts"
    if parts.exists():
        shutil.rmtree(parts)
    parts.mkdir(parents=True)

    size = iso.stat().st_size
    count = 0
    start = 0
    with iso.open("rb") as source:
        while start < size:
            data = source.read(CHUNK_SIZE)
            if len(data) < CHUNK_SIZE:
                data += bytes(CHUNK_SIZE - len(data))
            end = start + CHUNK_SIZE
            output = parts / part_name(start, end)
            output.write_bytes(data)
            if output.stat().st_size != CHUNK_SIZE:
                raise SystemExit(f"invalid chunk size: {output}")
            count += 1
            start = end

    expected = math.ceil(size / CHUNK_SIZE)
    if count != expected:
        raise SystemExit(f"chunk count mismatch {count} != {expected}")
    first = parts / part_name(0, CHUNK_SIZE)
    final_start = (count - 1) * CHUNK_SIZE
    final = parts / part_name(final_start, final_start + CHUNK_SIZE)
    if not first.is_file() or not final.is_file():
        raise SystemExit("first or final app-compatible chunk is missing")

    meta = {
        "name": ASSET_NAME,
        "source_release_name": iso.name,
        "architecture": "i386",
        "desktop": "openbox-tint2-pcmanfm-xterm-visible-r12",
        "direct_boot": True,
        "chunked": True,
        "chunk_size": CHUNK_SIZE,
        "parts": count,
        "size": size,
        "sha256": digest(iso),
        "chunk_pattern": f"{Path(ASSET_NAME).stem}-{{start}}-{{end}}{Path(ASSET_NAME).suffix}",
        "first_chunk": first.name,
        "final_chunk": final.name,
        "visible_window_required": True,
        "visible_window_marker": "GORICS_VISIBLE_WINDOW_READY",
        "mapped_window_title": "GORICS Control Center",
        "pixel_variance_required": True,
        "kernel": {
            "name": kernel.name,
            "size": kernel.stat().st_size,
            "sha256": digest(kernel),
        },
        "initrd": {
            "name": initrd.name,
            "size": initrd.stat().st_size,
            "sha256": digest(initrd),
        },
        "release": "r12-visible-desktop",
    }
    (bundle / "iso-meta.json").write_text(
        json.dumps(meta, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
