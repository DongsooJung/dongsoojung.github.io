from __future__ import annotations

import html as html_lib
import json
import re
import time
from collections import deque
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

DASHBOARD = Path("airbnb/index.html")
DATA_FILE = Path("airbnb/candidates.json")
KST = timezone(timedelta(hours=9))
BASE = "https://realty.daangn.com"
MAX_PAGES = 70
MAX_CANDIDATES = 20
TOP_DISPLAY = 10

SEED_URLS = [
    f"{BASE}/articles/3259734",
    f"{BASE}/articles/1198391",
    f"{BASE}/articles/3207454",
    f"{BASE}/articles/3462277",
    f"{BASE}/articles/4008705",
    f"{BASE}/articles/3834829",
    f"{BASE}/articles/3917769",
    f"{BASE}/articles/4015207",
    f"{BASE}/articles/3074397",
]

BASELINE = [
    ("영도 청학동", f"{BASE}/articles/3259734"),
    ("영도 동삼동", f"{BASE}/articles/1198391"),
    ("동구 범일동", f"{BASE}/articles/3207454"),
]

UA = (
    "Mozilla/5.0 (compatible; StargateDashboard/3.0; "
    "+https://www.stargateedu.co.kr/airbnb/)"
)


def request_html(url: str, timeout: int = 15) -> tuple[str | None, bool | None]:
    request = Request(url, headers={"User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9"})
    try:
        with urlopen(request, timeout=timeout) as response:
            raw = response.read()
            charset = response.headers.get_content_charset() or "utf-8"
            return raw.decode(charset, errors="replace"), response.status < 400
    except HTTPError as exc:
        if exc.code in (401, 403, 429):
            return None, True
        if exc.code in (404, 410):
            return None, False
        return None, None
    except (URLError, TimeoutError, OSError):
        return None, None


def strip_html(source: str) -> str:
    source = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", source, flags=re.I | re.S)
    source = re.sub(r"<br\s*/?>", " ", source, flags=re.I)
    source = re.sub(r"</?(?:div|p|li|h\d|section|article|span|dt|dd|tr|td|th)[^>]*>", " ", source, flags=re.I)
    source = re.sub(r"<[^>]+>", " ", source)
    source = html_lib.unescape(source)
    return re.sub(r"\s+", " ", source).strip()


def first(pattern: str, text: str, flags: int = 0) -> str | None:
    match = re.search(pattern, text, flags)
    return match.group(1).strip() if match else None


def number(value: str | None) -> int | None:
    if not value:
        return None
    try:
        return int(value.replace(",", ""))
    except ValueError:
        return None


def freshness_days(text: str) -> int:
    patterns = [
        (r"(\d+)시간 전", lambda n: 0),
        (r"(\d+)일 전", lambda n: n),
        (r"(\d+)주 전", lambda n: n * 7),
        (r"(\d+)개월 전", lambda n: n * 30),
    ]
    values: list[int] = []
    for pattern, converter in patterns:
        for raw in re.findall(pattern, text):
            values.append(converter(int(raw)))
    return min(values) if values else 999


def building_type(title: str, text: str) -> str:
    detailed = first(
        r"건축물 용도\s*(제[12]종\s*근린생활시설|단독주택|다가구주택|다세대주택|공동주택|오피스텔|숙박시설)",
        text,
    )
    if detailed:
        return detailed.replace(" ", "")
    for label in ("단독/전원주택", "빌라", "아파트", "오피스텔", "상가", "사무실"):
        if label in title:
            return label
    return "확인필요"


def legal_score(kind: str, text: str) -> tuple[int, str]:
    if "에어비앤비 불가" in text or "숙박업 불가" in text:
        return -100, "명시적 불가"
    if "근린생활시설" in kind or kind in {"상가", "사무실"}:
        return -35, "높음"
    if kind in {"단독주택", "다가구주택", "단독/전원주택"}:
        return 25, "상대적으로 낮음"
    if kind in {"다세대주택", "공동주택", "빌라", "아파트"}:
        return 14, "중간"
    if kind == "오피스텔":
        return 3, "높음"
    if kind == "숙박시설":
        return 22, "별도 인허가 확인"
    return 8, "확인필요"


