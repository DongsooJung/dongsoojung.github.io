# exim-proxy-kr · 수출입은행 환율 API 국내 리전 프록시

수출입은행 환율 API가 GitHub Actions(미국 IP)를 302로 차단하므로, 이 함수를
**Vercel 서울(icn1) 리전**에 배포해 국내 IP로 중계한다. `fetch_data.py`는
`EXIM_PROXY_BASE` 환경변수가 있으면 이 프록시를 경유한다.

## 1) 배포 (사용자 계정에서 1회)

> 자동화 도구에는 Vercel **프로젝트 생성 권한이 없어** 배포는 계정 소유자가 직접 합니다.

**대시보드 방식**
1. <https://vercel.com/new> → 이 저장소(`dongsoojung.github.io`) Import
2. **Root Directory** 를 `exchange-rate/proxy` 로 지정, Framework Preset `Other`
3. Deploy → 배포 URL 확인 (예: `https://exim-proxy-kr.vercel.app`)

**또는 CLI**
```bash
cd exchange-rate/proxy
npx vercel --prod
```

## 2) 리전·통과 여부 자가 진단 (배포 직후 1회)

```bash
curl -i "https://<배포도메인>/api/exim?searchdate=20240102&data=AP01" \
  -H "x-exim-authkey: <수출입은행 인증키>"
```

- 응답 헤더 **`x-proxy-region: icn1`** 이어야 서울 리전 → 우회 성공 기대
  - `icn1` 이 아니면(예: `iad1`) 리전 미적용. Vercel 프로젝트 **Settings → Functions → Region** 을 **Seoul (icn1)** 로 변경 후 재배포. (일부 무료 플랜은 단일 리전만 변경 가능)
- 본문이 `[{ "result":1, "cur_unit":"USD", ... }]` 처럼 오면 **통과 성공**
- 본문이 `{"error":"upstream_redirect", ...}` 이면 해당 리전에서도 차단 → 국내 VPS/PC 방식으로 폴백 검토

## 3) GitHub Actions 연동

저장소 **Settings → Secrets → Actions** 에 추가:

| 시크릿 | 값 |
|--------|-----|
| `EXIM_PROXY_BASE` | `https://<배포도메인>/api/exim` |
| `EXIM_API_KEY` | (기존) 수출입은행 인증키 — 프록시에 헤더로 전달됨 |

이후 워크플로우가 실행되면 `fetch_data.py`가 프록시를 경유해 환율을 수집하고
`data.json`을 `sourceMode: "api"` 정밀치로 갱신한다.

## 보안 메모
- 프록시는 koreaexim 단일 엔드포인트로만 중계하며, 인증키는 호출자가 헤더로 전달한다(코드/환경변수에 저장 안 함).
- 공개 엔드포인트이므로, 남용이 우려되면 Vercel의 Deployment Protection 또는 함수 내 토큰 검사를 추가할 수 있다.
