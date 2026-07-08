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
  config/includes.chroot/etc/skel/.config/openbox \
  config/includes.chroot/etc/skel/.config/tint2 \
  config/includes.chroot/etc/skel/.config/pcmanfm/LXDE \
  config/includes.chroot/etc/skel/Desktop \
  config/includes.chroot/root/.config/openbox \
  config/includes.chroot/root/.config/tint2 \
  config/includes.chroot/root/.config/pcmanfm/LXDE \
  config/includes.chroot/root/Desktop \
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
x11-utils
openbox
tint2
pcmanfm
lxterminal
xterm
netsurf-gtk
network-manager
network-manager-gnome
dbus-x11
policykit-1
procps
fonts-dejavu-core
mousepad
ca-certificates
curl
wget
sudo
python3-minimal
PKGS

cat > config/includes.chroot/etc/profile.d/gorics-web.sh <<'EOF'
export GORICS_OS=1
export GORICS_OS_NAME="GORICS Linux GUI Web OS"
EOF

cat > config/includes.chroot/usr/local/bin/gorics-welcome <<'EOF'
#!/usr/bin/env bash
printf '\033[1;36m%s\033[0m\n\n' 'GORICS Linux GUI Web OS'
printf '%s\n' \
  'Real Debian i386 Linux GUI running inside the browser.' \
  '' \
  'Desktop: Openbox + Tint2 + PCManFM' \
  'Browser: NetSurf' \
  'Tools: Terminal, File Manager, Text Editor, Python' \
  '' \
  'Use the bottom panel or right-click the desktop.' \
  'Press Enter to close this welcome window.'
read -r _ || true
EOF
chmod +x config/includes.chroot/usr/local/bin/gorics-welcome

cat > config/includes.chroot/etc/skel/Desktop/GORICS-WELCOME.desktop <<'EOF'
[Desktop Entry]
Type=Application
Name=GORICS Welcome
Exec=xterm -title "GORICS Linux GUI OS" -geometry 80x24 -e /usr/local/bin/gorics-welcome
Icon=computer
Terminal=false
EOF
chmod +x config/includes.chroot/etc/skel/Desktop/GORICS-WELCOME.desktop
cp config/includes.chroot/etc/skel/Desktop/GORICS-WELCOME.desktop config/includes.chroot/root/Desktop/GORICS-WELCOME.desktop

cat > config/includes.chroot/etc/skel/Desktop/WEB-BROWSER.desktop <<'EOF'
[Desktop Entry]
Type=Application
Name=Web Browser
Exec=netsurf
Icon=web-browser
Terminal=false
EOF
chmod +x config/includes.chroot/etc/skel/Desktop/WEB-BROWSER.desktop
cp config/includes.chroot/etc/skel/Desktop/WEB-BROWSER.desktop config/includes.chroot/root/Desktop/WEB-BROWSER.desktop

cat > config/includes.chroot/etc/skel/Desktop/FILE-MANAGER.desktop <<'EOF'
[Desktop Entry]
Type=Application
Name=File Manager
Exec=pcmanfm
Icon=system-file-manager
Terminal=false
EOF
chmod +x config/includes.chroot/etc/skel/Desktop/FILE-MANAGER.desktop
cp config/includes.chroot/etc/skel/Desktop/FILE-MANAGER.desktop config/includes.chroot/root/Desktop/FILE-MANAGER.desktop

