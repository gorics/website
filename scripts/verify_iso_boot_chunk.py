#!/usr/bin/env python3
from pathlib import Path
import sys

path = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/v10-first-chunk.iso')
data = path.read_bytes()
if len(data) != 16 * 1024 * 1024:
    raise SystemExit(f'invalid chunk size: {len(data)}')
if data[32769:32774] != b'CD001':
    raise SystemExit('ISO9660 primary volume descriptor missing')
if data[34817:34822] != b'CD001' or b'EL TORITO' not in data[34823:34855]:
    raise SystemExit('El Torito boot descriptor missing')
print(f'ISO9660 and El Torito verified: {path}')
