"""Build bilingual, source-linked neighborhood and day-trip articles. No network calls."""
from pathlib import Path
import html
import json

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'https://stargateedu.co.kr'
DATE = '2026-10-03'
SOURCES = {
    'coex': ('COEX subway directions', 'https://www.coexcenter.com/directions-map-subway/'),
    'airport': ('COEX airport rail directions', 'https://www.coexcenter.com/directions-map-airport-2/'),
    'arex': ('Incheon Airport railroad guide', 'https://airinfo.airport.kr/ap_en/1512/subview.do'),
    'tombs': ('Visit Seoul: Seonjeongneung', 'https://english.visitseoul.net/attractions/Seonjeongneung-Tomb_/1418'),
    'temple': ('Visit Seoul: Bongeunsa and COEX', 'https://english.visitseoul.net/mvp/Ifyouareaculturaltraveler_/43818'),
    'metro': ('Visit Seoul: subway guide', 'https://english.visitseoul.net/subway'),
    'dumul': ('VISITKOREA: Yangpyeong Dumulmeori', 'https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=87086'),
    'yangsu': ('VISITKOREA: Gyeongui-Jungang Line day trip', 'https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=225394'),
}
GUIDES = {
 'gangnam-guide': {
  'en': {
   'title': 'Gangnam neighborhood guide: Daechi, royal tombs & COEX',
   'intro': 'Plan a local day around Daechi, Seonjeongneung, Bongeunsa and COEX, with a rail-first airport arrival and room to slow down.',
   'questions': [
    ('Where should I stay in Gangnam for a longer visit?',
     'Use your daily destination to choose a Gangnam base. For a COEX-led visit, compare accommodation near Samseong or Bongeunsa; for a Daechi-led stay, check the exact address and final walk before booking. Daechi Stay offers an English inquiry page, but availability, minimum stay, total price and cancellation terms require host confirmation.', []),
    ('How can I get from Incheon Airport to the COEX area?',
     'One rail option is the AREX all-stop train to Gimpo Airport, followed by Seoul Subway Line 9 to Bongeunsa. COEX also lists an alternative via Hongik University and Line 2 to Samseong. Choose the route for your actual lodging address, and check current departures before travelling with luggage.', ['airport', 'arex']),
    ('Which subway entrance should I use for COEX?',
     'For COEX, Samseong Station on Line 2 has connected passages from exits 5 and 6. Bongeunsa Station on Line 9 has a connected passage from exit 7. Choose the side that matches your exhibition hall or meeting location rather than assuming every COEX entrance is equally close.', ['coex']),
    ('How should I combine Seonjeongneung, Bongeunsa and COEX?',
     'Treat the royal tombs as a separate outdoor stop, then group Bongeunsa with COEX. A practical editorial plan is Daechi in the morning, Seonjeongneung for a heritage walk, and Bongeunsa plus COEX afterwards. Use a map for the links between stops, and shorten the route when the weather or your energy changes.', ['tombs', 'temple']),
    ('Can I visit Seonjeongneung on a Monday?',
     'Visit Seoul lists Seonjeongneung as closed on Mondays, with seasonal visiting hours. Check the official notice for your travel date before going, particularly around public holidays. If the tombs are unavailable, keep the Bongeunsa and COEX pairing and leave the heritage walk for another day rather than rushing to a substitute.', ['tombs']),
    ('What is a simple rainy-day plan in Gangnam?',
     'Make COEX the main indoor stop and keep the outdoor heritage walk optional. Its station-connected mall passages reduce exposed walking, but the transfer from your accommodation may still be outdoors. Check the venue schedule for a specific exhibition, and do not assume every event or attraction inside the complex is free.', ['coex']),
   ],
   'route_title': 'A flexible day, with travel time left open',
   'route_headers': ['Stop', 'Purpose', 'How to approach it'],
   'route_rows': [
    ['Daechi / your lodging', 'Start close to home; breakfast and essentials', 'Confirm your exact address and nearest station with the host.'],
    ['Seonjeongneung', 'A heritage walk among the royal tombs', 'Use Seolleung as a station reference; check the visitor gate and seasonal hours.'],
    ['Bongeunsa', 'A temple stop next to the COEX area', 'Check the pedestrian route; respect worship and any access restrictions.'],
    ['COEX', 'Indoor break, exhibition or shopping', 'Samseong exits 5/6 or Bongeunsa exit 7; choose the entrance for your venue.'],
   ],
   'notes_title': 'Plan for the neighborhood, not just the landmark',
   'notes': [
    'The order above is an editorial suggestion, not a timed tour or a guarantee of the fastest route. Walk the links that suit your pace; use public transport or a taxi for the rest.',
    'Save both the Korean and English address. Daechi-dong is an area, not one station exit, and a COEX station is not automatically the nearest stop to your room.',
    'For a long stay, ask about laundry, kitchen access, work space, stairs or lifts, and the full cost. This guide does not verify facilities or prices for an individual reservation.',
    'Allow an unplanned meal break. For restaurant menus, dietary needs or late check-in, contact the venue or host directly.',
   ],
  },
  'ko': {
   'title': '강남 생활권 가이드: 대치·선정릉·봉은사·코엑스',
   'intro': '대치동을 거점으로 왕릉 산책과 사찰, 코엑스를 연결하는 하루. 공항 이동은 철도 경로부터 확인하고, 동선 사이에는 여유를 둡니다.',
   'questions': [
    ('강남에서 장기 체류할 숙소는 어떻게 고르나요?', '매일 방문할 목적지를 먼저 정하세요. 코엑스 일정이 중심이면 삼성역·봉은사역 주변을, 대치동 일정이 중심이면 정확한 숙소 주소와 마지막 도보 구간을 비교하세요. 대치 스테이는 영어 문의 페이지를 제공하며, 예약 가능 여부·최소 숙박일·총액·취소 조건은 호스트 확인이 필요합니다.', []),
    ('인천공항에서 코엑스 생활권으로 어떻게 이동하나요?', '공항철도 일반열차로 김포공항역에 도착한 뒤 9호선으로 환승해 봉은사역에 가는 경로가 있습니다. 코엑스 공식 안내에는 홍대입구역에서 2호선으로 환승해 삼성역으로 가는 대안도 나옵니다. 실제 숙소 주소에 맞춰 선택하고, 짐이 많다면 환승 동선과 당일 운행시간을 함께 확인하세요.', ['airport', 'arex']),
    ('코엑스는 어느 역 출구로 들어가면 되나요?', '2호선 삼성역은 5·6번 출구 방향 연결 통로를, 9호선 봉은사역은 7번 출구 방향 연결 통로를 이용할 수 있습니다. 코엑스는 넓은 복합시설이므로 전시장이나 미팅 장소에 가까운 쪽을 선택하세요.', ['coex']),
    ('선정릉·봉은사·코엑스는 어떻게 묶어 방문하나요?', '선정릉은 별도의 야외 관람 구간으로 두고, 봉은사와 코엑스를 한 묶음으로 연결하는 편집 추천 코스입니다. 대치동에서 아침을 시작한 뒤 선정릉 산책, 봉은사, 코엑스 순서로 이동하되, 각 구간은 지도에서 확인하고 날씨·체력에 따라 줄이세요.', ['tombs', 'temple']),
    ('월요일에도 선정릉을 관람할 수 있나요?', '서울 공식 관광 안내는 선정릉의 월요일 휴관과 계절별 관람시간을 명시합니다. 공휴일 전후에는 방문일의 공식 공지를 확인하세요. 관람이 어려운 날은 봉은사·코엑스 중심으로 일정을 구성하고 왕릉 산책을 다른 날로 옮길 수 있습니다.', ['tombs']),
    ('비 오는 날 강남에서 간단한 일정은 무엇인가요?', '코엑스를 실내 일정의 중심에 두고 왕릉 산책은 선택으로 남겨두세요. 역에서 연결된 몰 통로는 야외 이동을 줄여주지만 숙소에서 역까지는 외부 구간이 있을 수 있습니다. 전시 일정과 입장료는 행사별로 확인해야 합니다.', ['coex']),
   ],
   'route_title': '시간을 고정하지 않는 하루 동선',
   'route_headers': ['구간', '방문 목적', '이동·확인 사항'],
   'route_rows': [
    ['대치동 / 숙소', '아침 식사·생활 준비', '숙소의 정확한 주소와 가까운 역을 먼저 확인합니다.'],
    ['선정릉', '왕릉과 녹지 산책', '선릉역을 기준으로 관람 입구와 계절별 시간을 확인합니다.'],
    ['봉은사', '코엑스 인근 사찰 방문', '보행 경로를 확인하고 예불·출입 제한을 존중합니다.'],
    ['코엑스', '실내 휴식·전시·쇼핑', '삼성역 5·6번 또는 봉은사역 7번 출구 방향 연결 통로를 선택합니다.'],
   ],
   'notes_title': '명소뿐 아니라 생활 동선을 확인하세요',
   'notes': ['위 순서는 편집 추천이며 최단 경로나 시간표를 보장하는 코스가 아닙니다. 걸을 구간과 대중교통·택시를 이용할 구간을 직접 조정하세요.', '주소는 한국어와 영어로 저장하세요. 대치동은 한 역 출구가 아닌 생활권이며, 코엑스 접근역이 숙소와 가장 가까운 역은 아닐 수 있습니다.', '장기 체류라면 세탁·주방·작업 공간·계단이나 엘리베이터·총비용을 물어보세요. 개별 예약의 시설·가격은 이 가이드가 확인하지 않습니다.', '식사 시간에는 여유를 두세요. 메뉴·식이 요구·늦은 체크인은 해당 업장이나 호스트에게 직접 확인할 수 있습니다.'],
  },
 },
 'dumulmeori': {
  'en': {
   'title': 'Dumulmeori day trip from Seoul via Yangsu Station',
   'intro': 'A rail-and-walk day trip to the meeting point of two rivers in Yangpyeong. Keep the return train in your plan, especially for a sunrise visit.',
   'questions': [
    ('What is Dumulmeori, and where is it?',
     'Dumulmeori is a riverside destination in Yangpyeong, Gyeonggi-do, where the Bukhangang and Namhangang rivers meet. VISITKOREA lists its address as 145 Dumulmeori-gil, Yangseo-myeon. It is suited to a landscape walk and river views rather than a dense city itinerary. Save the Korean name, 양평 두물머리, for your map search.', ['dumul']),
    ('How do I get to Dumulmeori from Seoul by subway?',
     'Use a Gyeongui-Jungang Line service that stops at Yangsu Station, then continue to Dumulmeori on foot or by a locally confirmed transfer. Your Seoul starting station determines the interchange. Check the train destination, departures and return options in a current route planner; the journey is not one fixed travel time from every Seoul neighborhood.', ['yangsu']),
    ('How much walking should I allow from Yangsu Station?',
     'Keep a generous walking allowance after arriving at Yangsu. For this itinerary, budget roughly 30–45 minutes each way as an editorial planning estimate, then replace it with the live walking route for your exit and destination. Heat, stops, luggage and mobility needs can change that allowance; a local bus or taxi may suit you better.', []),
    ('Can I visit Dumulmeori for sunrise?',
     'VISITKOREA lists the riverside attraction as open 24 hours, but that does not mean trains, buses, parking facilities or nearby businesses run all night. A sunrise trip by public transport depends on the first train and the season. Confirm the arrival time before choosing sunrise; a daytime visit is easier to plan around rail service.', ['dumul']),
    ('Can I combine Dumulmeori with another stop?',
     'Keep the river walk as the main activity and add a meal or a nearby attraction only if your return plan allows it. The tourism guide also covers the broader Yangsu area. Check separate admission, opening hours and access for any extra stop; do not assume a nearby garden is included in the riverside visit.', ['yangsu']),
    ('How much time should I set aside for the day trip?',
     'Reserve a half day or more as an editorial planning allowance, then calculate the actual trip from your starting address. Include outward rail travel, the last-mile walk, time by the river and the return journey. A relaxed meal or another attraction can turn it into a full day; neither duration is a published operator timetable.', []),
   ],
   'route_title': 'The rail-and-walk plan',
   'route_headers': ['Stage', 'Action', 'Check before leaving'],
   'route_rows': [
    ['Seoul → Yangsu', 'Travel on a Gyeongui-Jungang Line train stopping at Yangsu', 'Interchange, train destination and current departures.'],
    ['Yangsu → Dumulmeori', 'Use a live walking route or a confirmed local transfer', 'Station exit, walking distance and your mobility needs.'],
    ['Riverside visit', 'Walk, look at the confluence and take a break', 'Weather and any local path restrictions.'],
    ['Return to Seoul', 'Leave enough time to reach Yangsu before your chosen train', 'Return service first; do not rely on a remembered last-train time.'],
   ],
   'notes_title': 'What to confirm for your date',
   'notes': [
    'The published attraction address is 145 Dumulmeori-gil, Yangseo-myeon, Yangpyeong-gun, Gyeonggi-do. VISITKOREA lists nearby paid parking; check the car park rate locally.',
    'For local buses, confirm the active route and stop on the day. Older tourism articles include bus numbers that should not be treated as a live schedule.',
    'Bring suitable walking shoes, water and weather protection. River fog, sunset colors and quiet paths are conditions, not guaranteed experiences.',
    'Avoid treating the 24-hour attraction listing as a promise that every path or facility is accessible. Check local notices and actual conditions.',
   ],
  },
  'ko': {
   'title': '서울에서 양수역으로 가는 두물머리 당일 여행',
   'intro': '양평에서 북한강과 남한강이 만나는 풍경을 보는 철도·도보 나들이. 일출을 목표로 한다면 첫차와 귀가 열차부터 확인하세요.',
   'questions': [
    ('두물머리는 어디이며 어떤 장소인가요?', '두물머리는 경기도 양평군에서 북한강과 남한강이 만나는 강변 명소입니다. 한국관광공사는 주소를 양서면 두물머리길 145로 안내합니다. 여러 도시 명소를 빠르게 도는 일정보다 강변 풍경과 산책을 중심으로 계획하기 좋습니다.', ['dumul']),
    ('서울에서 지하철로 두물머리에 어떻게 가나요?', '경의중앙선에서 양수역에 정차하는 열차를 이용한 뒤 도보나 현장에서 확인한 교통수단으로 이동합니다. 출발하는 서울 지역에 따라 환승이 달라집니다. 당일 경로 검색에서 열차 행선지·출발시간·귀가편을 확인하세요. 서울 어디서 출발해도 같은 시간이 걸리는 여행은 아닙니다.', ['yangsu']),
    ('양수역에서 도보 시간을 얼마나 잡아야 하나요?', '이 코스는 편집상 여유 시간으로 편도 약 30~45분을 잡고, 실제로는 출구와 목적지를 지정한 당일 도보 경로로 대체하도록 권합니다. 공식 확정 소요시간이 아닙니다. 더위·휴식·짐·보행 여건에 따라 달라지므로 필요하면 현지 버스나 택시를 확인하세요.', []),
    ('두물머리에 일출을 보러 갈 수 있나요?', '한국관광공사는 명소를 24시간 개방으로 안내합니다. 다만 열차·버스·주차장·인근 업장이 밤새 운영한다는 뜻은 아닙니다. 대중교통 일출 방문은 계절과 첫차에 따라 성립 여부가 달라집니다. 도착 시각을 먼저 확인하고, 맞지 않으면 낮 시간 방문으로 조정하세요.', ['dumul']),
    ('두물머리와 다른 장소를 함께 방문해도 되나요?', '강변 산책을 중심에 놓고 귀가 시간에 여유가 있을 때 식사나 인근 장소를 추가하세요. 관광공사 여행 안내는 양수 지역의 다른 방문지도 소개합니다. 추가 장소의 입장료·운영시간·출입 조건은 별도이며 강변 방문에 자동 포함되지 않습니다.', ['yangsu']),
    ('당일 여행에 얼마의 시간을 배정하면 되나요?', '편집상 계획 여유로 반나절 이상을 생각하되, 실제 출발 주소에서 계산하세요. 왕복 철도 이동·역에서 강변까지의 이동·현장 산책을 모두 포함해야 합니다. 식사나 추가 방문지를 넣으면 하루 일정이 될 수 있으며, 이는 운영기관이 공표한 소요시간이 아닙니다.', []),
   ],
   'route_title': '철도와 도보를 연결하는 일정',
   'route_headers': ['단계', '이동·활동', '출발 전 확인'],
   'route_rows': [
    ['서울 → 양수', '양수역에 정차하는 경의중앙선 이용', '환승역·열차 행선지·당일 출발시간'],
    ['양수 → 두물머리', '당일 도보 경로 또는 현지 교통 이용', '역 출구·도보 거리·보행 여건'],
    ['강변 방문', '합류 지점 풍경·산책·휴식', '날씨·현지 출입 제한'],
    ['서울 귀가', '선택한 열차 전에 양수역에 도착', '귀가편을 먼저 검색하고 기억 속 막차시간에 의존하지 않기'],
   ],
   'notes_title': '방문일에 확인할 사항',
   'notes': ['공식 주소는 경기도 양평군 양서면 두물머리길 145입니다. 한국관광공사는 인근 유료 주차장을 안내하며, 실제 요금은 현장에서 확인하세요.', '현지 버스를 이용한다면 해당 날짜의 노선·정류장을 확인하세요. 오래된 관광 글의 버스 번호를 실시간 시간표로 받아들이지 마세요.', '걷기 편한 신발·물·날씨에 맞는 준비물을 챙기세요. 물안개·노을·한적함은 기상과 방문 상황에 따라 달라집니다.', '24시간 명소 안내가 모든 길과 시설의 상시 이용을 보장하지는 않습니다. 현장 공지와 실제 상황을 확인하세요.'],
  },
 },
}


