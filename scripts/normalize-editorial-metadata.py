"""Keep research/ and strategy/ HTML metadata in sync with page titles.

Run with --write to normalize metadata, or --check in CI to detect drift.
Noindex pages are deliberately excluded from social metadata generation.
"""

from __future__ import annotations

import argparse
import html
import re
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "https://stargateedu.co.kr"
DEFAULT_IMAGE = f"{ORIGIN}/assets/og/research-strategy.jpg"
TAG_RE = re.compile(r"<(?:meta|link)\b[^>]*>", re.IGNORECASE)
HEAD_RE = re.compile(r"<head\b[^>]*>(.*?)</head\s*>", re.IGNORECASE | re.DOTALL)
TITLE_RE = re.compile(r"<title\b[^>]*>(.*?)</title\s*>", re.IGNORECASE | re.DOTALL)


class Attributes(HTMLParser):
    def __init__(self, tag: str):
        super().__init__(convert_charrefs=True)
        self.attrs: dict[str, str] = {}
        self.feed(tag)

    def handle_starttag(self, _tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.attrs = {key.lower(): value or "" for key, value in attrs}


def attribute(tag: str, name: str) -> str:
    return Attributes(tag).attrs.get(name, "")


def escaped(value: str) -> str:
    return html.escape(value, quote=True)


def normalize(path: Path, source: str) -> str:
    head_match = HEAD_RE.search(source)
    if not head_match:
        raise ValueError(f"Missing <head>: {path}")
    head = head_match.group(1)
    tags = TAG_RE.findall(head)
    if any(
        attribute(tag, "name").lower() == "robots"
        and "noindex" in attribute(tag, "content").lower()
        for tag in tags
    ):
        return source

    title_match = TITLE_RE.search(head)
    title = html.unescape(title_match.group(1)).strip() if title_match else ""
    descriptions = [
        attribute(tag, "content")
        for tag in tags
        if attribute(tag, "name").lower() == "description"
    ]
    if not title or len(descriptions) != 1 or not descriptions[0].strip():
        raise ValueError(f"Expected one nonempty title and description: {path}")
    description = descriptions[0].strip()

    relative = path.relative_to(ROOT).parent.as_posix()
    url = f"{ORIGIN}/{relative}/" if relative != "." else f"{ORIGIN}/"
    image = next(
        (
            attribute(tag, "content")
            for tag in tags
            if attribute(tag, "property").lower() == "og:image"
        ),
        DEFAULT_IMAGE,
    )
    image = image.replace("https://www.stargateedu.co.kr/", f"{ORIGIN}/")
    kind = "website" if relative in ("research", "strategy") else "article"
    image_alt = (
        "F-2, F-5 and F-6 Korea immigration policy research dashboard"
        if relative == "research/immigration-policy"
        else "STARGATE research and strategy insights"
    )
    locale_alternate = (
        '<meta property="og:locale:alternate" content="en_US">'
        if relative == "research/immigration-policy"
        else ""
    )

    def remove_tag(match: re.Match[str]) -> str:
        tag = match.group(0)
        attrs = Attributes(tag).attrs
        if attrs.get("rel", "").lower() == "canonical":
            return ""
        if attrs.get("property", "").lower().startswith("og:"):
            return ""
        if attrs.get("name", "").lower().startswith("twitter:"):
            return ""
        return tag

    clean = TAG_RE.sub(remove_tag, head)
    clean = re.sub(r"(?m)^[ \t]+$", "", clean)
    clean = re.sub(r"\n{3,}", "\n\n", clean)
    block = "\n".join(
        (
            f'<link rel="canonical" href="{escaped(url)}">',
            f'<meta property="og:type" content="{kind}">',
            f'<meta property="og:site_name" content="STARGATE">',
            '<meta property="og:locale" content="ko_KR">',
            locale_alternate,
            f'<meta property="og:title" content="{escaped(title)}">',
            f'<meta property="og:description" content="{escaped(description)}">',
            f'<meta property="og:url" content="{escaped(url)}">',
            f'<meta property="og:image" content="{escaped(image)}">',
            '<meta property="og:image:type" content="image/jpeg">',
            '<meta property="og:image:width" content="1200">',
            '<meta property="og:image:height" content="630">',
            f'<meta property="og:image:alt" content="{escaped(image_alt)}">',
            '<meta name="twitter:card" content="summary_large_image">',
            f'<meta name="twitter:title" content="{escaped(title)}">',
            f'<meta name="twitter:description" content="{escaped(description)}">',
            f'<meta name="twitter:image" content="{escaped(image)}">',
        )
    )
    clean = clean.rstrip() + "\n" + block.replace("\n\n", "\n") + "\n"
    return source[: head_match.start(1)] + clean + source[head_match.end(1) :]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--write", action="store_true")
    action.add_argument("--check", action="store_true")
    args = parser.parse_args()
    changed: list[Path] = []
    for section in ("research", "strategy"):
        for path in sorted((ROOT / section).rglob("index.html")):
            source = path.read_text(encoding="utf-8")
            result = normalize(path, source)
            if result != source:
                changed.append(path.relative_to(ROOT))
                if args.write:
                    path.write_text(result, encoding="utf-8")
    for path in changed:
        print(path)
    print(f"{len(changed)} page(s) {'updated' if args.write else 'need updates'}")
    return int(args.check and bool(changed))


if __name__ == "__main__":
    raise SystemExit(main())
