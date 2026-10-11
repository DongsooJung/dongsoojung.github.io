"""Validate metadata and sitemap for public research/strategy landing pages."""
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse
import xml.etree.ElementTree as ET
import struct

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://stargateedu.co.kr'


class HeadParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags = []
        self.title = ''
        self.in_title = False

    def handle_starttag(self, tag, attrs):
        if tag == 'title':
            self.in_title = True
        self.tags.append((tag, dict(attrs)))

    def handle_endtag(self, tag):
        if tag == 'title':
            self.in_title = False

    def handle_data(self, data):
        if self.in_title:
            self.title += data

    def value(self, tag, key, match, result):
        return next((attrs.get(result) for t, attrs in self.tags if t == tag and attrs.get(key) == match), None)


def parse(path):
    parser = HeadParser()
    parser.feed(path.read_text(encoding='utf-8').split('</head>', 1)[0])
    return parser


def image_size(path):
    data = path.read_bytes()
    if data.startswith(b'\x89PNG\r\n\x1a\n'):
        return struct.unpack('>II', data[16:24])
    if data.startswith(b'\xff\xd8'):
        pos = 2
        while pos + 4 < len(data):
            if data[pos] != 0xff:
                pos += 1
                continue
            marker = data[pos+1]
            pos += 2
            if marker in (0xd8, 0xd9, 0x01) or 0xd0 <= marker <= 0xd7:
                continue
            length = int.from_bytes(data[pos:pos+2], 'big')
            if marker in (0xc0, 0xc1, 0xc2, 0xc3):
                return (int.from_bytes(data[pos+5:pos+7], 'big'),
                        int.from_bytes(data[pos+3:pos+5], 'big'))
            pos += length
    raise AssertionError(f'Unsupported image or missing dimensions: {path}')


def main():
    sitemap_root = ET.parse(ROOT/'sitemap.xml').getroot()
    ns = '{http://www.sitemaps.org/schemas/sitemap/0.9}'
    sitemap_urls = [node.find(ns+'loc').text for node in sitemap_root.findall(ns+'url')]
    assert len(sitemap_urls) == len(set(sitemap_urls)), 'Duplicate sitemap URL'
    assert all(url.startswith(BASE + '/') for url in sitemap_urls), 'Noncanonical sitemap host'
    for url in sitemap_urls:
        rel = urlparse(url).path.strip('/')
        path = ROOT / rel / 'index.html' if rel else ROOT / 'index.html'
        assert path.exists(), f'Missing sitemap target: {url}'
        page = parse(path)
        assert 'noindex' not in (page.value('meta', 'name', 'robots', 'content') or '').lower(), f'Noindex in sitemap: {url}'

    scoped = [ROOT/'index.html', ROOT/'koi-coach/index.html', ROOT/'did/index.html', ROOT/'spatial-data-ai/index.html']
    scoped += list((ROOT/'research').rglob('index.html')) + list((ROOT/'strategy').rglob('index.html'))
    titles, descriptions = [], []
    checked = 0
    for path in scoped:
        page = parse(path)
        if 'noindex' in (page.value('meta', 'name', 'robots', 'content') or '').lower():
            continue
        rel = '/' + str(path.parent.relative_to(ROOT)).replace('\\', '/').strip('.')
        rel = rel.rstrip('/') + '/'
        canonical = BASE + rel
        desc = page.value('meta', 'name', 'description', 'content')
        assert page.title and desc, f'Missing title/description: {path}'
        assert page.value('link', 'rel', 'canonical', 'href') == canonical, f'Canonical mismatch: {path}'
        assert page.value('meta', 'property', 'og:url', 'content') == canonical, f'OG URL mismatch: {path}'
        assert page.value('meta', 'property', 'og:title', 'content'), f'Missing OG title: {path}'
        assert page.value('meta', 'property', 'og:description', 'content'), f'Missing OG description: {path}'
        og = page.value('meta', 'property', 'og:image', 'content')
        assert og and og.startswith(BASE+'/'), f'Missing local OG image: {path}'
        img = ROOT / urlparse(og).path.lstrip('/')
        assert img.exists(), f'Missing OG image file: {img}'
        assert image_size(img) == (1200, 630), f'Wrong OG image size: {img}'
        assert canonical in sitemap_urls, f'Public page missing from sitemap: {path}'
        titles.append(page.title.strip())
        descriptions.append(desc.strip())
        checked += 1
    assert not [v for v,n in Counter(titles).items() if n > 1], 'Duplicate title in scoped pages'
    assert not [v for v,n in Counter(descriptions).items() if n > 1], 'Duplicate description in scoped pages'
    print(f'Validated {checked} public scoped pages and {len(sitemap_urls)} sitemap URLs')


if __name__ == '__main__':
    main()
