"""Normalize the public sitemap and discover indexable research/strategy pages.

Run from any directory: python scripts/generate-sitemap.py
The checked-in sitemap remains the allowlist for all other site sections.
"""

from __future__ import annotations

import argparse
import re
import subprocess
from datetime import date, timedelta
from html import escape
from pathlib import Path
from urllib.parse import urlparse
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
SITEMAP = ROOT / "sitemap.xml"
ORIGIN = "https://stargateedu.co.kr"
NS = "http://www.sitemaps.org/schemas/sitemap/0.9"
IMAGE_NS = "http://www.google.com/schemas/sitemap-image/1.1"
NOINDEX = re.compile(
    r'<meta\b(?=[^>]*\bname\s*=\s*["\']robots["\'])[^>]*\bcontent\s*=\s*["\'][^"\']*noindex',
    re.IGNORECASE,
)


def local_path(url: str) -> Path | None:
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in {
        "stargateedu.co.kr",
        "www.stargateedu.co.kr",
    }:
        return None
    if parsed.query or parsed.fragment:
        return None
    relative = parsed.path.strip("/")
    if ".." in Path(relative).parts:
        return None
    return ROOT / relative / "index.html" if relative else ROOT / "index.html"


def indexable(path: Path) -> bool:
    return path.is_file() and not NOINDEX.search(path.read_text(encoding="utf-8"))


def modified_date(path: Path) -> str | None:
    try:
        relative = path.relative_to(ROOT).as_posix()
        dirty = subprocess.run(
            ["git", "status", "--porcelain", "--", relative],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
        if dirty:
            return date.today().isoformat()
        result = subprocess.run(
            ["git", "log", "-1", "--format=%cs", "--", relative],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
        if result:
            date.fromisoformat(result)
            return result
    except (OSError, ValueError, subprocess.CalledProcessError):
        pass
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail if sitemap.xml is stale")
    args = parser.parse_args()
    # ElementTree parses the existing file despite the literal backslash-n text.
    # Reading existing <loc> elements preserves the intentionally curated sections.
    old_root = ET.fromstring(SITEMAP.read_text(encoding="utf-8"))
    urls: set[str] = set()
    images: dict[str, list[list[tuple[str, str]]]] = {}
    for element in old_root.findall(f"{{{NS}}}url"):
        loc = element.findtext(f"{{{NS}}}loc")
        if not loc:
            continue
        path = local_path(loc)
        if path is not None and path.exists() and not indexable(path):
            continue
        if loc.startswith("https://www.stargateedu.co.kr/"):
            loc = ORIGIN + loc.removeprefix("https://www.stargateedu.co.kr")
        urls.add(loc)
        for image in element.findall(f"{{{IMAGE_NS}}}image"):
            fields = [
                (child.tag.removeprefix(f"{{{IMAGE_NS}}}"), child.text or "")
                for child in image
                if child.tag.startswith(f"{{{IMAGE_NS}}}")
            ]
            if fields:
                images.setdefault(loc, []).append(fields)

    for section in ("research", "strategy"):
        for path in (ROOT / section).rglob("index.html"):
            if "archive" in path.relative_to(ROOT).parts or not indexable(path):
                continue
            relative = path.parent.relative_to(ROOT).as_posix()
            urls.add(f"{ORIGIN}/{relative}/")

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<urlset xmlns="{NS}" xmlns:image="{IMAGE_NS}">',
    ]
    for url in sorted(urls, key=lambda item: (item != f"{ORIGIN}/", item)):
        path = local_path(url)
        lines.extend(["  <url>", f"    <loc>{escape(url)}</loc>"])
        if path is not None and path.exists():
            lastmod = modified_date(path)
            if lastmod:
                lines.append(f"    <lastmod>{lastmod}</lastmod>")
        for image in images.get(url, []):
            lines.append("    <image:image>")
            for name, value in image:
                lines.append(f"      <image:{name}>{escape(value)}</image:{name}>")
            lines.append("    </image:image>")
        lines.append("  </url>")
    lines.append("</urlset>")
    output = "\n".join(lines) + "\n"
    if args.check:
        existing = SITEMAP.read_text(encoding="utf-8")
        # GitHub Actions uses a shallow checkout, so historical file dates may
        # be unavailable there. Compare structure while validating saved dates.
        without_dates = lambda value: re.sub(
            r"(?m)^    <lastmod>[^<]*</lastmod>\n", "", value
        )
        for element in ET.fromstring(existing).findall(f"{{{NS}}}url"):
            loc = element.findtext(f"{{{NS}}}loc") or ""
            path = local_path(loc)
            value = element.findtext(f"{{{NS}}}lastmod")
            if path is not None and path.exists() and not value:
                print(f"Missing sitemap lastmod: {loc}")
                return 1
            if value:
                try:
                    if date.fromisoformat(value) > date.today() + timedelta(days=1):
                        raise ValueError("future date")
                except ValueError:
                    print(f"Invalid sitemap lastmod: {value}")
                    return 1
        if without_dates(output) != without_dates(existing):
            print("sitemap.xml is stale; run python scripts/generate-sitemap.py")
            return 1
        print(f"sitemap.xml is current ({len(urls)} URLs)")
    else:
        SITEMAP.write_text(output, encoding="utf-8")
        print(f"Wrote {len(urls)} URLs to {SITEMAP}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
