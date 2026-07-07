#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK_DIR="${ROOT_DIR}/build/gorics-web-live"
OUT_DIR="${ROOT_DIR}/out-web"
ISO_NAME="gorics-linux-gui-web-amd64.iso"

rm -rf "${WORK_DIR}" "${OUT_DIR}"
mkdir -p "${WORK_DIR}" "${OUT_DIR}"
cd "${WORK_DIR}"

lb config \
  --mode debian \
  --distribution bookworm \
  --architectures amd64 \
  --archive-areas "main" \
  --security false \
  --apt-recommends false \
  --apt-indices false \
  --apt-source-archives false \
  --binary-images iso-hybrid \
  --chroot-filesystem squashfs \
  --compression xz \
  --memtest none \
  --debian-installer none \
  --bootappend-live "boot=live components username=user hostname=gorics-web locales=en_US.UTF-8 keyboard-layouts=us timezone=Asia/Seoul console=tty0 console=ttyS0,115200n8" \
  --iso-application "GORICS Linux GUI Web OS" \
  --iso-publisher "GORICS" \
  --iso-volume "GORICS_WEB_GUI"

mkdir -p \
  config/package-lists \
  config/includes.chroot/etc/lightdm/lightdm.conf.d \
  config/includes.chroot/etc/skel/.config/openbox \
  config/includes.chroot/etc/skel/Desktop \
  config/includes.chroot/etc/profile.d \
  config/includes.chroot/etc/systemd/system/graphical.target.wants \
  config/includes.chroot/usr/local/bin \
  config/hooks/live

cat > config/package-lists/gorics-web.list.chroot <<'PKGS'
linux-image-amd64
live-boot
live-config
live-config-systemd
systemd-sysv
xserver-xorg-core
xserver-xorg-video-vesa
xserver-xorg-video-fbdev
xserver-xorg-input-libinput
x11-xserver-utils
openbox
tint2
lightdm
lightdm-gtk-greeter
pcmanfm
lxterminal
netsurf-gtk
network-manager
network-manager-gnome
dbus-x11
policykit-1
fonts-dejavu-core
mousepad
ca-certificates
curl
wget
sudo
python3-minimal
PKGS

cat > config/includes.chroot/etc/lightdm/lightdm.conf.d/50-gorics.conf <<'EOF'
[Seat:*]
autologin-user=user
autologin-user-timeout=0
user-session=openbox
session-wrapper=/etc/X11/Xsession
EOF

cat > config/includes.chroot/etc/skel/.config/openbox/autostart <<'EOF'
xset s off -dpms &
pcmanfm --desktop --profile LXDE &
tint2 &
nm-applet &
EOF

cat > config/includes.chroot/etc/profile.d/gorics-web.sh <<'EOF'
export GORICS_OS=1
export GORICS_OS_NAME="GORICS Linux GUI Web OS"
EOF

cat > config/includes.chroot/usr/local/bin/gorics-welcome <<'EOF'
#!/usr/bin/env bash
printf '%s\n' \
  'GORICS Linux GUI Web OS' \
  'Real Debian-based Linux GUI ISO running in the browser.' \
  'Desktop: Openbox + Tint2' \
  'Browser: NetSurf' \
  'Tools: Terminal, File Manager, Text Editor, Python'
read -r -p 'Press Enter to close... ' _ || true
EOF
chmod +x config/includes.chroot/usr/local/bin/gorics-welcome

cat > config/includes.chroot/etc/skel/Desktop/GORICS-WELCOME.desktop <<'EOF'
[Desktop Entry]
Type=Application
Name=GORICS Welcome
Exec=lxterminal -e /usr/local/bin/gorics-welcome
Icon=computer
Terminal=false
EOF
chmod +x config/includes.chroot/etc/skel/Desktop/GORICS-WELCOME.desktop

cat > config/includes.chroot/etc/skel/Desktop/WEB-BROWSER.desktop <<'EOF'
[Desktop Entry]
Type=Application
Name=Web Browser
Exec=netsurf
Icon=web-browser
Terminal=false
EOF
chmod +x config/includes.chroot/etc/skel/Desktop/WEB-BROWSER.desktop

cat > config/includes.chroot/etc/systemd/system/gorics-web-ready.service <<'EOF'
[Unit]
Description=GORICS browser GUI readiness marker
After=graphical.target lightdm.service

[Service]
Type=oneshot
ExecStart=/bin/sh -c 'printf "GORICS_WEB_GUI_READY\\n" > /dev/ttyS0'

[Install]
WantedBy=graphical.target
EOF
ln -s ../gorics-web-ready.service config/includes.chroot/etc/systemd/system/graphical.target.wants/gorics-web-ready.service

cat > config/hooks/live/0900-gorics-web-cleanup.hook.chroot <<'EOF'
#!/usr/bin/env bash
set -e
cat >/etc/issue <<'MSG'
GORICS Linux GUI Web OS \n \l
MSG
cat >/etc/motd <<'MSG'
GORICS Linux GUI Web OS - real Debian live GUI
MSG
rm -rf /usr/share/doc/* /usr/share/man/* /usr/share/info/*
find /usr/share/locale -mindepth 1 -maxdepth 1 \
  ! -name 'en' ! -name 'en_US' ! -name 'C' \
  -exec rm -rf {} + || true
apt-get clean
rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*.deb
EOF
chmod +x config/hooks/live/0900-gorics-web-cleanup.hook.chroot

sudo lb build

ISO_PATH="$(find . -maxdepth 1 -type f -name '*.iso' | head -n 1)"
if [[ -z "${ISO_PATH}" ]]; then
  echo "Web ISO build failed: no ISO produced" >&2
  exit 1
fi
cp "${ISO_PATH}" "${OUT_DIR}/${ISO_NAME}"
ls -lh "${OUT_DIR}/${ISO_NAME}"
