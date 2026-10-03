"""Render crawlable tourism facts and travel language variants from repository data.

No network calls or third-party dependencies. Run after official tourism imports.
"""
import csv
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'https://stargateedu.co.kr'
PERSON = {'@type': 'Person', '@id': ORIGIN + '/#dongsoo', 'name': 'Dongsoo Jung',
          'alternateName': '정동수', 'url': ORIGIN + '/', 'jobTitle': 'Urban engineering researcher'}
STYLE = '''body{margin:0;background:#0a0d14;color:#e6edf3;font:16px/1.7 system-ui,sans-serif}main{max-width:1000px;margin:auto;padding:28px 22px 60px}a{color:#91b5ff}nav{display:flex;flex-wrap:wrap;gap:20px}h1{font-size:clamp(26px,5vw,40px)}h2{font-size:24px}section{margin:30px 0}table{width:100%;border-collapse:collapse}th,td{padding:10px;text-align:left;border-bottom:1px solid #263452}.scroll{overflow-x:auto}img{width:100%;max-height:360px;object-fit:cover;border-radius:12px}small{font-size:14px;color:#b8c4d4}'''
CITY_NAMES = dict(zip(
    '서울 인천 대전 대구 부산 울산 광주 수원 성남 용인 부천 화성 광명 과천 의정부 양주 파주 일산 청주 충주 전주 영광 포항 경산 영천 구미 김천 진주 밀양 진해 강릉 속초 원주 춘천 여주 제주 도쿄 교토 오사카 고베 단둥 장백현 연변 예루살렘 텔아비브 하이파 나사렛 네타냐 베들레헴 여리고 런던 옥스퍼드 파리 암스테르담 베를린 프랑크푸르트 드레스덴 프라하 비엔나 취리히 루체른 베른 로마 밀라노 베니스 포지타노 이스탄불 갑바도기아 파묵칼레 아테네 밧모섬 모스크바 로스토프온돈 하산 뉴욕 보스턴 뉴헤이븐 시애틀 호놀룰루 코나 신의주 강계 무산 회령'.split(),
    'Seoul|Incheon|Daejeon|Daegu|Busan|Ulsan|Gwangju|Suwon|Seongnam|Yongin|Bucheon|Hwaseong|Gwangmyeong|Gwacheon|Uijeongbu|Yangju|Paju|Ilsan|Cheongju|Chungju|Jeonju|Yeonggwang|Pohang|Gyeongsan|Yeongcheon|Gumi|Gimcheon|Jinju|Miryang|Jinhae|Gangneung|Sokcho|Wonju|Chuncheon|Yeoju|Jeju|Tokyo|Kyoto|Osaka|Kobe|Dandong|Changbai County|Yanbian|Jerusalem|Tel Aviv|Haifa|Nazareth|Netanya|Bethlehem|Jericho|London|Oxford|Paris|Amsterdam|Berlin|Frankfurt|Dresden|Prague|Vienna|Zurich|Lucerne|Bern|Rome|Milan|Venice|Positano|Istanbul|Cappadocia|Pamukkale|Athens|Patmos|Moscow|Rostov-on-Don|Khasan|New York|Boston|New Haven|Seattle|Honolulu|Kona|Sinuiju|Kanggye|Musan|Hoeryong'.split('|')))


def encoded(value):
    return json.dumps(value, ensure_ascii=False).replace('<', '\\u003c')


def alternates(ko, en, default=None):
    return '\n'.join(f'<link rel="alternate" hreflang="{lang}" href="{ORIGIN}{path}">' for lang, path in
                     [('ko', ko), ('en', en), ('x-default', default or en)])


def metadata(path, ko, en, schemas):
    return alternates(ko, en) + '\n<script type="application/ld+json">' + encoded({'@context': 'https://schema.org', '@graph': schemas}) + '</script>'


def replace_block(text, name, body, before):
    block = f'<!-- {name}:start -->\n{body}\n<!-- {name}:end -->'
    pattern = rf'<!-- {name}:start -->.*?<!-- {name}:end -->'
    if re.search(pattern, text, re.S):
        return re.sub(pattern, lambda _: block, text, flags=re.S)
    assert before in text, before
    return text.replace(before, block + '\n' + before, 1)


def update(path, ko, en, schemas, body, before):
    target = ROOT / path.lstrip('/') / 'index.html'
    text = target.read_text()
    text = re.sub(r'(<link rel="canonical" href=")[^"]+', lambda m: m[1] + ORIGIN + path, text)
    text = re.sub(r'(<meta property="og:url" content=")[^"]+', lambda m: m[1] + ORIGIN + path, text)
    text = text.replace('https://www.stargateedu.co.kr', ORIGIN)
    text = replace_block(text, 'travel-aeo-head', metadata(path, ko, en, schemas), '</head>')
    text = replace_block(text, 'travel-aeo-body', body, before)
    target.write_text(text)


