#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/assets"
BUILD_DIR="${BUILD_DIR:-$(mktemp -d)}"
ISO_NAME="gorics-quantum-webboot-i386.iso"
KERNEL_URL="${KERNEL_URL:-https://deb.debian.org/debian/dists/bookworm/main/installer-i386/current/images/netboot/debian-installer/i386/linux}"
ALPINE_VERSION="${ALPINE_VERSION:-v3.20}"
ALPINE_ARCH="${ALPINE_ARCH:-x86}"
ALPINE_BASE="https://dl-cdn.alpinelinux.org/alpine/${ALPINE_VERSION}/main/${ALPINE_ARCH}"
APKINDEX_URL="${ALPINE_BASE}/APKINDEX.tar.gz"

mkdir -p "$OUT_DIR" "$BUILD_DIR/iso/boot/isolinux" "$BUILD_DIR/rootfs/bin" "$BUILD_DIR/rootfs/proc" "$BUILD_DIR/rootfs/sys" "$BUILD_DIR/rootfs/dev" "$BUILD_DIR/apk"

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }; }
need curl
need tar
need gzip
need cpio
need xorriso

if [ ! -f /usr/lib/ISOLINUX/isolinux.bin ]; then
  echo "missing /usr/lib/ISOLINUX/isolinux.bin; install package: isolinux" >&2
  exit 1
fi
if [ ! -f /usr/lib/syslinux/modules/bios/ldlinux.c32 ]; then
  echo "missing ldlinux.c32; install package: syslinux-common" >&2
  exit 1
fi

printf '[build] download Linux i386 kernel\n'
curl -fsSL "$KERNEL_URL" -o "$BUILD_DIR/iso/boot/vmlinuz"

printf '[build] resolve Alpine busybox-static package\n'
BUSYBOX_VERSION="$(curl -fsSL "$APKINDEX_URL" | tar -xz -O APKINDEX | awk 'BEGIN{RS=""} /^P:busybox-static$/ { n=split($0,a,"\n"); for(i=1;i<=n;i++){ if(a[i] ~ /^V:/){ sub(/^V:/,"",a[i]); print a[i]; exit } } }')"
if [ -z "$BUSYBOX_VERSION" ]; then
  echo "cannot resolve busybox-static from $APKINDEX_URL" >&2
  exit 1
fi
BUSYBOX_APK="busybox-static-${BUSYBOX_VERSION}.apk"

printf '[build] download %s\n' "$BUSYBOX_APK"
curl -fsSL "${ALPINE_BASE}/${BUSYBOX_APK}" -o "$BUILD_DIR/${BUSYBOX_APK}"
tar -xzf "$BUILD_DIR/${BUSYBOX_APK}" -C "$BUILD_DIR/apk" ./bin/busybox.static
cp "$BUILD_DIR/apk/bin/busybox.static" "$BUILD_DIR/rootfs/bin/busybox"
chmod +x "$BUILD_DIR/rootfs/bin/busybox"

cat > "$BUILD_DIR/rootfs/init" <<'INIT'
#!/bin/busybox sh
export PATH=/bin:/sbin:/usr/bin:/usr/sbin
/bin/busybox --install -s /bin 2>/dev/null || true
mkdir -p /proc /sys /dev /tmp /root
mount -t devtmpfs devtmpfs /dev 2>/dev/null || true
[ -e /dev/console ] || mknod /dev/console c 5 1
[ -e /dev/null ] || mknod /dev/null c 1 3
mount -t proc proc /proc 2>/dev/null || true
mount -t sysfs sysfs /sys 2>/dev/null || true
mount -t tmpfs tmpfs /tmp 2>/dev/null || true
hostname gorics-quantum 2>/dev/null || true

clear
cat <<'BANNER'
╔══════════════════════════════════════════════════════════╗
║              GORICS QUANTUM OS WEBBOOT                 ║
║        Real Linux kernel + BusyBox userland ISO         ║
║        Booted inside browser x86 virtual machine        ║
╚══════════════════════════════════════════════════════════╝
BANNER