def score_candidate(item: dict, text: str) -> tuple[int, list[str]]:
    deposit = item["deposit"]
    rent = item["rent"]
    rooms = item["rooms"]
    kind = item["building_type"]
    district = item["district"]
    days = item["freshness_days"]

    score = 20
    reasons: list[str] = []
    score += max(0, round(12 * (1 - deposit / 1000)))
    score += max(0, round(23 * (1 - rent / 100)))
    if rent <= 50:
        reasons.append("낮은 월세")
    if deposit <= 500:
        reasons.append("낮은 보증금")

    score += min(10, 3 + (rooms - 2) * 4)
    if rooms >= 3:
        reasons.append("3룸+")

    lscore, risk = legal_score(kind, text)
    score += lscore
    item["legal_risk"] = risk
    if risk == "상대적으로 낮음":
        reasons.append("주택용도")

    tourism = 0
    if district in {"영도구", "동구", "중구", "서구"}:
        tourism += 8
    elif district in {"수영구", "해운대구", "부산진구", "기장군"}:
        tourism += 6
    keywords = ["해수욕장", "바다", "오션", "부산역", "광안리", "해운대", "흰여울", "남포", "자갈치", "전포", "역세권", "지하철"]
    hits = sum(1 for keyword in keywords if keyword in text)
    tourism += min(7, hits * 2)
    score += tourism
    if hits:
        reasons.append("관광/교통 키워드")

    if days <= 1:
        score += 10
        reasons.append("최근 등록")
    elif days <= 7:
        score += 7
        reasons.append("7일 이내")
    elif days <= 30:
        score += 4

    if "에어비앤비" in text and "가능" in text and "불가" not in text:
        score += 4
        item["host_claim"] = True
        reasons.append("게시자 가능 언급")
    else:
        item["host_claim"] = False

    return max(0, min(100, score)), reasons[:4]


def parse_listing(url: str, source: str) -> dict | None:
    title = html_lib.unescape(first(r"<title[^>]*>(.*?)</title>", source, re.I | re.S) or "")
    text = strip_html(source)
    if "부산광역시" not in title and "부산광역시" not in text:
        return None
    if "월세" not in title:
        return None

    price = re.search(r"월세\s*([\d,]+)\s*/\s*([\d,]+)만원", title)
    if not price:
        price = re.search(r"월세\s*([\d,]+)\s*/\s*([\d,]+)만원", text)
    if not price:
        return None

    deposit = number(price.group(1))
    rent = number(price.group(2))
    rooms = number(first(r"방\s*(\d+)개", text))
    if deposit is None or rent is None or rooms is None:
        return None

    district = first(r"부산광역시\s+([^\s]+(?:구|군))", title) or first(r"부산광역시\s+([^\s]+(?:구|군))", text) or "부산"
    dong = first(r"부산광역시\s+[^\s]+(?:구|군)\s+([^\s]+(?:동|읍|면))", title) or ""
    area_raw = first(r"(?:전용면적|전용|연면적)\s*([\d.]+)\s*(?:㎡|m²)", text)
    area = float(area_raw) if area_raw else None
    kind = building_type(title, text)
    days = freshness_days(text)

    if deposit > 1000 or rent > 100 or rooms < 2:
        return None
    if "에어비앤비 불가" in text or "숙박업 불가" in text:
        return None
    if "근린생활시설" in kind or kind in {"상가", "사무실"}:
        return None

    article_id = first(r"/articles/(\d+)", url) or url.rsplit("/", 1)[-1]
    item = {
        "id": article_id,
        "url": url,
        "district": district,
        "dong": dong,
        "deposit": deposit,
        "rent": rent,
        "rooms": rooms,
        "area_m2": area,
        "building_type": kind,
        "freshness_days": days,
        "title": re.sub(r"\s*\|\s*당근부동산.*$", "", title).strip(),
    }
    item["score"], item["reasons"] = score_candidate(item, text)
    return item


def discover_links(source: str) -> list[str]:
    ids = set(re.findall(r"(?:https://realty\.daangn\.com)?/articles/(\d+)", source))
    return [f"{BASE}/articles/{article_id}" for article_id in ids]


def load_previous_ids() -> set[str]:
    if not DATA_FILE.exists():
        return set()
    try:
        data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        return {str(item.get("id")) for item in data.get("candidates", []) if item.get("id")}
    except (json.JSONDecodeError, OSError):
        return set()


