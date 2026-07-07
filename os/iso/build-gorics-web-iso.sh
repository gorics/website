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
  config/includes.chroot/etc/X11 \
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
xserver-xorg-legacy
xserver-xorg-video-vesa
xserver-xorg-video-fbdev
xserver-xorg-input-libinput
x11-xserver-utils
xinit
openbox
tint2
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

cat > config/includes.chroot/etc/X11/Xwrapper.config <<'EOF'
allowed_users=anybody
needs_root_rights=yes
EOF

cat > config/includes.chroot/etc/skel/.config/openbox/autostart <<'EOF'
xset s off -dpms &
xsetroot -solid '#182033' &
pcmanfm --desktop --profile LXDE &
tint2 &
nm-applet &
EOF

cat > config/includes.chroot/etc/profile.d/gorics-web.sh <<'EOF'
export GORICS_OS=1
export GORICS_OS_NAME="GORICS Linux GUI Web OS"
EOF

cat > config/includes.chroot/usr/local/bin/gorics-session <<'EOF'
#!/bin/sh
set -eu
export HOME=/home/user
export USER=user
export LOGNAME=user
export DISPLAY=:0
export XDG_CURRENT_DESKTOP=OPENBOX
export DESKTOP_SESSION=openbox
xset s off -dpms || true
xsetroot -solid '#182033' || true
pcmanfm --desktop --profile LXDE &
tint2 &
nm-applet &
exec openbox-session
EOF
chmod +x config/includes.chroot/usr/local/bin/gorics-session

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

cat > config/includes.chroot/etc/systemd/system/gorics-x.service <<'EOF'
[Unit]
Description=GORICS direct Xorg and Openbox desktop
After=live-config.service systemd-user-sessions.service dbus.service
Wants=systemd-user-sessions.service dbus.service
Before=graphical.target

[Service]
Type=simple
User=user
Group=user
PAMName=login
Environment=HOME=/home/user
Environment=USER=user
Environment=LOGNAME=user
Environment=DISPLAY=:0
Environment=XDG_RUNTIME_DIR=/run/gorics-x
RuntimeDirectory=gorics-x
RuntimeDirectoryMode=0700
TTYPath=/dev/tty7
StandardInput=tty-force
TTYReset=yes
TTYVHangup=yes
TTYVTDisallocate=yes
ExecStart=/usr/bin/xinit /usr/local/bin/gorics-session -- /usr/lib/xorg/Xorg :0 vt7 -keeptty -nolisten tcp
Restart=on-failure
RestartSec=3
TimeoutStartSec=0

[Install]
WantedBy=graphical.target
EOF
ln -sf ../gorics-x.service config/includes.chroot/etc/systemd/system/graphical.target.wants/gorics-x.service

cat > config/includes.chroot/etc/systemd/system/gorics-web-ready.service <<'EOF'
[Unit]
Description=GORICS real Openbox readiness marker
After=gorics-x.service
Requires=gorics-x.service

[Service]
Type=oneshot
ExecStart=/bin/sh -c 'i=0; while [ "$i" -lt 240 ]; do if pgrep -x openbox >/dev/null; then printf "GORICS_WEB_GUI_READY\n" > /dev/ttyS0; exit 0; fi; i=$((i+1)); sleep 1; done; printf "GORICS_WEB_GUI_FAILED\n" > /dev/ttyS0; systemctl --no-pager status gorics-x.service > /dev/ttyS0 2>&1 || true; exit 1'

[Install]
WantedBy=graphical.target
EOF
ln -sf ../gorics-web-ready.service config/includes.chroot/etc/systemd/system/graphical.target.wants/gorics-web-ready.service
ln -sf /lib/systemd/system/graphical.target config/includes.chroot/etc/systemd/system/default.target

cat > config/hooks/live/0900-gorics-web-cleanup.hook.chroot <<'EOF'
#!/usr/bin/env bash
set -e
cat >/etc/issue <<'MSG'
GORICS Linux GUI Web OS \n \l
MSG
cat >/etc/motd <<'MSG'
GORICS Linux GUI Web OS - real Debian live GUI
MSG
systemctl mask lightdm.service display-manager.service 2>/dev/null || true
systemctl mask e2scrub_reap.service e2scrub_all.service NetworkManager-wait-online.service 2>/dev/null || true
systemctl mask apt-daily.service apt-daily-upgrade.service apt-daily.timer apt-daily-upgrade.timer 2>/dev/null || true
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