mkdir -p config/includes.chroot/usr/share/backgrounds
cat > config/includes.chroot/usr/share/backgrounds/gorics.xpm <<'EOF'
/* XPM */
static char * gorics_xpm[] = {
"32 18 6 1",
"  c #08111F",
". c #0F1B33",
"+ c #1D4ED8",
"@ c #06B6D4",
"# c #22C55E",
"X c #F8FAFC",
"++++++++++++++++++++++++++++++++",
"+..............................+",
"+.@@@@@@@@@@@@@@@@@@@@@@@@@@@@.+",
"+.@..........................@.+",
"+.@.XXXXXXXXXXXXXXXXXXXXXX...@.+",
"+.@.X....................X...@.+",
"+.@.X..################..X...@.+",
"+.@.X..#..............#..X...@.+",
"+.@.X..#..++++++++++..#..X...@.+",
"+.@.X..#..+...........#..X...@.+",
"+.@.X..#..+..XXXXXXX..#..X...@.+",
"+.@.X..#..+......X....#..X...@.+",
"+.@.X..#..++++++++....#..X...@.+",
"+.@.X..#..............#..X...@.+",
"+.@.X..################..X...@.+",
"+.@.XXXXXXXXXXXXXXXXXXXXXX...@.+",
"+.@@@@@@@@@@@@@@@@@@@@@@@@@@@@.+",
"++++++++++++++++++++++++++++++++"};
EOF

cat > config/includes.chroot/usr/local/bin/gorics-visible-terminal <<'EOF'
#!/bin/sh
printf '%s\n' 'GORICS Linux GUI OS'
printf '%s\n' 'Desktop rendered successfully' ''
printf '%s\n' 'Openbox window manager' 'Tint2 application panel' 'PCManFM desktop' 'NetSurf web browser' ''
printf '%s\n' 'This terminal stays open as a visible readiness window.'
exec /bin/sh -i
EOF
chmod +x config/includes.chroot/usr/local/bin/gorics-visible-terminal

cat > config/includes.chroot/etc/skel/.config/pcmanfm/LXDE/pcmanfm.conf <<'EOF'
[config]
bm_open_method=0
su_cmd=lxterminal -e sudo %s

[volume]
mount_on_startup=1
mount_removable=1
autorun=1

[desktop]
wallpaper_mode=stretch
wallpaper=/usr/share/backgrounds/gorics.xpm
desktop_bg=#182033
desktop_fg=#f8fafc
desktop_shadow=#000000
show_wm_menu=1
sort=name;ascending;
show_documents=0
show_trash=1
show_mounts=1
EOF
cp config/includes.chroot/etc/skel/.config/pcmanfm/LXDE/pcmanfm.conf config/includes.chroot/root/.config/pcmanfm/LXDE/pcmanfm.conf

cat > config/includes.chroot/etc/skel/.config/tint2/tint2rc <<'EOF'
rounded = 8
border_width = 1
border_sides = TBLR
background_color = #111827 95
border_color = #64748b 80

panel_items = LTSC
panel_size = 100% 42
panel_margin = 0 0
panel_padding = 8 4 8
panel_background_id = 0
panel_position = bottom center horizontal
panel_layer = top
panel_monitor = all
panel_shrink = 0
autohide = 0
strut_policy = follow_size
wm_menu = 1

launcher_padding = 4 2 4
launcher_background_id = 0
launcher_icon_background_id = 0
launcher_icon_size = 28
launcher_item_app = /root/Desktop/GORICS-WELCOME.desktop
launcher_item_app = /root/Desktop/FILE-MANAGER.desktop
launcher_item_app = /root/Desktop/WEB-BROWSER.desktop

taskbar_mode = single_desktop
taskbar_padding = 4 2 4
taskbar_background_id = 0
taskbar_active_background_id = 0
taskbar_name = 0
taskbar_hide_inactive_tasks = 0
taskbar_hide_different_monitor = 0
taskbar_hide_different_desktop = 0
taskbar_always_show_all_desktop_tasks = 1
taskbar_distribute_size = 1

task_text = 1
task_icon = 1
task_centered = 1
task_maximum_size = 180 34
task_padding = 6 2 6
task_font = Sans 10
task_font_color = #f8fafc 100
task_background_id = 0
task_active_background_id = 0

systray_padding = 4 2 4
systray_background_id = 0
systray_sort = ascending
systray_icon_size = 24

clock_padding = 8 0
clock_background_id = 0
time1_format = %H:%M
time1_font = Sans Bold 11
clock_font_color = #f8fafc 100

