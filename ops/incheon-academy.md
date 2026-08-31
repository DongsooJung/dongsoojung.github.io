# Incheon academy layer

## Source and scope

Incheon Data Portal's `학원` catalog returns local subsets, not a citywide academy registry. The user-supplied Incheon portal credential is not sent to NEIS or another provider, included in browser code, or committed. This release uses the unauthenticated official Incheon Office of Education full workbook instead:

- Publication: https://www.ice.go.kr/ice/na/ntt/selectNttInfo.do?nttSn=3381948
- Snapshot: 2026-08-01; published 2026-08-24.
- Download: https://www.ice.go.kr/upload/ice/na/bbs_826/2026/08/766dd31cb1c4424eb95274aa2190fcfb.xlsx
- SHA-256: `6b1fcc5bb6067ef301c3adad20363d37864748475e9af20b504ca2e465427573`

Ten source sheets contain 74,061 course rows. Deduplicating by facility type, analysis area, normalized name and street address yields **6,839 facilities: 4,953 academies and 1,886 teaching rooms**. Neither registration IDs nor operational-status fields are available, so this is a reproducible directory-based count, not a claim about currently operating registered institutions. No individual names, contact details, addresses or course rows are published.

## Geography

The 2026-07-01 reform created 11 current districts/counties. However, 5,508 course rows in this August workbook still use old district names. Do not guess how old Jung-gu and Seo-gu records split among new districts.

The layer uses nine comparison areas covering the full source: 제물포·영종 jointly, 서해·검단 jointly, and the seven unchanged areas. 남구 is normalized to 미추홀구. Area identifiers `ic-*` are **analysis identifiers, not administrative standard codes**. The reference background comes from KOSTAT 2013 via the existing southkorea-maps dataset at a pinned commit; reclaimed land and later boundary changes are not reflected. This limitation is shown adjacent to the map. Comparing combined areas to single districts as an unqualified ranking is intentionally avoided.

## Reproduction and refresh

Keep the original workbook outside public files (for example `.vercel/incheon-source/`). With Python 3, no added packages are required:

```sh
python scripts/build-incheon-academy.py --input .vercel/incheon-source/academies-20260801.xlsx
python tests/incheon_aggregate_test.py
node --test tests/incheon-academy.test.mjs
```

The generator validates the pinned workbook, removes course duplicates, rejects incomplete/unknown addresses, reconciles totals, stages the historical reference geometry, and prerenders aggregate counts/table into all three pages. Future source publications require an explicit period/source/hash review; there is no implied live or weekly source update. The source workbook must never be included in the public build.

Existing Seoul and Gyeonggi arrays are retained. Their original dates/definitions differ, and no combined metropolitan total is asserted. The Incheon layer is linked from `/research/urban-atlas/` and included in `/sudogwon-academy-map/`; its standalone URL is `/incheon-academy-map/`.
