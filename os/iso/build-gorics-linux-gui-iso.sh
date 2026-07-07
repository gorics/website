#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK_DIR="${ROOT_DIR}/build/gorics-live"
OUT_DIR="${ROOT_DIR}/out"
ISO_NAME="gorics-linux-gui-os-amd64.iso"

rm -rf "${WORK_DIR}" "${OUT_DIR}"
mkdir -p "${WORK_DIR}" "${OUT_DIR}"
cd "${WORK_DIR}"

lb config \
  --mode debian \
  --distribution bookworm \
  --architectures amd64 \
  --archive-areas "main contrib non-free-firmware" \
  --security false \
  --binary-images iso-hybrid \
  --bootappend-live "boot=live components quiet splash username=user hostname=gorics-os locales=ko_KR.UTF-8 keyboard-layouts=kr timezone=Asia/Seoul" \
  --debian-installer none \
  --iso-application "GORICS Linux GUI OS" \
  --iso-publisher "GORICS" \
  --iso-volume "GORICS_GUI_OS"

mkdir -p config/package-lists \
  config/includes.chroot/etc/skel/Desktop \
  config/includes.chroot/etc/skel/.config/autostart \
  config/includes.chroot/etc/profile.d \
  config/includes.chroot/usr/local/bin \
  config/hooks/live

cat > config/package-lists/gorics-gui.list.chroot <<'PKGS'
linux-image-amd64
live-boot
systemd-sysv
locales
network-manager
wireless-tools
wpasupplicant
xfce4
xfce4-terminal
lightdm
lightdm-gtk-greeter
firefox-esr
mousepad
thunar
file-roller
pavucontrol
pulseaudio
alsa-utils
fonts-noto-cjk
fonts-noto-color-emoji
x11-xserver-utils
curl
wget
nano
htop
neofetch
python3
PKGS

cat > config/includes.chroot/etc/profile.d/gorics-os.sh <<'EOF'
export GORICS_OS=1
export GORICS_OS_NAME="GORICS Linux GUI OS"
EOF

cat > config/includes.chroot/usr/local/bin/gorics-welcome <<'EOF'
#!/usr/bin/env bash
cat <<'MSG'
GORICS Linux GUI OS
Real Linux based GUI ISO booted.
Base: Debian Live
Desktop: XFCE
Apps: Firefox ESR, Terminal, Thunar, Mousepad, Python3
MSG
read -r -p "Press Enter to close... " _ || true
EOF
chmod +x config/includes.chroot/usr/local/bin/gorics-welcome

cat > config/includes.chroot/etc/skel/Desktop/GORICS-WELCOME.desktop <<'EOF'
[Desktop Entry]
Type=Application
Name=GORICS Welcome
Comment=Open Gorics Linux GUI OS welcome terminal
Exec=xfce4-terminal --hold --title="GORICS Linux GUI OS" --command="/usr/local/bin/gorics-welcome"
Icon=computer
Terminal=false
Categories=System;
EOF
chmod +x config/includes.chroot/etc/skel/Desktop/GORICS-WELCOME.desktop

cat > config/includes.chroot/etc/skel/.config/autostart/gorics-welcome.desktop <<'EOF'
[Desktop Entry]
Type=Application
Name=GORICS Welcome
Exec=xfce4-terminal --hold --title="GORICS Linux GUI OS" --command="/usr/local/bin/gorics-welcome"
X-GNOME-Autostart-enabled=true
EOF

cat > config/hooks/live/0100-gorics-locale.hook.chroot <<'EOF'
#!/usr/bin/env bash
set -e
if ! grep -q '^ko_KR.UTF-8 UTF-8' /etc/locale.gen; then
  echo 'ko_KR.UTF-8 UTF-8' >>/etc/locale.gen
fi
locale-gen || true
update-locale LANG=ko_KR.UTF-8 || true
cat >/etc/issue <<'MSG'
GORICS Linux GUI OS \n \l
MSG
cat >/etc/motd <<'MSG'
GORICS Linux GUI OS - real Debian based live GUI ISO
MSG
EOF
chmod +x config/hooks/live/0100-gorics-locale.hook.chroot

sudo lb build

ISO_PATH="$(find . -maxdepth 1 -type f -name '*.iso' | head -n 1)"
if [[ -z "${ISO_PATH}" ]]; then
  echo "ISO build failed: no ISO file produced" >&2
  exit 1
fi
cp "${ISO_PATH}" "${OUT_DIR}/${ISO_NAME}"
