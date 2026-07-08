#!/usr/bin/env bash
set -euo pipefail

SITE_DIR="${1:-_site}"
DEPLOY_VERSION="${DEPLOY_VERSION:?DEPLOY_VERSION is required}"

rm -rf "$SITE_DIR"
python3 - "$SITE_DIR" <<'PY'
import pathlib
import shutil
import sys

source = pathlib.Path('.')
target = pathlib.Path(sys.argv[1])
shutil.copytree(source, target, ignore=shutil.ignore_patterns('.git', target.name))
(target / '.nojekyll').write_text('', encoding='utf-8')
PY

mkdir -p "$SITE_DIR/vendor/v86/images" "$SITE_DIR/os/real-multiboot/assets"

download() {
  local url="$1"
  local output="$2"
  echo "download $url -> $output"
  curl -fL --retry 5 --retry-all-errors --connect-timeout 20 --max-time 900 \
    -o "$output.tmp" "$url"
  test -s "$output.tmp"
  mv "$output.tmp" "$output"
}

download 'https://copy.sh/v86/build/libv86.js' "$SITE_DIR/vendor/v86/libv86.js"
download 'https://copy.sh/v86/build/v86.wasm' "$SITE_DIR/vendor/v86/v86.wasm"
download 'https://copy.sh/v86/bios/seabios.bin' "$SITE_DIR/vendor/v86/seabios.bin"
download 'https://copy.sh/v86/bios/vgabios.bin' "$SITE_DIR/vendor/v86/vgabios.bin"
download 'https://i.copy.sh/buildroot-bzimage68.bin' "$SITE_DIR/vendor/v86/images/buildroot-bzimage68.bin"
download 'https://i.copy.sh/linux4.iso' "$SITE_DIR/vendor/v86/images/linux4.iso"
download 'https://i.copy.sh/linux.iso' "$SITE_DIR/vendor/v86/images/linux.iso"
download 'https://i.copy.sh/freedos722.img' "$SITE_DIR/vendor/v86/images/freedos722.img"

# The release tag is intentionally not required here. The verified direct-boot
# kernel, initrd and chunk metadata are versioned in the repository, while the
# 339 MB ISO is served as range-addressable chunks from the os-assets branch.
python3 - "$SITE_DIR" <<'PY'
import hashlib
import json
import pathlib
import sys

site = pathlib.Path(sys.argv[1])
assets = site / 'os' / 'real-multiboot' / 'assets'
meta_path = assets / 'iso-meta.json'
kernel = assets / 'vmlinuz'
initrd = assets / 'initrd.img'
for required in (meta_path, kernel, initrd):
    if not required.is_file() or required.stat().st_size == 0:
        raise SystemExit(f'missing repository-pinned boot asset: {required}')
meta = json.loads(meta_path.read_text(encoding='utf-8'))
if meta.get('architecture') != 'i386' or not meta.get('chunked') or not meta.get('direct_boot'):
    raise SystemExit(f'invalid ISO metadata: {meta}')
for path, key in ((kernel, 'kernel'), (initrd, 'initrd')):
    expected = meta[key]
    data = path.read_bytes()
    actual_hash = hashlib.sha256(data).hexdigest()
    if len(data) != int(expected['size']) or actual_hash != expected['sha256']:
        raise SystemExit(
            f'{path.name} integrity mismatch size={len(data)} sha256={actual_hash} expected={expected}'
        )
print('repository-pinned direct boot assets verified', meta['sha256'])
PY

python3 - "$SITE_DIR" "$DEPLOY_VERSION" <<'PY'
import hashlib
import json
import pathlib
import re
import sys

site = pathlib.Path(sys.argv[1])
version = sys.argv[2]
page = site / 'os' / 'real-multiboot'
index = page / 'index.html'
app = page / 'app.js'

html = index.read_text(encoding='utf-8')
html = re.sub(r'([?&]v=)[A-Za-z0-9._-]+', lambda m: m.group(1) + version, html)
html = re.sub(r'(<meta name="gorics-build" content=")[^"]*', lambda m: m.group(1) + version, html)
html = re.sub(
    r'(<meta name="gorics-deployment-marker" content=")[^"]*',
    lambda m: m.group(1) + 'GORICS Real Multiboot ' + version,
    html,
)
html = re.sub(
    r'(\[ready\] GORICS Real Multiboot )[A-Za-z0-9._-]+',
    lambda m: m.group(1) + version,
    html,
)
index.write_text(html, encoding='utf-8')

