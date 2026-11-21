# Stargate Windows 데스크탑 앱

`https://stargateedu.co.kr/` 을 주소창 없는 Windows 창으로 엽니다. Android 앱(`app/twa-manifest.json`)과 같이 사이트 파일을 앱 안에 넣지 않습니다. 포털을 고친 뒤 새로고침하면 창에 반영됩니다.

## VS Code에서 열기

1. [Node.js 22.12 이상](https://nodejs.org/)을 설치합니다. Electron 45가 이 버전을 요구합니다.
2. 이 저장소를 그대로 둔 채 VS Code에서 루트의 `Stargate-Desktop.code-workspace` 를 엽니다.
   폴더로 열어도 같은 실행 구성이 `.vscode/launch.json` 에 있습니다.
3. 실행 및 디버그에서 **로컬 포털을 창으로 열기** 를 고르고 F5 를 누릅니다.
   처음 한 번은 `desktop` 의존성을 설치합니다.
4. 포털 HTML·CSS·JS를 수정하고 창에서 `Ctrl+R` 로 확인합니다.

**운영 사이트를 창으로 열기** 는 로컬 파일 대신 `https://stargateedu.co.kr/` 을 엽니다.

터미널에서 직접 실행할 때:

```bash
cd desktop
npm install
npm test
npm run dev
npm start
```

`npm run dev` 는 저장소 루트를 `127.0.0.1` 에서만 제공합니다. `npm start` 는 운영 사이트입니다.

## Windows 설치 파일

Windows의 VS Code 터미널에서:

```bash
cd desktop
npm install
npm run dist:win
```

산출물은 `desktop/dist/Stargate-Setup-0.1.0.exe` 입니다. 이 파일은 서명하지 않으므로 SmartScreen 경고가 납니다. 설치 파일과 서명키(`*.pfx`, `CSC_LINK`)는 커밋하지 않습니다. 이 저장소는 루트가 공개 페이지로 서빙됩니다.

작업 메뉴의 **desktop: Windows 설치 파일** 도 같은 명령을 실행합니다.

## 창이 하는 일

- `stargateedu.co.kr`, `www.stargateedu.co.kr` 과 카카오·네이버 로그인 화면은 창 안에 둡니다.
- Play 스토어, 오픈카톡, GitHub, 다른 서비스 링크는 기본 브라우저로 엽니다.
- `127.0.0.1` 은 개발 모드의 로컬 서버만 허용합니다.
- 상담 페이지의 네이버 콜백은 운영 도메인으로 등록되어 있습니다. 로컬 개발 창에서 로그인을 마치면 운영 사이트로 돌아갑니다.
- 네트워크가 없으면 창 안의 다시 시도 화면이 나옵니다. 대시보드 데이터는 온라인이 필요합니다.
