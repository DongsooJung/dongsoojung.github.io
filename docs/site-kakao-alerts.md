# 홈페이지 접속·링크 클릭 운영자 알림

대상: `https://www.stargateedu.co.kr` 및 apex. 기존 방문 분석의 `page_view`, `click` 중 링크 이벤트를 사용한다. 홈페이지 접속은 페이지 로드 기록이며 외부에서 URL을 실제 클릭했다는 증거가 아니다. 이름·휴대폰 번호를 수집하거나 익명 방문자를 고객명과 연결하지 않는다. SOLAPI 단축 캠페인의 과거 클릭 내역을 가져오는 기능은 아니다.

## 카카오 알림톡 심사용 초안

템플릿명: 스타게이트 웹 이용 운영 알림

```text
[스타게이트 웹 이용 알림]
운영자님, 홈페이지 이용 기록이 도착했습니다.
집계 시각: #{시각}
페이지 접속: #{접속수}회
링크 클릭: #{클릭수}회
최근 페이지: #{페이지}
최근 클릭 링크: #{링크}
이 알림은 익명 이용 통계이며 고객의 이름이나 연락처를 포함하지 않습니다.
```

운영자가 신청한 웹사이트 운영 통계 알림이다. 광고, 홍보 문구나 고객 개인정보를 넣지 않는다. 카카오의 템플릿 승인 여부는 심사로 결정된다. 승인된 본문과 변수 이름이 코드의 `ALERT_TEMPLATE`와 같아야 한다. 심사 중 문구 변경이 필요하면 코드도 함께 수정한다.

## 연결할 설정

기존 Worker의 `SOLAPI_API_KEY`, `SOLAPI_API_SECRET`을 재사용한다. 추가 secret은 `CLICK_ALERT_TO`(운영자가 지정한 수신 번호, 숫자만), `CLICK_ALERT_PFID`, `CLICK_ALERT_TEMPLATE_ID`다. 번호·비밀 키를 정적 파일이나 Git에 넣지 않는다. 현재 `CLICK_ALERTS_ENABLED=false`로 발송하지 않는다.

1. SOLAPI에서 카카오 비즈니스 채널을 연결한다.
2. 위 문안을 운영 알림 템플릿으로 등록하고 승인을 받는다.
3. 수신 번호·채널 ID·템플릿 ID를 Worker secret에 저장한다.
4. 승인된 본문을 대조한 뒤 `CLICK_ALERTS_ENABLED=true`로 배포한다. 실제 발송은 유료다. 운영자에게 테스트 1건을 보내고 SOLAPI 수신 결과를 확인한다.

일반 분석 API 응답은 유지한다. 이벤트는 동일 방문자·종류·페이지·링크별 한국시간 하루 한 번만 알림에 포함하고, 1분 동안 모아 한 건으로 발송한다. 하루 최대 발송 시도는 30건이다. 사이트에서 이미 수집한 기록 중 삽입에 성공한 신규 이벤트만 처리한다. 제한에 걸린 이벤트는 기존 분석 통계에 남지만 알림은 생략한다. 공개 API이므로 origin 검사는 봇 인증이 아니다. 발송량 상한이 비용을 제한하며 봇·링크 미리보기가 실제 방문과 섞일 수 있다.

알림에는 집계 횟수와 최근 페이지·링크만 포함한다. URL의 쿼리·fragment·입력 문구·방문자 식별값은 외부에 전송하지 않는다. 중복 집계 키는 SHA-256 해시로 최대 1,000개를 보관하며 다음 이벤트가 들어올 때 날짜별로 교체한다. 확실하지 않은 발송 결과는 자동 재시도하지 않으며 문자 대체 발송도 끈다. `accepted`는 SOLAPI 접수 성공이며 카카오 수신 완료를 뜻하지 않는다.

Cloudflare Access로 인증한 운영자는 `GET /api/admin/site-alerts`에서 필수 설정 누락, 활성 상태, 발송 시도·접수 결과를 확인할 수 있다. 공개·인증 전 요청은 거부된다. 발송 중지는 `CLICK_ALERTS_ENABLED=false`로 재배포한다. 중지 후 대기한 기록도 발송되지 않는다.

검증: `node --test tests/site-alerts.test.mjs tests/cloudflare-access.test.mjs tests/cloudflare-analytics.test.mjs tests/cloudflare-analytics-frontend.test.mjs`

공식 문서: [알림톡 API](https://solapi.com/developers/api/messages), [문자 대체 발송](https://solapi.com/developers/api/messages-disablesms).
