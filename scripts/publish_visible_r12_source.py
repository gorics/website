#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path

APP = Path("os/real-multiboot/app.js")
INDEX = Path("os/real-multiboot/index.html")
ASSET_NAME = "gorics-linux-gui-web-i386-r12.iso"
BUILD = "20260708-r12-visible-desktop"
VERIFICATION = "mapped-window-pixel-variance-ready-atomic-v86-native-xhr-webkit-safe"

app = APP.read_text(encoding="utf-8")
app, asset_count = re.subn(
    r"const assetName = '[^']+';",
    f"const assetName = '{ASSET_NAME}';",
    app,
    count=1,
)
app, build_count = re.subn(
    r"const BUILD = '[^']+';",
    f"const BUILD = '{BUILD}';",
    app,
    count=1,
)
if asset_count != 1 or build_count != 1:
    raise SystemExit(
        f"app marker patch failed asset_count={asset_count} build_count={build_count}"
    )
if ASSET_NAME not in app or BUILD not in app:
    raise SystemExit("R12 app markers missing")
APP.write_text(app, encoding="utf-8")

html = INDEX.read_text(encoding="utf-8")
html, meta_count = re.subn(
    r'(<meta name="gorics-build" content=")[^"]*(")',
    rf"\g<1>{BUILD}\g<2>",
    html,
    count=1,
)
html, deployment_count = re.subn(
    r'(<meta name="gorics-deployment-marker" content=")[^"]*(")',
    rf"\g<1>GORICS Real Multiboot {BUILD}\g<2>",
    html,
    count=1,
)
html, verification_count = re.subn(
    r'(<meta name="gorics-verification" content=")[^"]*(")',
    rf"\g<1>{VERIFICATION}\g<2>",
    html,
    count=1,
)
html = re.sub(r"([?&]v=)[A-Za-z0-9._-]+", rf"\g<1>{BUILD}", html)
html = re.sub(
    r"(\[ready\] GORICS Real Multiboot )[A-Za-z0-9._-]+",
    rf"\g<1>{BUILD}",
    html,
)
if meta_count != 1 or deployment_count != 1 or verification_count != 1:
    raise SystemExit(
        "index meta patch failed "
        f"build={meta_count} deployment={deployment_count} verification={verification_count}"
    )
required = (
    BUILD,
    VERIFICATION,
    f"app.js?v={BUILD}",
    f"asset-versioning.js?v={BUILD}",
    f"safe-diagnostics.js?v={BUILD}",
    f"[ready] GORICS Real Multiboot {BUILD}",
)
missing = [marker for marker in required if marker not in html]
if missing:
    raise SystemExit(f"R12 index markers missing: {missing}")
INDEX.write_text(html, encoding="utf-8")
print(
    f"published source markers asset={ASSET_NAME} build={BUILD} verification={VERIFICATION}"
)