tooltip = 1
tooltip_padding = 6 4
tooltip_background_id = 0
tooltip_font = Sans 10
tooltip_font_color = #f8fafc 100
mouse_left = toggle_iconify
mouse_middle = none
mouse_right = close
EOF
cp config/includes.chroot/etc/skel/.config/tint2/tint2rc config/includes.chroot/root/.config/tint2/tint2rc

cat > config/includes.chroot/etc/skel/.config/openbox/menu.xml <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<openbox_menu xmlns="http://openbox.org/3.4/menu">
  <menu id="root-menu" label="GORICS Linux GUI OS">
    <item label="Terminal"><action name="Execute"><command>lxterminal</command></action></item>
    <item label="File Manager"><action name="Execute"><command>pcmanfm</command></action></item>
    <item label="Web Browser"><action name="Execute"><command>netsurf</command></action></item>
    <item label="Text Editor"><action name="Execute"><command>mousepad</command></action></item>
    <separator />
    <item label="Reconfigure"><action name="Reconfigure" /></item>
  </menu>
</openbox_menu>
EOF
cp config/includes.chroot/etc/skel/.config/openbox/menu.xml config/includes.chroot/root/.config/openbox/menu.xml

cat > config/includes.chroot/etc/skel/.config/openbox/autostart <<'EOF'
xset s off -dpms &
xsetroot -solid '#182033' &
pcmanfm --desktop --profile LXDE > /var/log/gorics-pcmanfm.log 2>&1 &
tint2 -c /root/.config/tint2/tint2rc > /var/log/gorics-tint2.log 2>&1 &
nm-applet > /var/log/gorics-nm-applet.log 2>&1 &
(sleep 2; xterm -title 'GORICS Linux GUI OS' -geometry 80x24+90+70 -e /usr/local/bin/gorics-welcome) > /var/log/gorics-xterm.log 2>&1 &
EOF
chmod +x config/includes.chroot/etc/skel/.config/openbox/autostart
cp config/includes.chroot/etc/skel/.config/openbox/autostart config/includes.chroot/root/.config/openbox/autostart
chmod +x config/includes.chroot/root/.config/openbox/autostart

cat > config/includes.chroot/usr/local/bin/gorics-session <<'EOF'
#!/bin/sh
set -eu
export HOME=/root
export USER=root
export LOGNAME=root
export DISPLAY=:0
export XDG_RUNTIME_DIR=/run/gorics-x
export XDG_CURRENT_DESKTOP=OPENBOX
export DESKTOP_SESSION=openbox
export XDG_CONFIG_HOME=/root/.config

xset s off -dpms >/dev/null 2>&1 || true
xsetroot -solid '#08111f' >/dev/null 2>&1 || true
openbox --config-file /etc/xdg/openbox/rc.xml > /var/log/gorics-openbox.log 2>&1 &
openbox_pid=$!
sleep 2
pcmanfm --desktop --profile LXDE > /var/log/gorics-pcmanfm.log 2>&1 &
tint2 -c /root/.config/tint2/tint2rc > /var/log/gorics-tint2.log 2>&1 &
nm-applet > /var/log/gorics-nm-applet.log 2>&1 &
xterm -hold -title 'GORICS Control Center' -geometry 84x26+92+72 -fa 'DejaVu Sans Mono' -fs 11 -bg '#07111f' -fg '#f8fafc' -e /usr/local/bin/gorics-visible-terminal > /var/log/gorics-xterm.log 2>&1 &
(sleep 4; xmessage -name GORICSWelcome -title 'GORICS Linux GUI Ready' -center -buttons 'Continue:0' 'GORICS Linux GUI is running in the browser.' > /var/log/gorics-xmessage.log 2>&1) &
wait "$openbox_pid"
EOF
chmod +x config/includes.chroot/usr/local/bin/gorics-session

