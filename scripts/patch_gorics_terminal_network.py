#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

TARGET = Path("os/iso/build-gorics-web-iso.sh")
MARKER = "# GORICS terminal+network patch v1"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


text = TARGET.read_text(encoding="utf-8")
if MARKER in text:
    print("GORICS terminal/network patch already applied")
    raise SystemExit(0)

text = replace_once(
    text,
    "xterm\nnetsurf-gtk\nnetwork-manager\n",
    "xterm\niproute2\niputils-ping\ndnsutils\nnet-tools\nethtool\nnetsurf-gtk\nnetwork-manager\n",
    "network utility packages",
)

text = replace_once(
    text,
    "cp config/includes.chroot/etc/skel/Desktop/GORICS-WELCOME.desktop config/includes.chroot/root/Desktop/GORICS-WELCOME.desktop\n\ncat > config/includes.chroot/etc/skel/Desktop/WEB-BROWSER.desktop <<'EOF'\n",
    """cp config/includes.chroot/etc/skel/Desktop/GORICS-WELCOME.desktop config/includes.chroot/root/Desktop/GORICS-WELCOME.desktop

cat > config/includes.chroot/etc/skel/Desktop/TERMINAL.desktop <<'EOF'
[Desktop Entry]
Type=Application
Name=Terminal
Comment=Open a full Linux shell
Exec=lxterminal
Icon=utilities-terminal
Terminal=false
Categories=System;TerminalEmulator;
EOF
chmod +x config/includes.chroot/etc/skel/Desktop/TERMINAL.desktop
cp config/includes.chroot/etc/skel/Desktop/TERMINAL.desktop config/includes.chroot/root/Desktop/TERMINAL.desktop

cat > config/includes.chroot/etc/skel/Desktop/WEB-BROWSER.desktop <<'EOF'
""",
    "terminal desktop launcher",
)

text = replace_once(
    text,
    "Exec=netsurf\nIcon=web-browser\n",
    "Exec=netsurf http://example.com/\nIcon=web-browser\n",
    "browser start page",
)

text = replace_once(
    text,
    "launcher_item_app = /root/Desktop/GORICS-WELCOME.desktop\nlauncher_item_app = /root/Desktop/FILE-MANAGER.desktop\n",
    "launcher_item_app = /root/Desktop/TERMINAL.desktop\nlauncher_item_app = /root/Desktop/GORICS-WELCOME.desktop\nlauncher_item_app = /root/Desktop/FILE-MANAGER.desktop\n",
    "terminal panel launcher",
)

text = replace_once(
    text,
    "    <item label=\"Terminal\"><action name=\"Execute\"><command>lxterminal</command></action></item>\n",
    "    <item label=\"Terminal\"><action name=\"Execute\"><command>lxterminal</command></action></item>\n    <item label=\"Network Status\"><action name=\"Execute\"><command>lxterminal -t 'GORICS Network Status' -e sh -c 'nmcli general status; nmcli device status; ip address; ip route; printf \\\"\\nPress Enter to close.\\n\\\"; read _'</command></action></item>\n",
    "network status menu",
)

network_block = r'''cat > config/includes.chroot/usr/local/bin/gorics-network-check <<'EOF'
#!/bin/sh
set +e
exec 3>/dev/ttyS0
printf 'GORICS_NETWORK_CHECK_START\n' >&3
systemctl start NetworkManager.service >/dev/null 2>&1 || true
nmcli networking on >/dev/null 2>&1 || true
nmcli radio all on >/dev/null 2>&1 || true

i=0
while [ "$i" -lt 45 ]; do
  state=$(nmcli -t -f STATE general status 2>/dev/null | head -n1)
  if [ "$state" = connected ] || ip route show default 2>/dev/null | grep -q '^default '; then
    break
  fi
  for dev in $(nmcli -t -f DEVICE,TYPE device status 2>/dev/null | awk -F: '$2 == "ethernet" {print $1}'); do
    nmcli device connect "$dev" >/dev/null 2>&1 || true
  done
  i=$((i+1))
  sleep 1
done

nmcli general status >&3 2>&1 || true
nmcli device status >&3 2>&1 || true
ip address show >&3 2>&1 || true
ip route show >&3 2>&1 || true

if ip route show default 2>/dev/null | grep -q '^default '; then
  printf 'GORICS_NETWORK_LINK_READY\n' >&3
else
  printf 'GORICS_NETWORK_LINK_FAILED\n' >&3
fi

if getent ahostsv4 example.com >/tmp/gorics-dns-test 2>&1; then
  cat /tmp/gorics-dns-test >&3
  printf 'GORICS_DNS_READY\n' >&3
else
  cat /tmp/gorics-dns-test >&3 2>/dev/null || true
  printf 'GORICS_DNS_FAILED\n' >&3
fi

if curl -4 -fsSIL --max-time 20 http://example.com/ >/tmp/gorics-http-test 2>&1; then
  head -n 20 /tmp/gorics-http-test >&3
  printf 'GORICS_INTERNET_READY\n' >&3
else
  cat /tmp/gorics-http-test >&3 2>/dev/null || true
  printf 'GORICS_INTERNET_DEGRADED\n' >&3
fi
exit 0
EOF
chmod +x config/includes.chroot/usr/local/bin/gorics-network-check

cat > config/includes.chroot/etc/systemd/system/gorics-network.service <<'EOF'
[Unit]
Description=GORICS browser VM network initialization and diagnostics
After=NetworkManager.service network.target
Wants=NetworkManager.service network.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/gorics-network-check
RemainAfterExit=yes
TimeoutStartSec=70

[Install]
WantedBy=graphical.target
EOF
ln -sf ../gorics-network.service config/includes.chroot/etc/systemd/system/graphical.target.wants/gorics-network.service

'''

text = replace_once(
    text,
    "cat > config/includes.chroot/etc/systemd/system/gorics-x.service <<'EOF'\n",
    network_block + "cat > config/includes.chroot/etc/systemd/system/gorics-x.service <<'EOF'\n",
    "network service insertion",
)

text = replace_once(
    text,
    "After=live-config.service dbus.service\nWants=dbus.service\n",
    "After=live-config.service dbus.service NetworkManager.service\nWants=dbus.service NetworkManager.service\n",
    "GUI network dependency",
)

text = replace_once(
    text,
    "After=gorics-x.service\nRequires=gorics-x.service\n",
    "After=gorics-x.service gorics-network.service\nRequires=gorics-x.service\nWants=gorics-network.service\n",
    "readiness network dependency",
)

text = MARKER + "\n" + text
TARGET.write_text(text, encoding="utf-8")

required = (
    "TERMINAL.desktop",
    "launcher_item_app = /root/Desktop/TERMINAL.desktop",
    "gorics-network-check",
    "GORICS_NETWORK_LINK_READY",
    "GORICS_DNS_READY",
    "GORICS_INTERNET_READY",
    "NetworkManager.service",
)
missing = [item for item in required if item not in text]
if missing:
    raise SystemExit(f"patch verification failed: {missing}")
print("patched GORICS ISO source with visible terminal and browser VM networking")