def page(path, lang, title, description, head, body):
    target = ROOT / path.lstrip('/') / 'index.html'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(f'''<!doctype html>
<html lang="{lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)}</title><meta name="description" content="{html.escape(description, quote=True)}">
<link rel="canonical" href="{ORIGIN}{path}"><meta property="og:url" content="{ORIGIN}{path}">
{head}<style>{STYLE}</style></head><body><main>
<nav><a href="/en/">STARGATE</a><a href="/stay/">Daechi Stay</a><a href="/en/korea-tourism/">Tourism data</a><a href="/en/cities/">City archive</a><a href="/en/dumulmeori/">Dumulmeori</a></nav>
<h1>{html.escape(title)}</h1>{body}<footer><small>© 2026 Dongsoo Jung · Stargate Corporation · Urban engineering researcher</small></footer>
</main></body></html>''')


def main():
    data = json.loads((ROOT / 'korea-tourism/data.json').read_text())
    rows = data['series']
    latest = rows[-1]
    countries = [('china', 'China', '중국'), ('taiwan', 'Taiwan', '대만'), ('vietnam', 'Vietnam', '베트남')]
    value = lambda r, k: '—' if r[k] is None else f'{r[k]:,}'
    with (ROOT / 'korea-tourism/data.csv').open('w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['month', 'china', 'taiwan', 'vietnam'])
        for r in rows:
            writer.writerow([r['ym'], r['china'], r['taiwan'], r['vietnam']])
    dataset = {'@type': 'Dataset', '@id': ORIGIN + '/korea-tourism/#dataset',
               'name': 'Monthly inbound visitors to Korea: China, Taiwan and Vietnam',
               'description': 'Monthly nationality-based entry counts converted from Korea Tourism Organization official XLSX statistics. Counts are arrivals, not unique travelers.',
               'url': ORIGIN + '/korea-tourism/', 'dateModified': data['updatedAt'],
               'temporalCoverage': rows[0]['ym'] + '/' + latest['ym'], 'spatialCoverage': 'South Korea',
               'variableMeasured': ['China arrivals', 'Taiwan arrivals', 'Vietnam arrivals'],
               'creator': {'@type': 'Organization', 'name': 'Korea Tourism Organization', 'url': 'https://datalab.visitkorea.or.kr/'},
               'publisher': {'@type': 'Organization', 'name': 'Stargate Corporation', 'url': ORIGIN},
               'isBasedOn': data['sourceUrl'], 'inLanguage': ['ko', 'en'],
               'distribution': [{'@type': 'DataDownload', 'encodingFormat': 'text/csv', 'contentUrl': ORIGIN + '/korea-tourism/data.csv'},
                                {'@type': 'DataDownload', 'encodingFormat': 'application/json', 'contentUrl': ORIGIN + '/korea-tourism/data.json'}]}
    facts = ' · '.join(f'{ko} {value(latest, key)}명' for key, en, ko in countries)
    korean = f'''<section class="note" aria-labelledby="tourism-summary"><h2 id="tourism-summary">최신 공표월 핵심 수치: {latest['ym']}</h2>
<p>{facts}</p><p>데이터 갱신일: <time datetime="{data['updatedAt']}">{data['updatedAt']}</time> · 수록 기간: {rows[0]['ym']}–{latest['ym']}. 입국 건수 기준이며 고유 여행자 수가 아닙니다. 최신 공표월은 현재 월과 다를 수 있습니다.</p>
<p><a href="/en/korea-tourism/">English summary &amp; monthly table</a> · <a href="/korea-tourism/data.csv">원자료 CSV</a> · <a href="{html.escape(data['sourceUrl'], quote=True)}">한국관광공사 공식 XLSX</a></p></section>'''
    update('/korea-tourism/', '/korea-tourism/', '/en/korea-tourism/', [dataset, PERSON], korean, '  <div class="filters"')
    english = f'''<p><a href="/korea-tourism/" lang="ko">한국어 대시보드</a></p>
<section><h2>How many visitors from China, Taiwan and Vietnam entered Korea in {latest['ym']}?</h2>
<p>In {latest['ym']}, Korea recorded {value(latest, 'china')} arrivals from China, {value(latest, 'taiwan')} from Taiwan and {value(latest, 'vietnam')} from Vietnam. These are nationality-based entry counts from Korea Tourism Organization's official monthly statistics, converted without rounding. They measure arrivals rather than unique travelers. The latest available month may lag the current calendar month.</p>
<p>Last data update: <time datetime="{data['updatedAt']}">{data['updatedAt']}</time>. Coverage: {rows[0]['ym']}–{latest['ym']}.</p></section>
<section><h2>Where do these figures come from?</h2><p>The source is the Korea Tourism Organization's Korea Tourism Data Lab monthly XLSX, using the inbound arrivals sheet. Missing observations stay blank in CSV and appear as a dash below. Provisional figures can be revised. Annual totals for incomplete years should be described as year-to-date, not full-year totals.</p>
<p><a href="{html.escape(data['sourceUrl'], quote=True)}">Official source workbook</a> · <a href="https://datalab.visitkorea.or.kr/">Korea Tourism Data Lab</a> · <a href="/korea-tourism/data.csv">Download CSV</a> · <a href="/korea-tourism/data.json">Download JSON</a></p></section>
<section><h2>Monthly arrivals by nationality</h2><div class="scroll"><table><thead><tr><th scope="col">Month</th><th scope="col">China</th><th scope="col">Taiwan</th><th scope="col">Vietnam</th></tr></thead><tbody>'''
    english += ''.join('<tr><th scope="row">' + r['ym'] + '</th>' + ''.join('<td>' + value(r, k) + '</td>' for k, _, _ in countries) + '</tr>' for r in reversed(rows))
    english += '</tbody></table></div></section>'
    page('/en/korea-tourism/', 'en', 'Korea inbound tourism statistics | China, Taiwan & Vietnam', dataset['description'], metadata('/en/korea-tourism/', '/korea-tourism/', '/en/korea-tourism/', [dataset, PERSON]), english)

    citytext = (ROOT / 'cities/index.html').read_text()
    cities = json.loads(re.search(r'const CITIES = (\[.*?\]);', citytext, re.S)[1])
    labels = {'kr': ('대한민국', 'South Korea'), 'jpcn': ('일본·중국', 'Japan and China'), 'mideast': ('이스라엘·팔레스타인', 'Israel and Palestine'), 'eu': ('유럽·터키·그리스', 'Europe, Turkey and Greece'), 'ru': ('러시아', 'Russia'), 'us': ('미국', 'United States'), 'nk': ('강 건너 관찰', 'Observed across the border; not visited')}
    archive = {'@type': 'CollectionPage', 'name': 'Dongsoo Jung city travel and observation archive', 'url': ORIGIN + '/cities/', 'author': PERSON, 'inLanguage': ['ko', 'en'],
               'mainEntity': {'@type': 'ItemList', 'numberOfItems': len(cities), 'itemListElement': [{'@type': 'ListItem', 'position': i + 1, 'item': {'@type': 'Place', 'name': c[0], 'description': labels[c[3]][1], 'geo': {'@type': 'GeoCoordinates', 'latitude': c[1], 'longitude': c[2]}}} for i, c in enumerate(cities)]}}
    koreanlist = '<section class="region"><h2>도시 기록 전체 목록</h2><p><a href="/en/cities/">English archive</a> · 지도 없이도 읽을 수 있는 원문 목록입니다. 북녘 4곳은 방문이 아닌 관찰 기록입니다.</p>'
    englishlist = f'<p><a href="/cities/" lang="ko">한국어 지도</a></p><section><h2>What does this city archive record?</h2><p>This personal archive contains {len(cities)} places recorded by Dongsoo Jung, including 36 in South Korea. Four North Korean places were viewed from across a river and were not visited. English place names are paired with the original Korean labels. The list records travel and observation, rather than providing current destination access or transport advice.</p></section>'
    for key, (ko, en) in labels.items():
        group = [c for c in cities if c[3] == key]
        koreanlist += f'<h3>{ko} ({len(group)})</h3><p>' + ' · '.join(html.escape(c[0]) for c in group) + '</p>'
        englishlist += f'<section><h2>{en} ({len(group)})</h2><ul>' + ''.join(f'<li>{html.escape(CITY_NAMES.get(c[0], c[0]))} · <span lang="ko">{html.escape(c[0])}</span> — {c[1]}, {c[2]}</li>' for c in group) + '</ul></section>'
    koreanlist += '</section>'
    update('/cities/', '/cities/', '/en/cities/', [archive, PERSON], koreanlist, '<footer>')
    page('/en/cities/', 'en', 'City travel & observation archive | Dongsoo Jung', 'A readable archive of Korean and international places with coordinates and clearly distinguished border observations.', metadata('/en/cities/', '/cities/', '/en/cities/', [archive, PERSON]), englishlist)

    questions = [
        ('Where is Daechi Stay?', 'Daechi Stay is in Daechi-dong, Gangnam, Seoul. The neighborhood guide covers Hanti, Daechi and Samseong stations and the COEX area. Ask the host for the exact address and the best station for your reservation before planning your final transfer.', '대치 스테이는 어디에 있나요?', '서울 강남구 대치동에 있습니다. 한티·대치·삼성역과 코엑스 생활권을 안내합니다. 예약에 해당하는 정확한 주소와 추천 역은 호스트에게 확인해 주세요.'),
        ('How do I get there from Incheon Airport?', 'Ask the host for the exact address before choosing an airport rail, subway, bus or taxi route. Transfer choices depend on your arrival terminal, time and luggage. Check current timetables and fares with the airport and transport operator before departure.', '인천공항에서 어떻게 이동하나요?', '정확한 숙소 주소를 받은 뒤 공항철도·지하철·버스·택시를 선택해 주세요. 도착 터미널·시간·짐에 따라 경로가 달라집니다. 운행시간과 요금은 공항과 운송기관의 최신 안내를 확인해 주세요.'),
        ('Does this page take accommodation payments?', 'No accommodation payment is taken on this page. The availability form opens your email app with a request to the host. Confirm availability, total price, cancellation terms and the booking channel with the host before paying.', '이 페이지에서 숙박 결제를 하나요?', '이 페이지는 숙박 결제를 받지 않습니다. 예약 가능일 문의는 이메일 앱을 엽니다. 결제 전 호스트에게 예약 가능 여부·총액·취소 조건·예약 채널을 확인해 주세요.'),
        ('Which languages are available?', 'The stay page is available in English and Korean. Contact the host through the availability inquiry for arrival and check-in details.', '어떤 언어로 안내받을 수 있나요?', '영어와 한국어 안내를 제공합니다. 예약 가능일 문의를 통해 도착·체크인 안내를 요청할 수 있습니다.')]
    lodging = {'@type': 'LodgingBusiness', '@id': ORIGIN + '/stay/#lodging', 'name': 'Daechi Stay', 'url': ORIGIN + '/stay/',
               'description': 'A Daechi-dong stay in Gangnam, Seoul, with English and Korean host support.',
               'address': {'@type': 'PostalAddress', 'addressLocality': 'Gangnam-gu', 'addressRegion': 'Seoul', 'addressCountry': 'KR'},
               'image': ORIGIN + '/stay/assets/hero-interior.png'}
    faq = lambda ko: {'@type': 'FAQPage', 'inLanguage': 'ko' if ko else 'en', 'mainEntity': [{'@type': 'Question', 'name': q[2 if ko else 0], 'acceptedAnswer': {'@type': 'Answer', 'text': q[3 if ko else 1]}} for q in questions]}
    englishfaq = '<section class="section"><div class="shell"><h2>Planning your Daechi stay</h2><p><a href="/ko/stay/" lang="ko">한국어 이용 안내</a> · <a href="/en/korea-tourism/">Korea tourism statistics</a> · <a href="/en/dumulmeori/">Dumulmeori day trip</a></p>'
    englishfaq += ''.join(f'<h3>{q[0]}</h3><p>{q[1]}</p>' for q in questions) + '</div></section>'
    update('/stay/', '/ko/stay/', '/stay/', [lodging, faq(False), PERSON], englishfaq, '    <section class="inquiry"')
    koreanfaq = '<p><a href="/stay/" lang="en">English stay page</a></p><img src="/stay/assets/hero-interior.png" alt="대치 스테이 소개 이미지"><p>서울 강남구 대치동 체류 안내. 호스트: 정동수, 도시공학 연구자.</p>'
    koreanfaq += ''.join(f'<section><h2>{q[2]}</h2><p>{q[3]}</p></section>' for q in questions)
    koreanfaq += '<p><a href="mailto:stay@stargateedu.co.kr?subject=Daechi%20Stay%20availability">예약 가능일 이메일 문의</a> · <a href="/stay/#inquiry">일정 입력 문의</a></p>'
    page('/ko/stay/', 'ko', '대치 스테이 | 강남 체류·예약 안내', '대치동 숙소 위치, 공항 이동, 예약 문의와 결제 안내. 영어·한국어 호스트 지원.', metadata('/ko/stay/', '/ko/stay/', '/stay/', [lodging, faq(True), PERSON]), koreanfaq)
    dumulmeori()


# Facts below were checked against the cited pages on CHECKED. Re-verify before changing them.
CHECKED = '2026-10-03'
KTO_KO = 'https://korean.visitkorea.or.kr/detail/rem_detail.do?cotid=a76ac3e1-a323-437d-919d-6ad577934f6d'
KTO_EN = 'https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=136607'


def dumulmeori():
    path = '/en/dumulmeori/'
    questions = [
        ('What is Dumulmeori?', 'Dumulmeori is a riverside park in Yangsu-ri, Yangseo-myeon, Yangpyeong-gun, Gyeonggi-do, where the Bukhangang (North Han) and Namhangang (South Han) rivers meet. VisitKorea describes roughly 400-year-old zelkova trees, a docked traditional sailboat, and a pontoon bridge of about 250 meters linking the area to Semiwon garden.'),
        ('Is there an entrance fee, and when is it open?', 'VisitKorea lists Dumulmeori as free and open all year with no closing day. That listing was last revised in March 2022, so confirm with the Yangpyeong tourist information line (+82-31-770-1001) before a special trip. Semiwon garden next door is a separate attraction with its own paid admission and hours.'),
        ('How do I get there from Seoul by public transport?', 'Take the Gyeongui–Jungang Line to Yangsu Station, the nearest rail station. From there, travelers usually walk, cycle or take a short taxi ride; one travel guide estimates about 30 minutes on foot. Check the current route and timetable in Naver Map or Kakao Map, which give more reliable Korean transit directions than many global map apps.'),
        ('When is the best time to visit?', 'Early morning is popular for river mist and calm water, and VisitKorea notes lotus and lily blooms in summer. Weekends and holidays are busier, and parking near the riverside fills up, so public transport is the simpler choice on those days.'),
        ('Can I combine it with a stay in Gangnam?', 'Yes. Dumulmeori works as a half-day or day trip from a Seoul base. From Daechi-dong, plan a transfer to the Gyeongui–Jungang Line and allow extra time for the return trip in the evening.'),
    ]
    attraction = {'@type': 'TouristAttraction', '@id': ORIGIN + path + '#place', 'name': 'Dumulmeori',
                  'alternateName': '두물머리', 'url': ORIGIN + path,
                  'description': 'Riverside park at the confluence of the Bukhangang and Namhangang rivers in Yangpyeong, Gyeonggi-do.',
                  'address': {'@type': 'PostalAddress', 'streetAddress': 'Yangsu-ri, Yangseo-myeon', 'addressLocality': 'Yangpyeong-gun',
                              'addressRegion': 'Gyeonggi-do', 'addressCountry': 'KR'},
                  'isAccessibleForFree': True, 'publicAccess': True, 'touristType': ['Day trip from Seoul', 'Nature', 'Photography'],
                  'sameAs': [KTO_KO]}
    faq = {'@type': 'FAQPage', 'inLanguage': 'en', 'dateModified': CHECKED,
           'mainEntity': [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in questions]}
    head = (f'<link rel="alternate" hreflang="en" href="{ORIGIN}{path}">\n<link rel="alternate" hreflang="x-default" href="{ORIGIN}{path}">\n'
            '<script type="application/ld+json">' + encoded({'@context': 'https://schema.org', '@graph': [attraction, faq, PERSON]}) + '</script>')
    body = ('<p>A practical day-trip guide from Seoul to the meeting point of the North and South Han rivers. '
            f'Facts checked on <time datetime="{CHECKED}">{CHECKED}</time>; hours, fees and transit can change.</p>')
    body += ''.join(f'<section><h2>{html.escape(q)}</h2><p>{html.escape(a)}</p></section>' for q, a in questions)
    body += ('<section><h2>Sources</h2><ul>'
             f'<li><a href="{KTO_KO}">VisitKorea (Korea Tourism Organization), Dumulmeori listing, Korean</a> — address, free entry, year-round access, revised March 2022</li>'
             f'<li><a href="{KTO_EN}">VisitKorea, day trip to Yangpyeong &amp; Namyangju on the Gyeongui–Jungang Line</a> — zelkova trees, pontoon bridge, summer blooms, updated July 2021</li>'
             '<li><a href="https://www.koreatodo.com/dumulmeori-semiwon-strawberry-farms">KoreaToDo, Dumulmeori &amp; Semiwon guide</a> — walking-time estimate from Yangsu Station</li>'
             '</ul><p><a href="/stay/">Stay in Daechi-dong, Gangnam</a> · <a href="/en/korea-tourism/">Korea inbound tourism statistics</a></p></section>')
    page(path, 'en', 'Dumulmeori day trip from Seoul | Yangpyeong river confluence guide',
         'How to visit Dumulmeori from Seoul: Yangsu Station access, free entry, best times and Semiwon, with sources and check date.', head, body)


if __name__ == '__main__':
    main()
