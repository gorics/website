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


def replace_meta(name: str, value: str) -> int:
    global html
    pattern = rf'(<meta name="{re.escape(name)}" content=")[^"]*(")'
    html, count = re.subn(pattern, rf"\g<1>{value}\g<2>", html, count=1)
    return count


build_meta_count = replace_meta("gorics-build", BUILD)
deployment_count = replace_meta(
    "gorics-deployment-marker",
    f"GORICS Real Multiboot {BUILD}",
)
verification_count = replace_meta("gorics-verification", VERIFICATION)

# Update every local cache-busting token without assuming which optional helpers are present.
html = re.sub(r"([?&]v=)[A-Za-z0-9._-]+", rf"\g<1>{BUILD}", html)
html = re.sub(
    r"(\[ready\] GORICS Real Multiboot )[A-Za-z0-9._-]+",
    rf"\g<1>{BUILD}",
    html,
)

if deployment_count != 1 or verification_count != 1:
    raise SystemExit(
        "index core meta patch failed "
        f"build={build_meta_count} deployment={deployment_count} verification={verification_count}"
    )

required = (
    BUILD,
    VERIFICATION,
    f"app.js?v={BUILD}",
    f"[ready] GORICS Real Multiboot {BUILD}",
)
missing = [marker for marker in required if marker not in html]
if missing:
    raise SystemExit(f"R12 index core markers missing: {missing}")

# Any optional local script or stylesheet with a version query must use the same build.
versioned_paths = re.findall(r'(?:src|href)="(\./[^"?]+\?v=([^"]+))"', html)
stale = [path for path, version in versioned_paths if version != BUILD]
if stale:
    raise SystemExit(f"stale index asset versions remain: {stale}")

INDEX.write_text(html, encoding="utf-8")
print(
    "published source markers "
    f"asset={ASSET_NAME} build={BUILD} verification={VERIFICATION} "
    f"versioned_assets={len(versioned_paths)}"
)
