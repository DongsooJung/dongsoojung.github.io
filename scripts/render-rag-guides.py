#!/usr/bin/env python3
"""Render the versioned RAG guides; original editions remain unchanged.

Requires reportlab. Supply a Korean TrueType font (and optionally a bold font).
Example: python scripts/render-rag-guides.py --revision 20261019 --font <ttf>
"""
import argparse
import re
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph


ROOT = Path(__file__).resolve().parents[1]


def inline(text):
    text = escape(text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    # Full source URLs remain visible and clickable in the exported document.
    return re.sub(r"https://[^\s<>]+", lambda m: '<link href="' + m[0] + '" color="#145ca8">' + m[0] + '</link>', text)


def render(source, regular_font, bold_font):
    pdfmetrics.registerFont(TTFont('GuideKR', regular_font))
    pdfmetrics.registerFont(TTFont('GuideKRBold', bold_font or regular_font))
    pdfmetrics.registerFontFamily('GuideKR', normal='GuideKR', bold='GuideKRBold')
    base = dict(fontName='GuideKR', fontSize=10.3, leading=17, wordWrap='CJK', splitLongWords=True, alignment=TA_LEFT, textColor=colors.HexColor('#233044'))
    styles = {
        'title': ParagraphStyle('title', **{**base, 'fontName': 'GuideKRBold', 'fontSize': 22, 'leading': 31, 'spaceAfter': 18, 'textColor': colors.HexColor('#102c52')}),
        'heading': ParagraphStyle('heading', **{**base, 'fontName': 'GuideKRBold', 'fontSize': 12.5, 'leading': 20, 'spaceBefore': 16, 'spaceAfter': 7, 'keepWithNext': True}),
        'body': ParagraphStyle('body', **{**base, 'spaceAfter': 10}),
        'list': ParagraphStyle('list', **{**base, 'leftIndent': 12, 'firstLineIndent': -10, 'spaceAfter': 6}),
        'source': ParagraphStyle('source', **{**base, 'fontSize': 8.7, 'leading': 14, 'spaceAfter': 7}),
    }
    story = []
    is_sources = False
    for paragraph in re.split(r'\n\s*\n', source.read_text(encoding='utf-8').strip()):
        if paragraph.startswith('# '):
            story.append(Paragraph(inline(paragraph[2:]), styles['title']))
        elif paragraph.startswith('## '):
            is_sources = paragraph[3:] == '출처'
            story.append(Paragraph(inline(paragraph[3:]), styles['heading']))
        elif paragraph.startswith('- '):
            for line in paragraph.splitlines():
                story.append(Paragraph(inline(line), styles['source' if is_sources else 'list']))
        else:
            story.append(Paragraph(inline(' '.join(paragraph.splitlines())), styles['body']))
    target = source.with_suffix('.pdf')
    document = SimpleDocTemplate(str(target), pagesize=A4, rightMargin=46, leftMargin=46, topMargin=51, bottomMargin=47, title=source.stem, author='STARGATE Research')

    def page(canvas, doc):
        canvas.saveState()
        canvas.setFont('GuideKR', 8)
        canvas.setFillColor(colors.HexColor('#52657d'))
        canvas.drawString(46, A4[1]-30, 'STARGATE RESEARCH  /  SOURCE-REVIEWED METHODS GUIDE')
        canvas.setStrokeColor(colors.HexColor('#d4deea'))
        canvas.line(46, 35, A4[0]-46, 35)
        canvas.drawString(46, 22, '문서 개정판 - 월간 통계 기준월 비적용 - 성능·비용 실험 미실행')
        canvas.drawRightString(A4[0]-46, 22, str(doc.page))
        canvas.restoreState()

    document.build(story, onFirstPage=page, onLaterPages=page)
    return target


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--revision', required=True)
    parser.add_argument('--font', required=True)
    parser.add_argument('--bold-font')
    args = parser.parse_args()
    if not re.fullmatch(r'\d{8}', args.revision):
        parser.error('--revision must be YYYYMMDD')
    for stem in ['rag', 'graphrag']:
        source = ROOT / 'rag-graphrag' / f'{stem}-practical-guide-{args.revision}.md'
        print(render(source, args.font, args.bold_font))
