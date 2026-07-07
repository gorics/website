# GitHub Pages용 완전 자동 부팅 버전

이 버전은 설정 UI를 거의 없앴다.

## 진짜로 해야 하는 것

`assets/boot.img` 파일만 넣으면 된다.

끝이다.

페이지는 로드되자마자 `assets/boot.img`를 자동으로 찾고 바로 부팅한다.

## 파일명 규칙

가장 추천하는 파일명은 반드시 이거다.

`assets/boot.img`

자동 탐색 후보는 아래도 지원한다.

- `assets/windows.img`
- `assets/windows98.img`
- `assets/boot.iso`

하지만 딴 거 생각하지 말고 그냥 `boot.img`로 맞추는 게 제일 낫다.

## 추천 이미지

가장 현실적인 건 설치 완료된 Windows 98 raw HDD 이미지다.

즉:
- 확장자 `.img`
- 설치 끝난 상태
- 들어가자마자 부팅 가능한 상태

이렇게 해야 진짜로 "파일 넣으면 바로 됨"에 가장 가깝다.

## GitHub Pages 배포

이 프로젝트는 GitHub Actions 기반 Pages 배포 파일이 이미 들어 있다.

네가 할 건 사실상 이것뿐이다.

1. 이 폴더를 저장소에 그대로 올린다.
2. `assets/boot.img`를 같이 넣는다.
3. push 한다.
4. Pages가 켜져 있으면 사이트가 뜬다.

## 중요한 현실 체크

이 프로젝트가 Windows 이미지를 포함해주진 않는다.
그건 라이선스 때문에 직접 넣어야 한다.

즉 내가 없앤 건:
- 경로 입력
- RAM 선택
- HDD URL 입력
- 부팅 버튼 누르기

하지만 없앨 수 없는 건:
- Windows 이미지 자체 준비

## 실패하는 대표 원인

1. 파일명이 `boot.img`가 아님
2. 아예 `assets/` 폴더 안에 안 넣음
3. 설치 안 된 ISO만 넣고 바로 Windows가 뜨길 기대함
4. 이미지가 너무 커서 호스팅 제한에 걸림

## 결론

네 목표에 가장 가까운 방식은 이거다.

- GitHub Pages에 이 폴더 그대로 올림
- `assets/boot.img` 하나 넣음
- 사이트 열면 자동 부팅
