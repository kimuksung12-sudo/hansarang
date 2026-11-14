# 한마음 · 케어플랜 체크 - Firebase 직원 로그인

지금 구현된 것: Firebase **이메일+비밀번호 인증**, Firestore **직원 승인 확인**, 직원 전용 업무 홈, 로그아웃, 아이디(이메일) 기억하기. 회원가입 버튼이 없으며, **기존 이메일/비밀번호를 Firebase에서 발급**합니다.

> 필수: Firebase 프로젝트를 만든 뒤 아래의 설정을 직접 마쳐야 작동합니다. Firebase 프로젝트의 실제 설정값이 없으므로 파일만 내려받아서는 계정 인증이 실행되지 않습니다.

## 1. Firebase 프로젝트 생성

1. https://console.firebase.google.com/ 에 접속합니다.
2. '프로젝트 추가'에서 `careplan-checker`처럼 **영문 프로젝트 이름**으로 만듭니다. 프로젝트 ID는 콘솔에서 확인합니다.
3. 프로젝트 홈에서 **웹 앱(`</>`) 추가**를 누르고 앱 이름을 입력해 등록합니다.
4. 콘솔의 '프로젝트 설정 → 내 앱 → SDK 설정 및 구성 → 구성'에서 `firebaseConfig`를 확인합니다.

## 2. 연결 설정

`js/firebase-config.js`를 열고 다음 네 항목에 실제 값을 넣습니다.

```js
export const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "실제-프로젝트-ID.firebaseapp.com",
  projectId: "실제-프로젝트-ID",
  appId: "1:숫자:web:문자열"
};
```

`apiKey`, `authDomain`, `projectId`, `appId`는 Firebase에서 제공하는 **웹 앱 설정값**입니다. 실제 비밀번호나 Firebase Admin 서비스 계정 키는 이 파일에 넣지 마세요.

## 3. Firebase Authentication 활성화

1. Firebase 콘솔의 **빌드/보안 → Authentication → 시작하기**를 엽니다.
2. **Sign-in method → 이메일/비밀번호 → 사용 설정 → 저장**을 누릅니다.
3. **Users → 사용자 추가**에서 직원용 이메일과 비밀번호를 생성합니다.
4. 비밀번호를 직원에게 전달할 때는 안전한 방법으로 개별 전달하고, 직원별 고유 계정을 사용하세요.

**주의:** 이메일+비밀번호 제공자를 활성화하면 웹 앱의 가입 버튼을 없애더라도 API를 통해 임의 가입을 요청할 수 있습니다. 이 샘플은 **Firestore 직원 승인 명단**에 등록된 UID만 업무 홈으로 이동할 수 있도록 추가로 제한합니다. 향후 환자 데이터도 반드시 별도 보안 규칙으로 보호해야 합니다.

## 4. Firestore 승인 명단 만들기 (필수)

1. Firebase 콘솔에서 **Firestore Database → 데이터베이스 만들기**를 선택합니다. 리전을 선택하고 프로덕션 모드로 시작해도 됩니다.
2. **규칙** 탭에 이 프로젝트의 `firestore.rules` 파일 내용을 붙여 넣은 뒤 **게시**합니다.
3. **Authentication → Users**에서 만든 직원 계정의 **사용자 UID**를 복사합니다.
4. Firestore의 **데이터** 탭에서 컬렉션 `staff`를 만들고, **문서 ID는 직원의 UID와 정확히 동일하게** 지정합니다.
5. 아래 필드를 추가합니다.

| 필드 | 유형 | 예시 |
|---|---|---|
| `active` | boolean | `true` |
| `name` | string | `홍길동` |
| `role` | string | `social_worker` |

직원이 퇴사하거나 접근을 중지하려면 `active`를 `false`로 변경하고 Authentication에서도 계정을 사용 중지하세요.

## 5. 로그인 페이지 실행

`<script type="module">`을 사용하므로 예전처럼 HTML을 바로 더블클릭하는 `file://` 방식 대신 로컬 웹 서버 또는 Firebase Hosting에서 실행해야 합니다.

- Windows: 이 폴더에서 터미널(PowerShell 또는 명령 프롬프트)을 연 다음 `py -m http.server 5500` 입력 (Python이 설치된 경우).
- 브라우저에서 `http://localhost:5500` 접속.
- Firebase Authentication → Settings → Authorized domains에서 테스트가 필요하다면 `localhost`를 추가합니다. 2025-04-28 이후 생성한 프로젝트에는 기본 추가되지 않습니다.
- 실제 직원 사용 시에는 Firebase Hosting 등 **HTTPS 사이트**에 배포하세요.

## 폴더 구조

```
careplan-login-firebase/
├── index.html                  # 로그인 페이지
├── dashboard.html              # 로그인 성공 후 업무 홈
├── css/style.css               # 기존 디자인 + 업무 홈
├── js/script.js                # 로그인 · 입력 검사 · 세션 관리
├── js/dashboard.js             # 업무 홈 접근 확인 · 로그아웃
├── js/firebase-config.js       # 본인의 Firebase 설정값을 입력
├── js/firebase-client.js       # Firebase 초기화 · 직원 승인 확인
├── assets/hanmaeum-logo.png    # 한마음 로고
├── firestore.rules             # 최소 권한 보안 규칙
└── README.md
```

## 보안 및 범위

- 직원별 비밀번호는 Firebase Authentication이 확인합니다. 자바스크립트 코드나 localStorage에는 비밀번호를 저장하지 않습니다.
- 인증 세션은 `browserSessionPersistence`로 탭/창 세션 동안만 유지합니다. 공용 PC에서는 꼭 로그아웃하세요.
- 현재 `dashboard.html`은 **계정 연결 확인용 화면**입니다. 엑셀 분석, 환자정보 저장/전송, 권한별 서비스 접근 통제는 아직 구현되지 않았습니다.
- 클라이언트의 화면 이동 제한만으로 데이터가 보호되지는 않습니다. 모든 향후 Firestore/Storage/Cloud Functions 데이터 접근을 **서버측 보안 규칙/권한 검사**로 통제해야 합니다.
- 장기요양계획서 및 케어포 자료에는 민감한 개인정보가 포함될 수 있으므로 실사용 전 접근권한, 암호화, 저장기간, 감사로그, 개인정보 처리 위탁 관련 법적 요구사항을 검토하세요.
- Firebase SDK는 13.3.0 CDN 모듈을 사용하므로 개발 중 인터넷 연결이 필요합니다.


## 연결 완료된 Firebase 웹 설정
이 배포본에는 hansarang-cdbd2 웹 앱 설정이 반영되어 있습니다. GitHub Pages 저장소의 루트에 index.html, dashboard.html, css/, js/, assets/를 업로드하세요. Firebase Authentication > 설정 > 승인된 도메인에서 GitHub Pages 도메인(예: 사용자이름.github.io)을 확인하세요. Firebase Authentication의 이메일/비밀번호 공급자를 활성화하고, Firestore Database를 생성하여 firestore.rules를 게시하고 staff/{직원 UID} 문서에 active=true, name, role을 등록해야 로그인 후 업무 홈에 접근할 수 있습니다. 로그인 페이지 인증만으로 장기요양 개인정보 접근 권한이 보장되는 것은 아닙니다.
