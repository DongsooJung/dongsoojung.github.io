---
status: ready
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
  - https://stargateedu.co.kr/korea-tourism/
---

# 계획 입력 (PLAN INTAKE)

고객은 하나다. **2026년 트렌드를 이미 아는, 한국을 방문한(또는 곧 방문하는) 외국인 관광객.** 저자가 소개하고 싶은 한국이 아니라, 이 사람이 2026년에 검색해서 끝내야 하는 일만 글로 쓴다.

공식 맥락(초안 출처로 인용 가능):
- 문화체육관광부: 2026년 상반기 방한 외래객 1,071만 명, 전년 동기 대비 약 21% 증가
- 카드 소비 10조 원 돌파, 서울 외·지방 공항 이용이 더 빨리 늘고 있음
- 22개국 K-ETA 면제는 2026-12-31까지. 대신 무료 e-Arrival Card. 유료 사칭 사이트 주의
- 서울 Climate Card / T-money / WOWPASS / Mobile T-money

```bash
node blogger-en/scripts/cli.mjs ingest
node blogger-en/scripts/cli.mjs research --fixture blogger-en/data/seeds/korea-visitor-2026.json
node blogger-en/scripts/cli.mjs draft --limit 3
```

## Customers

### 2026 trend-aware visitor first 48 hours
- Job: Land in Korea in 2026 without a visa surprise, a fake arrival-card fee, or a dead phone
- Pain: 2019 blogs still say everyone needs K-ETA; scam sites charge for the free e-Arrival Card
- Outcome: Know if K-ETA is waived for their passport, finish the free e-Arrival Card, and get into Seoul with data and transit
- Intents: K-ETA exemption 2026, Korea e-Arrival card, Incheon airport to Seoul 2026, Korea eSIM 2026, Korea travel 2026
- Geo: US, GB, AU, CA, IN, SG

### 2026 trend-aware visitor Seoul week
- Job: Spend scarce Seoul days on 2026 neighborhoods and a transit pass that matches their stay, not Myeongdong defaults
- Pain: English lists still push Namsan and duty-free; Climate Card vs T-money vs WOWPASS is explained in Korean
- Outcome: Pick a pass and a 2–3 day Seongsu / Euljiro / Ikseon plan they can run this week
- Intents: Seoul Climate Card vs T-money, Seongsu-dong itinerary, Korea cashless 2026, seoul itinerary 2026, climate card tourist
- Geo: US, GB, AU, CA, IN, SG

### 2026 trend-aware visitor beyond Seoul
- Job: Leave the capital the way 2026 visitors actually do — KTX or a regional airport — without losing a day
- Pain: Itineraries stop at Seoul; they heard Busan and Jeju are up but not how to move in 2026
- Outcome: One beyond-Seoul hop with train or airport steps and a no-car Jeju option
- Intents: Busan from Seoul KTX, Jeju without a car, korea regional airports, busan 2026, beyond seoul
- Geo: US, GB, AU, CA, IN, SG

## Content pillars

50% first-48-hours how-to (entry, airport, SIM, transit)
30% 2026 neighborhood and pass comparison
20% beyond-Seoul hop
0% author essay about Korean culture in general

## Cadence

3 customer briefings a week. Human review before any Blogger call.

## Monetization

AdSense after the customer job is stated. Transit/eSIM affiliate only if it finishes their landing or pass decision. Link official MCST / VisitKorea / korea-tourism dashboard when numbers are used.

## Voice

Hired by a foreign visitor who already follows 2026 Korea trends. Current, specific, no 2019 leftovers. Cite official 2026 rules. Do not pitch the author's other research.

## Do not

Do not write 401k, GPU, NHS, or author-portfolio posts. Do not recommend paid e-Arrival sites. Do not promise visa outcomes. No auto-publish.

## Blogger

English-only. Audience is inbound visitors reading on a phone in Seoul or on the plane.
