from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

DASHBOARD = Path("airbnb/index.html")
KST = timezone(timedelta(hours=9))
CANDIDATES = [
    ("영도 청학동", "https://realty.daangn.com/articles/3259734"),
    ("영도 동삼동", "https://realty.daangn.com/articles/1198391"),
    ("동구 범일동", "https://realty.daangn.com/articles/3207454"),
]


def listing_reachable(url: str) -> bool | None:
    request = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; StargateDashboard/1.0; +https://www.stargateedu.co.kr/airbnb/)"
        },
    )
    try:
        with urlopen(request, timeout=15) as response:
            return response.status < 400
    except HTTPError as exc:
        # 401/403/429 can mean bot protection while the listing still exists.
        if exc.code in (401, 403, 429):
            return True
        if exc.code in (404, 410):
            return False
        return None
    except (URLError, TimeoutError, OSError):
        return None


def main() -> None:
    html = DASHBOARD.read_text(encoding="utf-8")
    checked = [(name, listing_reachable(url)) for name, url in CANDIDATES]
    reachable = sum(status is True for _, status in checked)
    removed = sum(status is False for _, status in checked)
    unknown = sum(status is None for _, status in checked)
    today = datetime.now(KST).strftime("%Y-%m-%d")

    status_text = f"후보 링크 {reachable}/{len(CANDIDATES)} 응답"
    if removed:
        status_text += f" · 삭제 추정 {removed}"
    if unknown:
        status_text += f" · 확인보류 {unknown}"

    updated = (
        f'<div class="updated">기준일: {today} · Stargate Visual Lab · '
        f'매일 09:30 KST 자동점검 · {status_text}</div>'
    )
    pattern = r'<div class="updated">.*?</div>'
    new_html, count = re.subn(pattern, updated, html, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError("Could not find dashboard updated marker")

    DASHBOARD.write_text(new_html, encoding="utf-8")
    print(today, status_text)
    for name, status in checked:
        print(f"- {name}: {status}")


if __name__ == "__main__":
    main()
