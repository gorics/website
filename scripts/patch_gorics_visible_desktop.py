#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

TARGET = Path("os/iso/build-gorics-web-iso.sh")
MARKER = "GORICS_VISIBLE_WINDOW_READY"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def validate(text: str) -> None:
    required = (
        "x11-utils",
        "gorics-visible-terminal",
        "GORICS Control Center",
        "wallpaper=/usr/share/backgrounds/gorics.xpm",
        "panel_background_id = 0",
        "xwininfo -root -tree",
        MARKER,
    )
    missing = [item for item in required if item not in text]
    if missing:
        raise RuntimeError(f"visible desktop patch missing markers: {missing}")


def main() -> None:
    text = TARGET.read_text(encoding="utf-8")
    if MARKER in text:
        validate(text)
        print("visible desktop patch already present")
        return

    text = replace_once(
        text,
        "x11-xserver-utils\nopenbox",
        "x11-xserver-utils\nx11-utils\nopenbox",
        "x11 utility package",
    )

    desktop_anchor = """chmod +x config/includes.chroot/etc/skel/Desktop/FILE-MANAGER.desktop
cp config/includes.chroot/etc/skel/Desktop/FILE-MANAGER.desktop config/includes.chroot/root/Desktop/FILE-MANAGER.desktop

"""
    desktop_assets = desktop_anchor + r"""mkdir -p config/includes.chroot/usr/share/backgrounds
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
printf '\033[2J\033[H'
printf '\033[1;36mGORICS Linux GUI OS\033[0m\n'
printf '\033[1;32mDesktop rendered successfully\033[0m\n\n'
printf 'Openbox window manager\nTint2 application panel\nPCManFM desktop\nNetSurf web browser\n\n'
printf 'This terminal stays open as a visible readiness window.\n'
exec /bin/sh -i
EOF
chmod +x config/includes.chroot/usr/local/bin/gorics-visible-terminal

"""
    text = replace_once(text, desktop_anchor, desktop_assets, "desktop visual assets")

    text = replace_once(text, "wallpaper_mode=color\nwallpaper=", "wallpaper_mode=stretch\nwallpaper=/usr/share/backgrounds/gorics.xpm", "desktop wallpaper")
    text = text.replace("panel_background_id = 1", "panel_background_id = 0")
    text = text.replace("task_active_background_id = 1", "task_active_background_id = 0")
    text = text.replace("tooltip_background_id = 1", "tooltip_background_id = 0")

    autostart_anchor = """EOF
cp config/includes.chroot/etc/skel/.config/openbox/autostart config/includes.chroot/root/.config/openbox/autostart

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
exec openbox-session
EOF
chmod +x config/includes.chroot/usr/local/bin/gorics-session
"""
    direct_session = """EOF
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
"""
    text = replace_once(text, autostart_anchor, direct_session, "direct visible session")

    old_ready = """ExecStart=/bin/sh -c 'i=0; while [ "$i" -lt 300 ]; do if pgrep -x openbox >/dev/null && pgrep -x tint2 >/dev/null && pgrep -x pcmanfm >/dev/null && pgrep -x xterm >/dev/null; then printf "GORICS_OPENBOX_READY\nGORICS_TINT2_READY\nGORICS_PCMANFM_READY\nGORICS_XTERM_READY\nGORICS_WEB_GUI_READY\n" > /dev/ttyS0; exit 0; fi; i=$((i+1)); sleep 1; done; printf "GORICS_WEB_GUI_FAILED\n" > /dev/ttyS0; for name in openbox tint2 pcmanfm xterm; do pgrep -a -x "$name" > /dev/ttyS0 2>&1 || true; done; systemctl --no-pager status gorics-x.service > /dev/ttyS0 2>&1 || true; for f in /var/log/gorics-xorg.log /var/log/gorics-tint2.log /var/log/gorics-pcmanfm.log /var/log/gorics-xterm.log; do printf "--- %s ---\n" "$f" > /dev/ttyS0; cat "$f" > /dev/ttyS0 2>&1 || true; done; exit 1'"""
    new_ready = """ExecStart=/bin/sh -c 'i=0; while [ "$i" -lt 300 ]; do DISPLAY=:0 xwininfo -root -tree > /tmp/gorics-window-tree 2>&1 || true; if pgrep -x openbox >/dev/null && pgrep -x tint2 >/dev/null && pgrep -x pcmanfm >/dev/null && pgrep -x xterm >/dev/null && grep -q "GORICS Control Center" /tmp/gorics-window-tree; then cat /tmp/gorics-window-tree > /dev/ttyS0 2>&1 || true; printf "GORICS_OPENBOX_READY\nGORICS_TINT2_READY\nGORICS_PCMANFM_READY\nGORICS_XTERM_READY\nGORICS_VISIBLE_WINDOW_READY\nGORICS_WEB_GUI_READY\n" > /dev/ttyS0; exit 0; fi; i=$((i+1)); sleep 1; done; printf "GORICS_WEB_GUI_FAILED\n" > /dev/ttyS0; cat /tmp/gorics-window-tree > /dev/ttyS0 2>&1 || true; for name in openbox tint2 pcmanfm xterm xmessage; do pgrep -a -x "$name" > /dev/ttyS0 2>&1 || true; done; systemctl --no-pager status gorics-x.service > /dev/ttyS0 2>&1 || true; for f in /var/log/gorics-xorg.log /var/log/gorics-openbox.log /var/log/gorics-tint2.log /var/log/gorics-pcmanfm.log /var/log/gorics-xterm.log /var/log/gorics-xmessage.log; do printf "--- %s ---\n" "$f" > /dev/ttyS0; cat "$f" > /dev/ttyS0 2>&1 || true; done; exit 1'"""
    text = replace_once(text, old_ready, new_ready, "mapped window readiness")

    validate(text)
    TARGET.write_text(text, encoding="utf-8")
    print(f"patched {TARGET} for visibly rendered desktop")


if __name__ == "__main__":
    main()
