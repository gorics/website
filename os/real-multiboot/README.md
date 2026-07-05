# GORICS Web Linux GUI OS / Real Multiboot

`os/real-multiboot/`는 HTML로 흉내낸 OS가 아니라, 브라우저 안에서 v86으로 실제 x86 OS 이미지를 부팅하는 웹 전용 OS 서비스 진입점입니다.

## 목표

- 웹에서만 실행
- Linux 기반 GUI OS 서비스를 기본값으로 제공
- 모바일, 태블릿, PC 반응형 화면 대응
- 설치 없이 실제 ISO/IMG/BZIMAGE를 v86으로 부팅
- 실패 원인을 복사 가능한 상세 로그로 남김

## 기본 프리셋

- Damn Small Linux GUI ISO: 기본 GUI 부팅 대상
- Tiny Linux ISO: GUI ISO 실패 시 대체 Linux 부팅
- Buildroot Linux 6.8: 가장 빠른 Linux 동작 확인
- FreeDOS 7.22
- Windows 1.01

## 구현 원칙

- iframe 임베드 우회에 의존하지 않고 직접 v86 인스턴스를 생성합니다.
- HEAD/RANGE probe는 진단용으로만 사용하고, probe 실패만으로 부팅을 막지 않습니다.
- 이미지 다운로드 실패 이벤트가 발생하면 Linux 대체 프리셋으로 자동 전환합니다.
- 공식 v86 프로필은 별도 새 창 링크로만 제공합니다.