def crawl_candidates() -> tuple[list[dict], int, int]:
    previous_ids = load_previous_ids()
    queue = deque(SEED_URLS)
    seen: set[str] = set()
    found: dict[str, dict] = {}
    successful_pages = 0

    while queue and len(seen) < MAX_PAGES:
        url = queue.popleft()
        if url in seen:
            continue
        seen.add(url)
        source, _ = request_html(url)
        if source is None:
            continue
        successful_pages += 1

        item = parse_listing(url, source)
        if item:
            item["is_new"] = item["id"] not in previous_ids
            found[item["id"]] = item

        for link in discover_links(source):
            if link not in seen and len(queue) < MAX_PAGES * 2:
                queue.append(link)

        time.sleep(0.12)

    ranked = sorted(
        found.values(),
        key=lambda x: (x["score"], -x["rent"], -x["deposit"]),
        reverse=True,
    )[:MAX_CANDIDATES]
    return ranked, len(seen), successful_pages


def money(v: int | float) -> str:
    return f"{round(v):,}"


def discovery_section(candidates: list[dict], crawled: int, successful: int) -> str:
    rows = []
    for idx, item in enumerate(candidates[:TOP_DISPLAY], start=1):
        new_badge = '<span class="tag good">NEW</span>' if item.get("is_new") else ""
        reasons = " · ".join(item.get("reasons") or []) or "기본 조건 충족"
        area = f'{item["area_m2"]:.1f}㎡' if item.get("area_m2") else "면적 확인"
        claim = " · 게시자 가능 언급" if item.get("host_claim") else ""
        rows.append(
            "<tr>"
            f'<td class="rank">{idx}</td>'
            f'<td><b>{html_lib.escape(item["district"])} {html_lib.escape(item["dong"])}</b><br>{new_badge}<span class="tag">{html_lib.escape(item["building_type"])}</span></td>'
            f'<td><b>{money(item["deposit"])}/{money(item["rent"])}</b>만원<br><span class="note">방 {item["rooms"]} · {area}</span></td>'
            f'<td>방 {item["rooms"]}<br><span class="note">{area}</span></td>'
            f'<td>{item["freshness_days"] if item["freshness_days"] < 999 else "확인필요"}<span class="note">{ "일 전" if item["freshness_days"] < 999 else ""}</span></td>'
            f'<td><b class="good">{item["score"]}점</b><br><span class="note">공개 매물조건 기반</span></td>'
            f'<td>{html_lib.escape(item["legal_risk"])}{claim}<br><span class="note">{html_lib.escape(reasons)}</span></td>'
            f'<td><a href="{item["url"]}" target="_blank" rel="noopener">확인 ↗</a></td>'
            "</tr>"
        )

    body = "".join(rows) or '<tr><td colspan="8">오늘 자동 필터를 통과한 후보가 없습니다. 기존 기준 후보를 확인하세요.</td></tr>'
    return f'''<!-- AIRBNB_DISCOVERY_START -->
  <div class="card" id="daily-discovery">
    <h2>매일 자동 발굴 · 실매물 검증 TOP {min(TOP_DISPLAY, len(candidates))}</h2>
    <div class="d">공개 부산 월세 매물에서 보증금 ≤1,000만 원, 월세 ≤100만 원, 방 2개 이상을 필터링합니다. 가격·구조·면적·건축물 용도·게시 시점처럼 원문에서 확인된 값만 표시합니다. 총 {crawled}개 URL 탐색 · {successful}개 페이지 응답 · 조건충족 {len(candidates)}건.</div>
    <div class="table-wrap">
      <table style="min-width:1260px">
        <thead><tr><th>순위</th><th>지역/유형</th><th>보증금/월세·구조</th><th>방/면적</th><th>게시 경과</th><th>조건점수</th><th>인허가 1차검토</th><th>매물</th></tr></thead>
        <tbody>{body}</tbody>
      </table>
    </div>
    <div class="note">※ ADR·점유율·예상매출·순이익·ROI 가정값은 제거했습니다. 인허가 평가는 건축물 유형과 원문 문구를 이용한 1차 선별이며 관할기관 확인을 대체하지 않습니다. 원자료: <a href="candidates.json">candidates.json</a></div>
  </div>
<!-- AIRBNB_DISCOVERY_END -->'''


