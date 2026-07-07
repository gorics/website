# GORICS Linux GUI OS ISO

This directory contains the real Linux-based GUI OS ISO builder for GORICS.

## Output

GitHub Actions builds:

- `gorics-linux-gui-os-amd64.iso`
- `SHA256SUMS.txt`

The ISO is built with Debian Live Build and includes:

- Debian live base
- Linux kernel
- XFCE desktop GUI
- LightDM greeter
- Firefox ESR
- XFCE Terminal
- Thunar file manager
- Mousepad editor
- Python 3
- Korean locale/font support
- GORICS welcome launcher

## Build locally

Run on Debian/Ubuntu with root privileges:

```bash
sudo apt-get update
sudo apt-get install -y live-build xorriso isolinux syslinux-common squashfs-tools debootstrap ca-certificates
sudo bash os/iso/build-gorics-linux-gui-iso.sh
```

Output is written to:

```text
out/gorics-linux-gui-os-amd64.iso
```
