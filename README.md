# 한마음 · 케어플랜 체크 로그인 페이지

## 실행 방법

프로젝트 폴더의 **index.html** 파일을 더블클릭하세요. 설치나 별도 서버 없이 로그인 화면을 열 수 있습니다.

## 폴더 구성

```
careplan-login-updated/
├── index.html                  # 로그인 메인 페이지 (최상위 폴더)
├── css/
│   └── style.css               # 디자인
├── js/
│   └── script.js               # 화면 동작 및 입력값 검사
└── assets/
    └── hanmaeum-logo.png       # 제공하신 사진을 참고해 정리한 투명 배경 로고
```

## 변경 사항
- index.html의 CSS 경로: `./css/style.css`
- index.html의 JS 경로: `./js/script.js`
- 로고 경로: `./assets/hanmaeum-logo.png`
- PC 및 모바일 로고를 모두 교체했습니다.

## 유의 사항
현재는 로그인 화면 시연용입니다. 실사용을 위해서는 서버에서 계정 인증, 접근 권한, HTTPS, 개인정보 보호 기능을 구현해야 합니다. 비밀번호는 브라우저 저장소에 저장하지 않습니다.
