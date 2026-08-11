from __future__ import annotations

import html as html_lib
import json
import re
import time
from collections import deque
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen

DASHBOARD = Path("airbnb/index.html")
DATA_FILE = Path("airbnb/candidates.json")
KST = timezone(timedelta(hours=9))
BASE = "https://realty.daangn.com"
MAX_PAGES = 70
MAX_CANDIDATES = 20
TOP_DISPLAY = 10

# 부산 각 권역의 공개 매물 페이지를 출발점으로 삼고, 페이지의 관련 매물 링크를
# 저빈도로 따라가며 후보를 확장한다. 검색엔진/API 키에 의존하지 않는 폴백 구조다.
SEED_URLS = [
    f"{BASE}/articles/3259734",  # 영도 청학동
    f"{BASE}/articles/1198391",  # 영도 동삼동
    f"{BASE}/articles/3207454",  # 동구 범일동
    f"{BASE}/articles/3462277",  # 기장 일광
    f"{BASE}/articles/4008705",  # 부산진 전포
    f"{BASE}/articles/3834829",  # 동구 범일
    f"{BASE}/articles/3917769",  # 수영 광안
    f"{BASE}/articles/4015207",  # 수영 망미
    f"{BASE}/articles/3074397",  # 기장 일광
]

BASELINE = [
    ("영도 청학동", f"{BASE}/articles/3259734"),
    ("영도 동삼동", f"{BASE}/articles/1198391"),
    ("동구 범일동", f"{BASE}/articles/3207454"),
]

UA = (
    "Mozilla/5.0 (compatible; StargateDashboard/2.0; "
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
            return None, True  # 차단 가능성: 삭제로 오판하지 않음
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

    # 초기자본/고정비 35점
    score += max(0, round(12 * (1 - deposit / 1000)))
    score += max(0, round(23 * (1 - rent / 100)))
    if rent <= 50:
        reasons.append("낮은 월세")
    if deposit <= 500:
        reasons.append("낮은 보증금")

    # 객실 구성 10점
    score += min(10, 3 + (rooms - 2) * 4)
    if rooms >= 3:
        reasons.append("3룸+")

    # 주택 용도/인허가 리스크 25점 중심
    lscore, risk = legal_score(kind, text)
    score += lscore
    item["legal_risk"] = risk
    if risk == "상대적으로 낮음":
        reasons.append("주택용도")

    # 관광 입지 15점
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

    # 신선도 10점
    if days <= 1:
        score += 10
        reasons.append("최근 등록")
    elif days <= 7:
        score += 7
        reasons.append("7일 이내")
    elif days <= 30:
        score += 4

    # 게시자 설명 속 에어비앤비 가능 문구는 법적 확인 전제의 약한 가점만 부여
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

    # 소자본 기본 필터
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
        source, reachable = request_html(url)
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
        key=lambda x: (x["score"], -x["rent"], -x["rooms"], -x["deposit"]),
        reverse=True,
    )[:MAX_CANDIDATES]
    return ranked, len(seen), successful_pages


def money(v: int) -> str:
    return f"{v:,}"


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
            f'<td><b>{money(item["deposit"])}/{money(item["rent"])}</b>만원</td>'
            f'<td>방 {item["rooms"]} · {area}</td>'
            f'<td><b class="good">{item["score"]}점</b><br><span class="note">{html_lib.escape(reasons)}</span></td>'
            f'<td>{html_lib.escape(item["legal_risk"])}{claim}</td>'
            f'<td><a href="{item["url"]}" target="_blank" rel="noopener">확인 ↗</a></td>'
            "</tr>"
        )

    body = "".join(rows) or '<tr><td colspan="7">오늘 자동 필터를 통과한 신규 후보가 없습니다. 기존 기준 후보를 확인하세요.</td></tr>'
    return f'''<!-- AIRBNB_DISCOVERY_START -->
  <div class="card" id="daily-discovery">
    <h2>매일 자동 발굴 · 투자점수 TOP {min(TOP_DISPLAY, len(candidates))}</h2>
    <div class="d">공개 부산 매물의 관련 매물 링크를 저빈도로 탐색해 보증금 ≤1,000만 원, 월세 ≤100만 원, 방 2개 이상을 필터링합니다. 총 {crawled}개 URL 탐색 · {successful}개 페이지 응답 · 조건충족 {len(candidates)}건. 점수는 고정비·객실·주택용도·관광입지·신선도 기준이며 숙박영업 가능 판정이 아닙니다.</div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>순위</th><th>지역/유형</th><th>보증금/월세</th><th>구조</th><th>투자점수</th><th>인허가 리스크</th><th>매물</th></tr></thead>
        <tbody>{body}</tbody>
      </table>
    </div>
    <div class="note">※ NEW는 전일 저장 목록에 없던 URL입니다. ‘게시자 가능 언급’은 매물 설명상의 주장일 뿐 합법 영업을 보증하지 않습니다. 계약 전 관할 구청·건축물대장·임대인 서면동의·관리규약을 별도 확인하세요. 원자료: <a href="candidates.json">candidates.json</a></div>
  </div>
<!-- AIRBNB_DISCOVERY_END -->'''


def update_dashboard(candidates: list[dict], crawled: int, successful: int, status_text: str, today: str) -> None:
    page = DASHBOARD.read_text(encoding="utf-8")
    page = page.replace("<h2>오늘 검토 후보 3건</h2>", "<h2>기준 후보 3건</h2>")

    updated = (
        f'<div class="updated">기준일: {today} · Stargate Visual Lab · '
        f'매일 09:30 KST 자동발굴 · {status_text}</div>'
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

    DASHBOARD.write_text(page, encoding="utf-8")


def main() -> None:
    today = datetime.now(KST).strftime("%Y-%m-%d")

    baseline_checked = []
    for name, url in BASELINE:
        _, reachable = request_html(url)
        baseline_checked.append((name, reachable))

    reachable = sum(status is True for _, status in baseline_checked)
    removed = sum(status is False for _, status in baseline_checked)
    unknown = sum(status is None for _, status in baseline_checked)

    candidates, crawled, successful = crawl_candidates()
    new_count = sum(bool(item.get("is_new")) for item in candidates)
    status_text = f"기준후보 {reachable}/{len(BASELINE)} 응답 · 자동후보 {len(candidates)}건 · 신규 {new_count}건"
    if removed:
        status_text += f" · 삭제추정 {removed}"
    if unknown:
        status_text += f" · 확인보류 {unknown}"

    payload = {
        "checked_at_kst": datetime.now(KST).isoformat(timespec="seconds"),
        "filters": {"max_deposit_manwon": 1000, "max_rent_manwon": 100, "min_rooms": 2},
        "crawl": {"visited_urls": crawled, "successful_pages": successful, "max_pages": MAX_PAGES},
        "baseline": [{"name": name, "reachable": status} for name, status in baseline_checked],
        "candidates": candidates,
        "disclaimer": "투자점수는 사전 탐색용이며 숙박업 인허가 가능성을 보증하지 않습니다.",
    }
    DATA_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    update_dashboard(candidates, crawled, successful, status_text, today)

    print(today, status_text)
    print(f"crawl: visited={crawled}, successful={successful}")
    for item in candidates[:TOP_DISPLAY]:
        print(f"- {item['score']:3d} {item['district']} {item['dong']} {item['deposit']}/{item['rent']} 방{item['rooms']} {item['url']}")


if __name__ == "__main__":
    main()