cat <<'HELP'
commands: help, desktop, apps, net-up, info, shell, poweroff
HELP

info() {
  echo "GORICS Quantum OS WebBoot"
  echo "kernel: $(uname -srmo)"
  echo "uptime: $(cut -d. -f1 /proc/uptime 2>/dev/null)s"
  echo "memory:"; free -m 2>/dev/null || true
}

desktop() {
  clear
  cat <<'DESK'
┌──────────────────────────────────────────────────────────┐
│ GORICS Quantum Desktop                                   │
├──────────────────────────────────────────────────────────┤
│ [1] Terminal       [2] Network        [3] Browser Stub   │
│ [4] System Info    [5] Apps           [6] Power          │
├──────────────────────────────────────────────────────────┤
│ This is a real booted Linux ISO in a browser VM.          │
│ Full Wayland/X11 GUI needs a larger rootfs and drivers.   │
└──────────────────────────────────────────────────────────┘
DESK
}

apps() {
  echo "Installed core apps: sh, vi, awk, sed, grep, wget, udhcpc, mount, ps, top, dmesg"
}

net_up() {
  ip link set lo up 2>/dev/null || true
  ip link set eth0 up 2>/dev/null || true
  udhcpc -i eth0 -q -n -t 3 2>/dev/null && ip addr show eth0 || echo "network unavailable in this browser/VM mode"
}

while true; do
  printf '\ngorics@quantum:/$ '
  read -r line || exec sh
  set -- $line
  cmd="${1:-}"
  case "$cmd" in
    "" ) ;;
    help ) echo "help desktop apps net-up info shell poweroff" ;;
    desktop ) desktop ;;
    apps ) apps ;;
    info ) info ;;
    net-up ) net_up ;;
    shell ) exec sh ;;
    poweroff|halt|shutdown ) poweroff -f 2>/dev/null || halt -f ;;
    * ) echo "unknown command: $cmd" ;;
  esac
done
INIT
chmod +x "$BUILD_DIR/rootfs/init"

printf '[build] create initramfs\n'
( cd "$BUILD_DIR/rootfs" && find . -print0 | cpio --null -ov --format=newc 2>/dev/null | gzip -9 ) > "$BUILD_DIR/iso/boot/initrd.gz"

cp /usr/lib/ISOLINUX/isolinux.bin "$BUILD_DIR/iso/boot/isolinux/isolinux.bin"
cp /usr/lib/syslinux/modules/bios/ldlinux.c32 "$BUILD_DIR/iso/boot/isolinux/ldlinux.c32"
cat > "$BUILD_DIR/iso/boot/isolinux/isolinux.cfg" <<'CFG'
DEFAULT gorics
PROMPT 0
TIMEOUT 20

LABEL gorics
  MENU LABEL GORICS Quantum OS WebBoot
  KERNEL /boot/vmlinuz
  APPEND initrd=/boot/initrd.gz quiet console=tty0
CFG

printf '[build] create ISO\n'
xorriso -as mkisofs \
  -quiet \
  -o "$OUT_DIR/$ISO_NAME" \
  -b boot/isolinux/isolinux.bin \
  -c boot/isolinux/boot.cat \
  -no-emul-boot \
  -boot-load-size 4 \
  -boot-info-table \
  -V "GORICS_QOS" \
  "$BUILD_DIR/iso"

( cd "$OUT_DIR" && sha256sum "$ISO_NAME" > "$ISO_NAME.sha256" )
cat > "$OUT_DIR/$ISO_NAME.meta.json" <<META
{
  "name": "$ISO_NAME",
  "kernel_source": "$KERNEL_URL",
  "busybox_source": "${ALPINE_BASE}/${BUSYBOX_APK}",
  "target": "i386 BIOS ISO for v86 browser boot",
  "built_at_utc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "size_bytes": $(stat -c '%s' "$OUT_DIR/$ISO_NAME")
}
META

printf '[done] %s\n' "$OUT_DIR/$ISO_NAME"
