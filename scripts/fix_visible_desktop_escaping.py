#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path

TARGET = Path('os/iso/build-gorics-web-iso.sh')
text = TARGET.read_text(encoding='utf-8')

terminal_block = r'''cat > config/includes.chroot/usr/local/bin/gorics-visible-terminal <<'EOF'
#!/bin/sh
printf '%s\n' 'GORICS Linux GUI OS'
printf '%s\n' 'Desktop rendered successfully' ''
printf '%s\n' 'Openbox window manager' 'Tint2 application panel' 'PCManFM desktop' 'NetSurf web browser' ''
printf '%s\n' 'This terminal stays open as a visible readiness window.'
exec /bin/sh -i
EOF
chmod +x config/includes.chroot/usr/local/bin/gorics-visible-terminal'''
text, terminal_count = re.subn(
    r"cat > config/includes\.chroot/usr/local/bin/gorics-visible-terminal <<'EOF'\n.*?\nEOF\nchmod \+x config/includes\.chroot/usr/local/bin/gorics-visible-terminal",
    lambda _match: terminal_block,
    text,
    count=1,
    flags=re.DOTALL,
)
if terminal_count != 1:
    raise RuntimeError(f'visible terminal block: expected one match, found {terminal_count}')

ready_line = (
    "ExecStart=/bin/sh -c 'i=0; while [ \"$i\" -lt 300 ]; do "
    "DISPLAY=:0 xwininfo -root -tree > /tmp/gorics-window-tree 2>&1 || true; "
    "if pgrep -x openbox >/dev/null && pgrep -x tint2 >/dev/null && "
    "pgrep -x pcmanfm >/dev/null && pgrep -x xterm >/dev/null && "
    "grep -q \"GORICS Control Center\" /tmp/gorics-window-tree; then "
    "cat /tmp/gorics-window-tree > /dev/ttyS0 2>&1 || true; "
    "printf \"GORICS_OPENBOX_READY\\nGORICS_TINT2_READY\\nGORICS_PCMANFM_READY\\n"
    "GORICS_XTERM_READY\\nGORICS_VISIBLE_WINDOW_READY\\nGORICS_WEB_GUI_READY\\n\" > /dev/ttyS0; "
    "exit 0; fi; i=$((i+1)); sleep 1; done; "
    "printf \"GORICS_WEB_GUI_FAILED\\n\" > /dev/ttyS0; "
    "cat /tmp/gorics-window-tree > /dev/ttyS0 2>&1 || true; "
    "for name in openbox tint2 pcmanfm xterm xmessage; do "
    "pgrep -a -x \"$name\" > /dev/ttyS0 2>&1 || true; done; "
    "systemctl --no-pager status gorics-x.service > /dev/ttyS0 2>&1 || true; "
    "for f in /var/log/gorics-xorg.log /var/log/gorics-openbox.log "
    "/var/log/gorics-tint2.log /var/log/gorics-pcmanfm.log "
    "/var/log/gorics-xterm.log /var/log/gorics-xmessage.log; do "
    "printf \"--- %s ---\\n\" \"$f\" > /dev/ttyS0; "
    "cat \"$f\" > /dev/ttyS0 2>&1 || true; done; exit 1'"
)
text, ready_count = re.subn(
    r"(?ms)^ExecStart=/bin/sh -c 'i=0; while \[ \"\$i\" -lt 300 \]; do DISPLAY=:0 xwininfo.*?exit 1'$",
    lambda _match: ready_line,
    text,
    count=1,
)
if ready_count != 1:
    raise RuntimeError(f'ready ExecStart: expected one match, found {ready_count}')

TARGET.write_text(text, encoding='utf-8')

lines = TARGET.read_text(encoding='utf-8').splitlines()
exec_lines = [line for line in lines if line.startswith("ExecStart=/bin/sh -c 'i=0;")]
if len(exec_lines) != 1:
    raise RuntimeError(f'expected exactly one readiness ExecStart line, found {len(exec_lines)}')
line = exec_lines[0]
for marker in (
    r'GORICS_OPENBOX_READY\nGORICS_TINT2_READY',
    r'GORICS_VISIBLE_WINDOW_READY\nGORICS_WEB_GUI_READY\n',
    r'GORICS_WEB_GUI_FAILED\n',
    r'--- %s ---\n',
):
    if marker not in line:
        raise RuntimeError(f'missing literal escape marker: {marker}')
print('fixed visible desktop shell/systemd escaping')
