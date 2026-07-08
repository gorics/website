#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

path = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/final-v2-iso-probe.bin")
data = path.read_bytes()
if len(data) != 4096:
    raise SystemExit(f"range probe size mismatch: {len(data)}")
if data[1:6] != b"CD001":
    raise SystemExit(f"primary ISO9660 descriptor missing: {data[1:6]!r}")
if data[2049:2054] != b"CD001":
    raise SystemExit(f"boot descriptor missing: {data[2049:2054]!r}")
if b"EL TORITO" not in data[2055:2087]:
    raise SystemExit(f"El Torito identifier missing: {data[2055:2087]!r}")
print(f"ISO9660 and El Torito verified from {path}")