app_text = app.read_text(encoding='utf-8')
app_text, count = re.subn(
    r"const BUILD = '[^']+';",
    f"const BUILD = '{version}';",
    app_text,
    count=1,
)
if count != 1:
    raise SystemExit('app BUILD constant was not updated exactly once')
app.write_text(app_text, encoding='utf-8')

runtime_root = site / 'vendor' / 'v86'
manifest = {'version': version, 'files': {}}
for name in ('libv86.js', 'v86.wasm', 'seabios.bin', 'vgabios.bin'):
    data = (runtime_root / name).read_bytes()
    manifest['files'][name] = {
        'size': len(data),
        'sha256': hashlib.sha256(data).hexdigest(),
    }
(runtime_root / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')

meta_path = page / 'assets' / 'iso-meta.json'
meta = json.loads(meta_path.read_text(encoding='utf-8'))
meta['page_version'] = version
meta['deployment'] = 'atomic-v86-native-xhr-final-repository-assets'
meta_path.write_text(json.dumps(meta, indent=2) + '\n', encoding='utf-8')

(page / 'assets' / 'deployment.json').write_text(json.dumps({
    'version': version,
    'architecture': 'i386',
    'desktop': meta.get('desktop', 'direct-xorg-openbox'),
    'direct_boot': True,
    'chunked_iso': True,
    'atomic_v86_assets': True,
    'native_xhr': True,
    'iso_sha256': meta['sha256'],
    'runtime_manifest': manifest,
}, indent=2) + '\n', encoding='utf-8')
PY

node --check "$SITE_DIR/os/real-multiboot/app.js"
node --check "$SITE_DIR/os/real-multiboot/asset-versioning.js"
node --check "$SITE_DIR/os/real-multiboot/safe-diagnostics.js"
node --check "$SITE_DIR/os/real-multiboot/local-media-router.js"
grep -q 'bzimage: { url: kernelUrl }' "$SITE_DIR/os/real-multiboot/app.js"
grep -q 'systemd.unit=graphical.target' "$SITE_DIR/os/real-multiboot/app.js"
grep -q 'asset-versioning.js?v=' "$SITE_DIR/os/real-multiboot/index.html"
grep -q 'safe-diagnostics.js?v=' "$SITE_DIR/os/real-multiboot/index.html"
grep -q "$DEPLOY_VERSION" "$SITE_DIR/os/real-multiboot/index.html"
! grep -q 'src="./diagnostics.js' "$SITE_DIR/os/real-multiboot/index.html"
! grep -q 'chunk-router-v4.js' "$SITE_DIR/os/real-multiboot/index.html"
test -s "$SITE_DIR/vendor/v86/libv86.js"
test -s "$SITE_DIR/vendor/v86/v86.wasm"
test -s "$SITE_DIR/vendor/v86/seabios.bin"
test -s "$SITE_DIR/vendor/v86/vgabios.bin"
test -s "$SITE_DIR/vendor/v86/manifest.json"
test -s "$SITE_DIR/os/real-multiboot/assets/vmlinuz"
test -s "$SITE_DIR/os/real-multiboot/assets/initrd.img"
test -s "$SITE_DIR/os/real-multiboot/assets/iso-meta.json"
test -s "$SITE_DIR/os/real-multiboot/assets/deployment.json"
test "$(du -sb "$SITE_DIR" | cut -f1)" -lt 1000000000

node - "$SITE_DIR/vendor/v86/v86.wasm" <<'JS'
const fs = require('node:fs');
const bytes = fs.readFileSync(process.argv[2]);
const module = new WebAssembly.Module(bytes);
const exports = WebAssembly.Module.exports(module);
if (!exports.some(entry => entry.name === 'memory' && entry.kind === 'memory')) {
  throw new Error(`v86.wasm does not export memory: ${JSON.stringify(exports.slice(0, 30))}`);
}
console.log('v86.wasm compiled and exports memory', bytes.length);
JS

du -sh "$SITE_DIR" "$SITE_DIR/os/real-multiboot/assets/"* "$SITE_DIR/vendor/v86/"*
