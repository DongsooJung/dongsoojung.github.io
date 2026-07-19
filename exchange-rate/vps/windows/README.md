# 국내 Windows PC 환율 자동 갱신 키트

수출입은행 환율 API는 해외(GitHub Actions) IP를 차단합니다. 이 키트를 **한국에 있는
상시 켜둔 Windows PC**에서 한 번만 설치하면, 이후 **매월 스스로** 환율을 수집·커밋·푸시합니다.

> 금리·물가(한국은행 ECOS)는 이미 GitHub Actions에서 자동 갱신되며, 이 키트는 **환율만** 담당합니다.

## 준비물
- 한국 인터넷에 연결된 Windows PC (자동 실행 시각에 켜져 있어야 함)
- [Git for Windows](https://git-scm.com/) 와 [Python](https://www.python.org/) (설치 시 "Add to PATH" 체크)
- **수출입은행 인증키**
- **GitHub Fine-grained PAT** — `dongsoojung.github.io` 저장소 **Contents: Read and write** 권한만

## 설치 (한 번만)

1. 저장소를 받습니다(또는 이 `windows` 폴더만 복사):
   ```
   git clone https://github.com/DongsooJung/dongsoojung.github.io.git
   ```
2. `exchange-rate\vps\windows` 폴더에서 설정 파일을 만듭니다:
   ```
   copy exim-config.example.txt exim-config.txt
   ```
   `exim-config.txt` 를 메모장으로 열어 `EXIM_API_KEY`, `GH_TOKEN` 을 채우고 저장합니다.
3. **관리자 권한 PowerShell** 로 해당 폴더에서 설치를 실행합니다:
   ```
   powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1
   ```

설치하면 최초 수집이 즉시 실행되어 환율이 실데이터(`sourceMode: api`)로 바뀌고,
**매월 2일 12:00 작업 스케줄러가 자동 실행**합니다. 이후 손댈 필요가 없습니다.

## 확인
- 작업 등록 확인:  `schtasks /Query /TN EximDashboardMonthly`
- 로그:  같은 폴더의 `exim-update.log`
- 대시보드( https://stargateedu.co.kr/exchange-rate/ ) 상단 배지가
  **"자동 갱신: 수출입은행 API 연동 중"** 으로 바뀌면 성공입니다.

## 수동 1회 실행 (테스트)
```
powershell -NoProfile -ExecutionPolicy Bypass -File update.ps1
```

## 파일
| 파일 | 설명 | 인코딩 |
|------|------|--------|
| `install.ps1` | 최초 수집 + 작업 스케줄러 등록 | UTF-8(BOM) |
| `update.ps1` | 실제 수집·커밋·푸시 로직 | UTF-8(BOM) |
| `Run_Update.bat` | 스케줄러가 호출하는 실행 런처 | ASCII |
| `exim-config.example.txt` | 설정 템플릿(→ exim-config.txt) | UTF-8(BOM) |

## 보안
- `GH_TOKEN` 은 이 저장소 Contents 권한만 있는 Fine-grained PAT 를 쓰세요.
- `exim-config.txt` 와 토큰은 저장소에 커밋하지 마세요(이 폴더 밖 개인 PC에만 보관).
