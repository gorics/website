#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path

APP = Path("os/real-multiboot/app.js")
INDEX = Path("os/real-multiboot/index.html")
ASSET_NAME = "gorics-linux-gui-web-i386-r12.iso"
BUILD = "20260708-r12-visible-desktop"

app = APP.read_text(encoding="utf-8")
app, count = re.subn(
    r"const assetName = '[^']+';",
    f"const assetName = '{ASSET_NAME}';",
    app,
    count=1,
)
if count != 1:
    raise SystemExit("assetName patch failed")
app = re.sub(
    r"const BUILD = '20260708-r(?:8-overlay-complete|12-visible-desktop)';",
    f"const BUILD = '{BUILD}';",
    app,
    count=1,
)
if ASSET_NAME not in app or BUILD not in app:
    raise SystemExit("R12 app markers missing")
APP.write_text(app, encoding="utf-8")

html = INDEX.read_text(encoding="utf-8")
html = re.sub(r"20260708-r(?:11-overlay-complete|12-visible-desktop)", BUILD, html)
html = html.replace(
    "overlay-hidden-running-controls-ready",
    "mapped-window-pixel-variance-ready",
)
if BUILD not in html or "mapped-window-pixel-variance-ready" not in html:
    raise SystemExit("R12 index markers missing")
INDEX.write_text(html, encoding="utf-8")
print(f"published source markers asset={ASSET_NAME} build={BUILD}")
