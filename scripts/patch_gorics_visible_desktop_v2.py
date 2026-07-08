#!/usr/bin/env python3
from pathlib import Path

source_path = Path('scripts/patch_gorics_visible_desktop.py')
source = source_path.read_text(encoding='utf-8')
source = source.replace(
    r"pcmanfm/LXDE/desktop-items-0\.conf",
    r"pcmanfm/LXDE/pcmanfm\.conf",
)
namespace = {
    '__name__': '__main__',
    '__file__': str(source_path),
}
exec(compile(source, str(source_path), 'exec'), namespace)