cat > config/includes.chroot/usr/local/bin/gorics-start-gui <<'EOF'
#!/bin/sh
set -eu
export HOME=/root
export USER=root
export LOGNAME=root
export DISPLAY=:0
export XDG_RUNTIME_DIR=/run/gorics-x
mkdir -p /run/gorics-x /tmp/.X11-unix
chmod 700 /run/gorics-x
chmod 1777 /tmp/.X11-unix
rm -f /tmp/.X0-lock /tmp/.X11-unix/X0 /var/log/gorics-xorg.log
/usr/lib/xorg/Xorg :0 vt7 -noreset -nolisten tcp > /var/log/gorics-xorg.log 2>&1 &
xorg_pid=$!
cleanup() {
  kill "$xorg_pid" 2>/dev/null || true
  wait "$xorg_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM
ready=0
i=0
while [ "$i" -lt 120 ]; do
  if ! kill -0 "$xorg_pid" 2>/dev/null; then
    printf 'GORICS_XORG_FAILED\n' > /dev/ttyS0
    cat /var/log/gorics-xorg.log > /dev/ttyS0 2>&1 || true
    exit 1
  fi
  if DISPLAY=:0 xset q >/dev/null 2>&1; then
    ready=1
    break
  fi
  i=$((i+1))
  sleep 1
done
if [ "$ready" != 1 ]; then
  printf 'GORICS_XORG_TIMEOUT\n' > /dev/ttyS0
  cat /var/log/gorics-xorg.log > /dev/ttyS0 2>&1 || true
  exit 1
fi
printf 'GORICS_XORG_READY\n' > /dev/ttyS0
dbus-run-session -- /usr/local/bin/gorics-session
EOF
chmod +x config/includes.chroot/usr/local/bin/gorics-start-gui

cat > config/includes.chroot/etc/systemd/system/gorics-x.service <<'EOF'
[Unit]
Description=GORICS direct Xorg and complete Openbox desktop
After=live-config.service dbus.service
Wants=dbus.service
Before=graphical.target

[Service]
Type=simple
ExecStart=/usr/local/bin/gorics-start-gui
Restart=on-failure
RestartSec=3
TimeoutStartSec=0

[Install]
WantedBy=graphical.target
EOF
ln -sf ../gorics-x.service config/includes.chroot/etc/systemd/system/graphical.target.wants/gorics-x.service

cat > config/includes.chroot/etc/systemd/system/gorics-web-ready.service <<'EOF'
[Unit]
Description=GORICS complete desktop readiness marker
After=gorics-x.service
Requires=gorics-x.service

[Service]
Type=oneshot
ExecStart=/bin/sh -c 'i=0; while [ "$i" -lt 300 ]; do DISPLAY=:0 xwininfo -root -tree > /tmp/gorics-window-tree 2>&1 || true; if pgrep -x openbox >/dev/null && pgrep -x tint2 >/dev/null && pgrep -x pcmanfm >/dev/null && pgrep -x xterm >/dev/null && grep -q "GORICS Control Center" /tmp/gorics-window-tree; then cat /tmp/gorics-window-tree > /dev/ttyS0 2>&1 || true; printf "GORICS_OPENBOX_READY\nGORICS_TINT2_READY\nGORICS_PCMANFM_READY\nGORICS_XTERM_READY\nGORICS_VISIBLE_WINDOW_READY\nGORICS_WEB_GUI_READY\n" > /dev/ttyS0; exit 0; fi; i=$((i+1)); sleep 1; done; printf "GORICS_WEB_GUI_FAILED\n" > /dev/ttyS0; cat /tmp/gorics-window-tree > /dev/ttyS0 2>&1 || true; for name in openbox tint2 pcmanfm xterm xmessage; do pgrep -a -x "$name" > /dev/ttyS0 2>&1 || true; done; systemctl --no-pager status gorics-x.service > /dev/ttyS0 2>&1 || true; for f in /var/log/gorics-xorg.log /var/log/gorics-openbox.log /var/log/gorics-tint2.log /var/log/gorics-pcmanfm.log /var/log/gorics-xterm.log /var/log/gorics-xmessage.log; do printf "--- %s ---\n" "$f" > /dev/ttyS0; cat "$f" > /dev/ttyS0 2>&1 || true; done; exit 1'

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
