# Real OS Multiboot

`os/real-multiboot/`는 기존 `os/` 하위 코드 수정 없이 추가된 실제 OS 부팅 폴더입니다.

## 포함된 OS
- Linux (Buildroot kernel + rootfs)
- Linux (DSL ISO)
- Windows 98 (disk image)
- Windows 2000 (disk image)

모두 v86 에뮬레이터로 실제 이미지 부팅을 수행합니다.