busan = json.loads((ROOT / 'scripts/travel-busan.json').read_text(encoding='utf-8'))
SOURCES.update(busan['sources'])
GUIDES['busan-guide'] = busan['guide']


def escape(s):
    return html.escape(s, quote=True)


def render(slug, lang):
    g = GUIDES[slug][lang]
    ko = lang == 'ko'
    path = f'/{"" if ko else "en/"}{slug}/'
    pair = f'/{"en/" if ko else ""}{slug}/'
    nav_path = ('/#travel-spots' if ko else '/stay/blog/') if slug == 'busan-guide' else ('/ko/stay/' if ko else '/stay/')
    nav_label = ('여행 가이드' if ko else 'Travel journal') if slug == 'busan-guide' else ('대치 스테이' if ko else 'Daechi Stay')
    jump_highlights = ('<a href="#highlights">' + ('추천 6곳' if ko else 'Six picks') + '</a>') if g.get('highlights') else ''
    source_ids = list(dict.fromkeys(source for _, _, ids in g['questions'] for source in ids))
    source_ids += [s for item in g.get('highlights', []) for s in item[4] if s not in source_ids]
    source_ids = list(dict.fromkeys(source_ids))
    person = {'@type': 'Person', '@id': ORIGIN + '/#dongsoo', 'name': 'Dongsoo Jung', 'alternateName': '정동수', 'url': ORIGIN + '/', 'jobTitle': 'Urban engineering researcher'}
    article = {'@type': 'Article', '@id': ORIGIN + path + '#article', 'headline': g['title'], 'description': g['intro'], 'inLanguage': lang, 'datePublished': DATE, 'dateModified': DATE, 'author': person, 'publisher': {'@type': 'Organization', 'name': 'Stargate Corporation', 'url': ORIGIN}, 'mainEntityOfPage': ORIGIN + path, 'citation': [SOURCES[s][1] for s in source_ids]}
    faq = {'@type': 'FAQPage', '@id': ORIGIN + path + '#faq', 'inLanguage': lang, 'mainEntity': [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a, _ in g['questions']]}
    graph = [article, faq, person]
    photo = ''
    if slug == 'dumulmeori':
        article['image'] = ORIGIN + '/assets/travel/dumulmeori-2019.jpg'
        graph.append({'@type': 'TouristAttraction', '@id': ORIGIN + '/dumulmeori/#place', 'name': 'Yangpyeong Dumulmeori', 'alternateName': '양평 두물머리', 'url': ORIGIN + path, 'description': 'Riverside attraction where the Bukhangang and Namhangang rivers meet.', 'address': {'@type': 'PostalAddress', 'streetAddress': '145 Dumulmeori-gil, Yangseo-myeon', 'addressLocality': 'Yangpyeong-gun', 'addressRegion': 'Gyeonggi-do', 'addressCountry': 'KR'}, 'sameAs': SOURCES['dumul'][1]})
        photo = '<figure><img src="/assets/travel/dumulmeori-2019.jpg" alt="' + ('2019년 두물머리 강변과 느티나무 풍경' if ko else 'A riverside landscape at Dumulmeori photographed in 2019') + '" width="1280" height="960" fetchpriority="high"><figcaption>2019 · Foxy1219 · <a href="https://commons.wikimedia.org/wiki/File:Yangpyeong_Dumulmeori_2019-11-11.jpg">Wikimedia Commons</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>. ' + ('미리보기 크기 이미지; 현재 현장 사진이 아닙니다.' if ko else 'Resized Commons preview; not a current site photograph.') + '</figcaption></figure>'
    elif slug == 'busan-guide':
        photo = '<aside class="overview"><p class="eyebrow">BUSAN · COAST · COFFEE · CULTURE</p><p>' + escape(g['overview']) + '</p></aside>'
    else:
        photo = '<aside class="overview"><p class="eyebrow">DAECHI · SEONJEONGNEUNG · BONGEUNSA · COEX</p><p>' + ('왕릉 산책과 사찰, 실내 일정을 나누어 연결하세요.' if ko else 'A heritage walk, a temple stop and an indoor afternoon, connected at your own pace.') + '</p></aside>'
    body = ''
    if g.get('highlights'):
        body += '<section id="highlights"><h2>' + escape(g['highlights_title']) + '</h2><div class="spot-grid">'
        for name, area, description, tip, ids in g['highlights']:
            links = ' · '.join(f'<a href="{escape(SOURCES[s][1])}">{escape(SOURCES[s][0])}</a>' for s in ids)
            body += '<article class="spot"><p class="eyebrow">' + escape(area) + '</p><h3>' + escape(name) + '</h3><p>' + escape(description) + '</p><p class="tip">' + escape(tip) + '</p><p class="source">' + links + '</p></article>'
        body += '</div></section>'
    body += '<div class="questions">'
    for i, (q, a, ids) in enumerate(g['questions'], 1):
        links = ' · '.join(f'<a href="{escape(SOURCES[s][1])}">{escape(SOURCES[s][0])}</a>' for s in ids)
        body += f'<section id="question-{i}"><h2>{escape(q)}</h2><p class="answer">{escape(a)}</p>'
        if links:
            body += '<p class="source">' + ('공식 근거: ' if ko else 'Official references: ') + links + '</p>'
        body += '</section>'
    body += '</div><section id="route"><h2>' + escape(g['route_title']) + '</h2><div class="table-wrap"><table><thead><tr>' + ''.join('<th scope="col">' + escape(x) + '</th>' for x in g['route_headers']) + '</tr></thead><tbody>'
    for row in g['route_rows']:
        body += '<tr><th scope="row">' + escape(row[0]) + '</th>' + ''.join('<td>' + escape(x) + '</td>' for x in row[1:]) + '</tr>'
    body += '</tbody></table></div></section><section><h2>' + escape(g['notes_title']) + '</h2><ul>' + ''.join('<li>' + escape(x) + '</li>' for x in g['notes']) + '</ul></section>'
    related = '<section class="related"><h2>' + ('다음 여행 준비' if ko else 'Continue planning') + '</h2><div class="related-links">'
    related += f'<a href="/{"" if ko else "en/"}{"dumulmeori" if slug == "gangnam-guide" else "gangnam-guide"}/">' + ('두물머리 당일 여행' if slug == 'gangnam-guide' and ko else 'Dumulmeori day trip' if slug == 'gangnam-guide' else '강남 생활권 가이드' if ko else 'Gangnam neighborhood guide') + '</a>'
    if slug != 'busan-guide':
        related += '<a href="' + ('/busan-guide/' if ko else '/en/busan-guide/') + '">' + ('부산 핫플 여행 가이드' if ko else 'Busan cafés, coast & nights') + '</a>'
        related += '<a href="' + ('/ko/stay/' if ko else '/stay/') + '">' + ('대치 스테이 문의' if ko else 'Daechi Stay & host inquiry') + '</a>'
    else:
        related += '<a href="' + ('/dumulmeori/' if ko else '/en/dumulmeori/') + '">' + ('두물머리 당일 여행' if ko else 'Dumulmeori day trip') + '</a>'
    related += '<a href="' + ('/korea-tourism/' if ko else '/en/korea-tourism/') + '">' + ('방한 관광 통계' if ko else 'Korea tourism statistics') + '</a></div></section>'
    refs = '<section id="sources"><h2>' + ('출처와 확인 기준' if ko else 'Sources and review date') + '</h2><p>' + ('2026년 10월 3일 공식 안내를 확인했습니다. 추천 순서와 여행 시간 배정은 편집 판단이며, 운행시간·요금·입장 조건은 연결된 운영기관에서 다시 확인하세요.' if ko else 'Official information reviewed on 3 October 2026. Suggested order and planning allowances are editorial judgments. Check the linked operators for current service times, fares and admission conditions.') + '</p><ul>'
    refs += ''.join(f'<li><a href="{escape(SOURCES[s][1])}">{escape(SOURCES[s][0])}</a></li>' for s in source_ids) + '</ul></section>'
    schema = json.dumps({'@context': 'https://schema.org', '@graph': graph}, ensure_ascii=False).replace('<', '\\u003c')
    target = ROOT / path.lstrip('/') / 'index.html'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(f'''<!doctype html>
<html lang="{lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{escape(g['title'])} | STARGATE</title><meta name="description" content="{escape(g['intro'])}">
<link rel="canonical" href="{ORIGIN}{path}"><link rel="alternate" hreflang="ko" href="{ORIGIN}/{slug}/"><link rel="alternate" hreflang="en" href="{ORIGIN}/en/{slug}/"><link rel="alternate" hreflang="x-default" href="{ORIGIN}/en/{slug}/">
<meta property="og:type" content="article"><meta property="og:title" content="{escape(g['title'])}"><meta property="og:description" content="{escape(g['intro'])}"><meta property="og:url" content="{ORIGIN}{path}">
<link rel="stylesheet" href="/assets/travel/guides.css"><link rel="icon" href="/assets/icons/favicon.ico"><script type="application/ld+json">{schema}</script></head>
<body><a class="skip" href="#content">{'본문으로 이동' if ko else 'Skip to content'}</a>
<div class="shell"><nav aria-label="{'여행 메뉴' if ko else 'Travel navigation'}"><a class="brand" href="/{'' if ko else 'en/'}">STARGATE<span>TRAVEL NOTES</span></a><div><a href="{nav_path}">{nav_label}</a><a href="{pair}" lang="{'en' if ko else 'ko'}">{'English' if ko else '한국어'}</a></div></nav>
<header><p class="eyebrow">{'생활권과 여행' if ko else 'NEIGHBORHOODS & TRAVEL'}</p><h1>{escape(g['title'])}</h1><p class="intro">{escape(g['intro'])}</p><p class="byline">{'정동수 · 도시공학 연구자' if ko else 'Dongsoo Jung · Urban engineering researcher'} · <time datetime="{DATE}">{DATE}</time></p><div class="jump">{jump_highlights}<a href="#route">{'추천 동선' if ko else 'Route plan'}</a><a href="#sources">{'공식 출처' if ko else 'Official sources'}</a></div></header>
{photo}<main id="content">{body}{related}{refs}</main><footer>© 2026 Dongsoo Jung · Stargate Corporation</footer></div></body></html>''', encoding='utf-8')


if __name__ == '__main__':
    for slug in GUIDES:
        for lang in ['ko', 'en']:
            render(slug, lang)
