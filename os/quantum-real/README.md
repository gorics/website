# GORICS Quantum OS WebBoot

이 폴더는 `os/` 탭에서 실제 Linux ISO를 브라우저 안의 x86 가상머신으로 부팅하기 위한 정적 페이지입니다.

## 핵심

- `index.html`은 가짜 OS UI가 아니라 VM 실행기입니다.
- VM 엔진은 v86 WebAssembly x86 PC emulator입니다.
- 내장 ISO 경로: `assets/gorics-quantum-webboot-i386.iso`
- 브라우저 자동 부팅 호환을 위해 ISO는 32-bit BIOS 부팅용으로 빌드합니다.
- x86_64 UEFI 전용 ISO는 실제 PC/QEMU용으로는 가능하지만 v86에서는 64-bit 미지원 때문에 그대로 부팅되지 않습니다.

## 빌드

GitHub Actions:

```bash
.github/workflows/build-quantum-os-iso.yml
```

로컬 Linux:

```bash
cd os/quantum-real
bash scripts/build-browser-iso.sh
python3 -m http.server 8080
```

그다음 `http://localhost:8080`에서 부팅합니다.

## 런타임 명령

부팅 후 작은 BusyBox 기반 셸이 뜹니다.

- `help`
- `desktop`
- `apps`
- `net-up`
- `browser <url>`
- `shell`
- `reboot`
- `poweroff`
