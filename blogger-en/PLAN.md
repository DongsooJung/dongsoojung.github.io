---
status: awaiting
language: en
blogId: ""
blogUrl: ""
blogName: ""
cadencePerWeek: 3
geos:
  - US
  - GB
  - AU
  - CA
  - IN
  - SG
adsense: true
affiliates: []
productCtas:
  - https://stargateedu.co.kr/en/
---

# 계획 입력 (PLAN INTAKE)

이 파일을 채워 주세요. 채워지면 아래 명령으로 파이프라인 설정에 반영됩니다.

```bash
node blogger-en/scripts/cli.mjs ingest
node blogger-en/scripts/cli.mjs status
```

**규칙은 하나입니다. 내가 쓰고 싶은 글이 아니라, 아래 고객이 오늘 끝내야 하는 일을 기준으로 글을 고릅니다.** 고객 섹션이 비어 있으면 실발행은 막혀 있습니다.

## Customers

(대기) 고객을 `### 이름` 블록으로 적습니다. Job / Pain / Outcome / Intents / Geo 가 있어야 주제에 매칭됩니다.

### 예시 형식 (이 예시는 지우세요)

- Job: (그 사람이 검색해서 끝내려고 하는 일)
- Pain: (지금 막히는 지점)
- Outcome: (글 읽고 나서 할 수 있어야 하는 것)
- Intents: 검색어1, 검색어2
- Geo: US, GB

## Content pillars

(대기) 그 고객이 필요한 글 유형 비율. 예: 50% how-to, 30% comparison, 20% explainer. 저자 에세이 비율은 0.

## Cadence

(대기) 주당 발행 수, 초안 버퍼, 사람이 검토하는 요일.

## Monetization

(대기) AdSense / Amazon Associates / 자사 제품 CTA. CTA는 고객의 일을 끝낼 때만.

## Voice

(대기) 이 고객에게 고용된 전문가처럼 쓸 것. 포트폴리오·연구 소개 금지.

## Do not

(대기) 내가 쓰고 싶지만 고객이 검색하지 않는 주제. 자동 발행. 의료·투자 보장.

## Blogger

(대기) 블로그 URL, Blog ID, 커스텀 도메인, 언어 English, AdSense 연결 여부.
