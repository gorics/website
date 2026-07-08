#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import math
import re
import sys
from pathlib import Path

SECTOR = 2048
ISO_NAME = "gorics-linux-gui-web-i386.iso"
CHUNK_SIZE = 16 * 1024 * 1024


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def directory_entries(source, extent: int, size: int):
    source.seek(extent * SECTOR)
    data = source.read(size)
    offset = 0
    while offset < len(data):
        length = data[offset]
        if length == 0:
            offset = ((offset // SECTOR) + 1) * SECTOR
            continue
        record = data[offset : offset + length]
        name_length = record[32]
        name = record[33 : 33 + name_length].decode("latin1")
        yield {
            "name": name,
            "extent": int.from_bytes(record[2:6], "little"),
            "size": int.from_bytes(record[10:14], "little"),
            "flags": record[25],
        }
        offset += length


def find_entry(entries, *names: str):
    wanted = {name.upper() for name in names}
    for entry in entries:
        normalized = entry["name"].upper().split(";", 1)[0].rstrip(".")
        if normalized in wanted:
            return entry
    raise RuntimeError(f"ISO entry not found: {names}")


def extract_live_boot_files(iso: Path, destination: Path) -> tuple[Path, Path]:
    with iso.open("rb") as source:
        source.seek(16 * SECTOR)
        pvd = source.read(SECTOR)
        if pvd[1:6] != b"CD001":
            raise RuntimeError("ISO9660 primary descriptor missing")

        root_record_length = pvd[156]
        root = pvd[156 : 156 + root_record_length]
        root_extent = int.from_bytes(root[2:6], "little")
        root_size = int.from_bytes(root[10:14], "little")
        live = find_entry(directory_entries(source, root_extent, root_size), "LIVE")
        live_entries = list(directory_entries(source, live["extent"], live["size"]))
        kernel_entry = find_entry(live_entries, "VMLINUZ")
        initrd_entry = find_entry(live_entries, "INITRD.IMG")

        outputs = []
        for output_name, entry in (("vmlinuz", kernel_entry), ("initrd.img", initrd_entry)):
            source.seek(entry["extent"] * SECTOR)
            data = source.read(entry["size"])
            if len(data) != entry["size"]:
                raise RuntimeError(f"short ISO read for {output_name}")
            output = destination / output_name
            output.write_bytes(data)
            outputs.append(output)

    return outputs[0], outputs[1]


def patch_loader(app: Path) -> None:
    text = app.read_text(encoding="utf-8")
    text = text.replace("gorics-linux-gui-web-amd64.iso", ISO_NAME)

    meta_line = "  const metaUrl = new URL('./assets/iso-meta.json', location.href).href;"
    direct_lines = (
        meta_line
        + "\n  const kernelUrl = new URL('./assets/vmlinuz', location.href).href;"
        + "\n  const initrdUrl = new URL('./assets/initrd.img', location.href).href;"
    )
    if "const kernelUrl" not in text:
        if meta_line not in text:
            raise RuntimeError("metadata URL declaration missing")
        text = text.replace(meta_line, direct_lines, 1)

    old_boot = "        boot_order: 0x123,"
    direct_boot = (
        "        bzimage: { url: kernelUrl },\n"
        "        initrd: { url: initrdUrl },\n"
        "        cmdline: 'boot=live components live-media=/dev/sr0 username=user "
        "hostname=gorics-web systemd.unit=graphical.target console=tty0',"
    )
    if "bzimage: { url: kernelUrl }" not in text:
        if old_boot not in text:
            raise RuntimeError("boot order declaration missing")
        text = text.replace(old_boot, direct_boot, 1)

    text = text.replace(
        "v86 started with keyboard, mouse and touch bridge",
        "v86 started with direct i386 kernel, initrd, ISO and input bridge",
    )

    if "gorics-linux-gui-web-amd64.iso" in text:
        raise RuntimeError("amd64 ISO reference remains")
    for required in (ISO_NAME, "bzimage", "initrdUrl", "systemd.unit=graphical.target"):
        if required not in text:
            raise RuntimeError(f"loader patch missing: {required}")

    app.write_text(text, encoding="utf-8")


def patch_index(index: Path) -> None:
    text = index.read_text(encoding="utf-8")
    text = re.sub(r"([?&]v=)[A-Za-z0-9._-]+", r"\1l", text)
    text = re.sub(r"(ISO page\. )[A-Za-z0-9._-]+", r"\1l", text)
    required = (
        "app.js?v=l",
        "responsive-overrides.css?v=l",
        "responsive.js?v=l",
        "ISO page. l",
    )
    missing = [marker for marker in required if marker not in text]
    if missing:
        raise RuntimeError(f"index deployment patch failed: {missing}")
    index.write_text(text, encoding="utf-8")


def main() -> None:
    site = Path(sys.argv[1] if len(sys.argv) > 1 else "_site").resolve()
    page = site / "os" / "real-multiboot"
    assets = page / "assets"
    iso = assets / ISO_NAME
    app = page / "app.js"
    index = page / "index.html"
    meta_path = assets / "iso-meta.json"

    for required in (iso, app, index, meta_path):
        if not required.is_file():
            raise RuntimeError(f"missing deployment input: {required}")

    kernel, initrd = extract_live_boot_files(iso, assets)
    patch_loader(app)
    patch_index(index)

    iso_size = iso.stat().st_size
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    meta.update(
        {
            "name": ISO_NAME,
            "architecture": "i386",
            "direct_boot": True,
            "desktop": "openbox-tint2-pcmanfm-xterm",
            "complete_ui_verified": True,
            "chunked": True,
            "chunk_size": CHUNK_SIZE,
            "parts": math.ceil(iso_size / CHUNK_SIZE),
            "size": iso_size,
            "kernel": {"name": kernel.name, "size": kernel.stat().st_size, "sha256": sha256(kernel)},
            "initrd": {"name": initrd.name, "size": initrd.stat().st_size, "sha256": sha256(initrd)},
        }
    )
    meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")

    print(json.dumps(meta, indent=2))
    print(f"direct loader: {app}")
    print(f"kernel: {kernel.stat().st_size} bytes")
    print(f"initrd: {initrd.stat().st_size} bytes")
    print(f"ISO chunks: {meta['parts']} x {CHUNK_SIZE} bytes")


if __name__ == "__main__":
    main()
