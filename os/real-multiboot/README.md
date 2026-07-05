# GORICS Web Linux GUI OS

`os/real-multiboot/`의 목적은 멀티부트 테스트장이 아니라, 웹에서만 실행되는 GORICS Linux 기반 GUI OS 서비스를 제공하는 것입니다.

## 서비스 기준

- 메인: GORICS Web Linux GUI OS
- 실행 방식: 브라우저 안에서 v86으로 실제 x86 Linux GUI 게스트 부팅
- 대상 기기: 모바일, 태블릿, PC 반응형 화면
- 설치 방식: 설치 없음, 웹 접속만 사용
- 로그: 런타임, 이미지, 화면 이벤트를 복사 가능한 상세 로그로 제공

## 부팅 우선순위

1. GORICS Web Linux GUI OS: 기본 메인 서비스
2. GORICS Safe Linux Mode: 메인 실패 시 대체 Linux 모드
3. 호환성 옵션: Tiny Linux, FreeDOS, Windows 1.01

## 중요한 원칙

- 남의 테스트 이미지는 메인이 아니라 선택 옵션으로만 둡니다.
- 기본 선택값과 자동 부팅 대상은 항상 `gorics-web-linux-main`입니다.
- probe 실패만으로 부팅을 막지 않고, 실제 v86 인스턴스 생성을 먼저 시도합니다.
- 다운로드 오류가 발생하면 GORICS Safe Linux Mode로 자동 전환합니다.
- 공식 v86 프로필은 참고용 새 창 링크로만 제공합니다.