def update_dashboard(candidates: list[dict], crawled: int, successful: int, status_text: str, today: str) -> None:
    page = DASHBOARD.read_text(encoding="utf-8")
    page = page.replace("<h2>오늘 검토 후보 3건</h2>", "<h2>기준 후보 3건</h2>")

    updated = (
        f'<div class="updated">기준일: {today} · Stargate Visual Lab · '
        f'매일 09:30 KST 실매물 검증 · {status_text}</div>'
    )
    page, count = re.subn(r'<div class="updated">.*?</div>', updated, page, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError("Could not find dashboard updated marker")

    section = discovery_section(candidates, crawled, successful)
    marker_pattern = r"<!-- AIRBNB_DISCOVERY_START -->.*?<!-- AIRBNB_DISCOVERY_END -->"
    if re.search(marker_pattern, page, flags=re.S):
        page = re.sub(marker_pattern, section, page, count=1, flags=re.S)
    else:
        anchor = '<div class="card">\n    <h2>월 손익 시뮬레이터</h2>'
        if anchor not in page:
            raise RuntimeError("Could not find calculator anchor")
        page = page.replace(anchor, section + "\n\n  " + anchor, 1)

    page = re.sub(
        r'\n  <div class="card">\n    <h2>월 손익 시뮬레이터</h2>.*?(?=\n  <div class="grid2">)',
        "",
        page,
        count=1,
        flags=re.S,
    )
    page = re.sub(
        r'\n<script>\nconst \$=id=>document\.getElementById\(id\);.*?</script>',
        "",
        page,
        count=1,
        flags=re.S,
    )
    page = page.replace("Low-capital Test</span><span class=\"chip\">Scenario Calculator", "Public Listings</span><span class=\"chip\">Verified Fields")
    page = page.replace(
        "영도·동구의 저보증금 월세 후보를 기준으로 관광수요, 월 손익, 회수기간, 합법 운영 체크포인트를 한 화면에서 검토합니다.",
        "영도·동구의 공개 저보증금 월세 매물을 가격·구조·게시 시점과 합법 운영 체크포인트로 검토합니다.",
    )
    page = page.replace("투자 권유가 아닌 사업 검토용 시뮬레이션", "공개 매물 기반 사업 검토 자료")

    if candidates:
        min_deposit = min(item["deposit"] for item in candidates)
        min_rent = min(item["rent"] for item in candidates)
        page = re.sub(
            r'(<div class="stat"><div class="l">후보 최저 보증금</div><div class="v">).*?(</div>)',
            rf'\g<1>{money(min_deposit)}만원\2', page, count=1,
        )
        page = re.sub(
            r'(<div class="stat"><div class="l">후보 최저 월세</div><div class="v">).*?(</div>)',
            rf'\g<1>{money(min_rent)}만원\2', page, count=1,
        )
        page = page.replace("후보 최저 월세", "후보 최저 월세", 1)
        if "자동후보 최고 예상순익" not in page:
            page = page.replace(
                '<div class="stats">',
                '<div class="stats">',
                1,
            )

    DASHBOARD.write_text(page, encoding="utf-8")


def main() -> None:
    now = datetime.now(KST)
    today = now.strftime("%Y-%m-%d")

    baseline_checked = []
    for name, url in BASELINE:
        _, reachable = request_html(url)
        baseline_checked.append((name, reachable))

    reachable = sum(status is True for _, status in baseline_checked)
    removed = sum(status is False for _, status in baseline_checked)
    unknown = sum(status is None for _, status in baseline_checked)

    candidates, crawled, successful = crawl_candidates()
    new_count = sum(bool(item.get("is_new")) for item in candidates)
    status_text = (
        f"기준후보 {reachable}/{len(BASELINE)} 응답 · 실매물 후보 {len(candidates)}건 · 신규 {new_count}건"
    )
    if removed:
        status_text += f" · 삭제추정 {removed}"
    if unknown:
        status_text += f" · 확인보류 {unknown}"

    payload = {
        "checked_at_kst": now.isoformat(timespec="seconds"),
        "filters": {"max_deposit_manwon": 1000, "max_rent_manwon": 100, "min_rooms": 2},
        "source_mode": "public-listings",
        "crawl": {"visited_urls": crawled, "successful_pages": successful, "max_pages": MAX_PAGES},
        "baseline": [{"name": name, "reachable": status} for name, status in baseline_checked],
        "candidates": candidates,
        "disclaimer": "공개 매물 원문에서 확인한 값만 수록하며 인허가 가능 여부는 별도 확인이 필요합니다.",
    }
    DATA_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    update_dashboard(candidates, crawled, successful, status_text, today)

    print(today, status_text)
    print(f"crawl: visited={crawled}, successful={successful}")
    for item in candidates[:TOP_DISPLAY]:
        print(
            f"- {item['score']:3d} {item['district']} {item['dong']} {item['deposit']}/{item['rent']} "
            f"방{item['rooms']} 유형={item['building_type']} 게시경과={item['freshness_days']}일 {item['url']}"
        )


if __name__ == "__main__":
    main()
