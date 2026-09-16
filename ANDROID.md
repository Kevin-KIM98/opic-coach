# 안드로이드 설치 가이드

## 방법 1 · APK 없이 설치 (권장, 1분)

이 앱은 PWA(설치형 웹앱)라서 Chrome이 직접 앱으로 설치해 줍니다. 홈 화면 아이콘, 전체 화면, 오프라인 실행, 자동 업데이트가 모두 됩니다.

1. 폰 **Chrome**에서 https://kevin-kim98.github.io/opic-coach/ 를 엽니다.
2. 잠시 후 화면 아래 **"OPIc Coach 설치"** 배너가 뜨면 누릅니다.
   배너가 안 뜨면 오른쪽 위 **⋮ 메뉴 → "홈 화면에 추가" 또는 "앱 설치"**.
3. 홈 화면의 **OPIc Coach** 아이콘으로 실행합니다. 이후에는 앱 서랍(전체 앱 목록)에도 나타납니다.
4. 처음 녹음할 때 마이크 권한을 **허용**합니다.

업데이트는 자동입니다. GitHub에 변경이 올라가면 다음 실행 때 새 버전이 적용됩니다 (앱을 완전히 닫았다가 다시 열면 확실합니다).

> 삼성 인터넷 브라우저도 설치를 지원하지만, **음성 인식은 Chrome이 가장 안정적**이므로 Chrome으로 설치하세요.

## 방법 2 · APK/AAB 파일이 필요한 경우

APK가 필요한 경우는 두 가지뿐입니다.
- Play 스토어에 올리고 싶을 때 (AAB 필요)
- 브라우저 없이 파일로 배포하고 싶을 때

이때는 PWA를 그대로 감싸는 **TWA(Trusted Web Activity)** 로 만듭니다. 별도 코드 없이 온라인 도구로 생성할 수 있습니다.

### PWABuilder 로 생성 (PC 브라우저에서, 설치 불필요)

1. https://www.pwabuilder.com 접속 → 주소창에 `https://kevin-kim98.github.io/opic-coach/` 입력 → **Start**.
2. **Package for stores → Android** 선택.
   - Package ID: `io.github.kevinkim98.opiccoach` (원하는 값)
   - App name: `OPIc Coach`, Short name: `OPIc Coach`
   - Signing key: **Create new** (처음이면) → 생성된 키 파일과 비밀번호는 꼭 보관
3. **Generate** → zip 다운로드. 안에 `app-release-signed.apk`(설치용), `app-release-bundle.aab`(스토어용), `assetlinks.json` 이 들어 있습니다.
4. **주소창 없애기 (중요)**: zip 안의 `assetlinks.json` 내용을 이 저장소의
   `.well-known/assetlinks.json` 에 붙여 넣고 커밋합니다. 이 파일이 없으면 앱 위에 Chrome 주소창이 보입니다.
   반영 확인: https://kevin-kim98.github.io/opic-coach/.well-known/assetlinks.json
5. APK를 폰으로 옮겨 설치합니다 (설정 → "출처를 알 수 없는 앱 허용" 필요).

### 로컬 PC에서 직접 빌드 (Bubblewrap)

Node.js가 있으므로 아래로도 가능하지만, JDK 17과 Android SDK(약 1.5GB)를 내려받습니다.

```bash
npx @bubblewrap/cli init --manifest https://kevin-kim98.github.io/opic-coach/manifest.webmanifest
npx @bubblewrap/cli build
```

첫 실행 때 JDK/SDK 자동 설치 여부를 물으면 `y`. 완료되면 `app-release-signed.apk` 와 `assetlinks.json` 이 생성되며, 이후 단계는 위 4~5와 같습니다.

## 두 방법 비교

| | PWA 설치 | TWA APK |
|---|---|---|
| 준비 | 없음 | 서명 키 생성, assetlinks 등록 |
| 업데이트 | 자동 | 웹 콘텐츠는 자동, 앱 껍데기는 재빌드 |
| 오프라인 | 됨 | 됨 |
| 음성 인식·녹음 | 됨 (Chrome 엔진) | 됨 (Chrome 엔진, 동일) |
| Play 스토어 등록 | 불가 | 가능 (AAB) |

기능과 성능은 동일합니다. 혼자 쓰는 용도라면 방법 1이 답입니다.
