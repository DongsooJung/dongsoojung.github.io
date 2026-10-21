"""Rebuild /en/ from the current Korean portal without drifting project lists."""

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
source = (ROOT / "index.html").read_text(encoding="utf-8")

# Card order is checked against the Korean source so additions cannot silently ship untranslated.
cards = [
    ("/global/", "GLOBAL STARGATE", "Combines AI, data, research and education to make Korean intelligence useful worldwide."),
    ("https://stargate-homepage.vercel.app/", "Stargate corporate website", "Visit the new Stargate corporate website."),
    ("./strategy/healthcare-startups/", "100 healthcare startups", "Compare the products and disclosed revenue of 100 medical AI, diagnostics, telehealth and wellness companies, with reporting years and sources."),
    ("./aphorisms.html", "Daily Wisdom display", "A rotating display of short reflections, beginning with a reminder to stay humble and changing every three seconds."),
    ("./strategy/instagram-ads/", "30-day Instagram consultation campaign", "A lead generation plan for KOI, mathematics and AI education in Daechi: budget, three creatives, KPI thresholds and a 30-day optimization calendar."),
    ("./exchange-rate/", "Monthly macro dashboard: FX, rates, prices and BTC", "Compare exchange rates, the Bank of Korea policy rate, consumer prices and Bitcoin prices, with trend bands and monthly changes. Updated on business days."),
    ("./trade/", "Monthly trade dashboard by country", "Explore monthly exports, imports, trade balances, top ten partners and country trends from Korea Customs Service data. Updated monthly."),
    ("./fsc-financial/", "Financial Services Commission company dashboard", "Explore revenue, net income, assets and debt ratios in batches of 100 through charts and a sortable table using the official summary financial statements API."),
    ("./daangn-dashboard/?v=20260720-finance", "Daangn: three-year financial analysis", "Review Daangn's 2023–2025 consolidated and standalone results, revenue growth, profit turnaround, margins and investment burden using official sources."),
    ("./kmong-research/", "Kmong GMV and financial research 2025", "A B2B market report on Kmong's 2022–2025 GMV, revenue and operating profit."),
    ("./strategy/bookstore-big3/", "Kyobo, YES24 and Aladin: three-year comparison", "Compare 2023–2025 revenue and operating profit, physical stores, used books, logistics and digital strategies."),
    ("./strategy/aladin-usedbook-financial/", "Aladin: financials and used-book strategy", "Analyze inventory turns, purchase prices, store productivity and omnichannel strategy behind Aladin's profitability."),
    ("./strategy/ohouse-financial/", "Ohouse: 2023–2025 financial and strategy review", "Examine Ohouse's revenue growth, first profit in 2024 and renewed investment in construction, offline retail, AI and global expansion."),
    ("./strategy/home-service-platforms/", "Cleaning Lab vs. Miso: home services", "Compare Cleaning Lab's revenue and profit separately from Miso's GMV, orders and service expansion."),
    ("./soomgo-research/", "Soomgo financial research 2025", "Analyze Brave Mobile's 2022–2025 revenue and operating profit from OpenDART audit reports."),
    ("/strategy/coupang-commerce/", "Coupang commerce revenue research 2022–2025", "Review net revenue growth, Product Commerce, new businesses and Farfetch using official investor and SEC filings."),
    ("/strategy/amazon-monetization/", "Amazon monetization strategy", "Explore a ten-week seller plan, product listing expansion, consignment and digital products, revenue scenarios and risks."),
    ("/research/information-economics/", "Three research questions in information economics", "Connect adverse selection, moral hazard and signaling to empirical platform, education and procurement research, with candidate data and identification methods."),
    ("/research/immigration-policy/", "Korean F-2, F-5 and F-6 visa policy research", "Compare legal structures, transition paths and policy changes for residence, permanent residence and marriage immigration using official sources."),
    ("/research/researcher-vision/", "Reading beyond visible statistics", "A research vision extending GIS and satellite-based work on North Korea's statistical gaps to Korean youth employment, assets and housing inequality."),
    ("/research/quantum-physics-challenges/", "Three open problems in modern quantum physics", "Frame quantum measurement, quantum gravity and strongly correlated many-body systems as testable research questions."),
    ("/research/deep-earth-ocean-challenges/", "Open problems in the deep ocean and Earth", "Organize deep-sea observation gaps, hydrothermal vents, dark oxygen, the inner core, magnetic reversals and mantle anomalies as inverse problems."),
    ("/research/disease-challenges/", "Three open problems in disease research", "Examine cancer, neurodegeneration and infection or antibiotic resistance through evolution, irreversibility and treatment resistance."),
    ("/research/debate-analyzer/", "Three-way political debate AI analyzer", "A research tool combining five evaluation criteria with speaking-time bias, analysis confidence, claim types and a debate timeline."),
    ("/stargate-main/", "STARGATE headquarters", "Corporate site for AI, spatial econometrics and urban engineering, with navigation connecting the company, blog and shop."),
    ("https://blog.stargateedu.co.kr/", "STARGATE corporate blog", "Research updates, project news, classes and learning materials in AI, education and spatial data."),
    ("/cybersecurity/", "3AI Cybersecurity Suite", "An AI security product for SOC teams combining LLM threat detection, semantic log analysis and incident response automation."),
    ("https://stargate-math-ai.vercel.app", "STARGATE MATH: written-solution AI", "An education AI that explains problem conditions, strategy, calculations and verification step by step for students."),
    ("https://shop.stargateedu.co.kr/", "Stargate Edu Shop", "Online store for KOI and KMO courses, textbooks, mock exams and one-to-one coaching."),
    ("https://stargateedu.co.kr/kakao-send/", "Send to My KakaoTalk", "A web app that sends notes and links to your own KakaoTalk chat after Kakao OAuth login."),
    ("/stay/", "Stay with Dongsoo in Daechi", "A short-stay booking page with Airbnb for international guests and WeHome for domestic guests."),
    ("./drive-blog/", "Public Google Drive knowledge archive", "Browse AI education, mathematics, algorithms, data analysis and smart-city research as a public blog archive."),
    ("./kmong-dashboard/", "Kmong live market monitor", "Daily monitoring of keywords, first-page courses, prices, ratings and instructor exposure across 387 Kmong categories."),
    ("./hwaseong-real-estate/", "Hwaseong property transaction hub", "Explore and export 2,672 June 2026 apartment transactions in Hwaseong's Manse, Hyohang, Byeongjeom and Dongtan districts."),
    ("./reading/", "Millie reading journal", "A personal archive of finished books with ratings, highlights and reviews, searchable by title, author and genre."),
    ("./math-library/", "Mathematics textbook library", "Explore 437 textbooks in 20 categories using an interactive treemap, sunburst, collapsible tree and bar chart."),
    ("/quote-maker/", "Haru Quote Maker", "Create PDF quotations on the web or in Expo Go, with a free daily allowance and Pro features."),
    ("https://damooaai-6vqmrysf.manus.space/", "Damoa AI tools dashboard", "Track AI tool usage, monthly subscriptions, savings opportunities and billing dates in one place."),
    ("https://www.stargateedu.co.kr/ds-research-urban-analytics/", "Seoul real-time urban data dashboard", "Analyze population, congestion, weather and commercial activity at Seoul hotspots using the city's real-time urban data API."),
    ("/court-auction/", "Court auctions and property transactions", "Compare auction notices with transactions and analyze a year of confirmed auction results, market trends and regional differences."),
    ("https://github.com/DongsooJung/smart-city-gis", "Spatial Econometrics Lab", "A GIS research codebase for accessibility, walkability, land-use mix, DID, spatial autocorrelation and choropleth maps."),
    ("https://stargateedu.co.kr/smart-city-gis/dashboard/", "Gangnam walkability and 15-minute-city dashboard", "A live demo with walkability maps, Gangnam Station travel-time contours and a 2019–2026 scenario slider."),
    ("./public-data-collector/", "Public data collection log", "Collect property, business district and weather API data, convert it to CSV and store it in Supabase Storage."),
    ("./strategy/kstartup/", "K-Startup funding radar", "Search open startup support programs from the official API by name, region, category, company age and deadline."),
    ("./onenote-notion-status/", "OneNote and Notion status board", "Monitor official service status, reachability and response latency with updates every 60 seconds."),
    ("./google-trends/", "Google Trends top 100", "Explore trending searches, volumes, categories and related terms with region and time filters and CSV export."),
    ("./korea-tourism/", "Inbound tourism dashboard", "Compare monthly arrivals from China, Taiwan and Vietnam since January 2010 using official Korea Tourism Organization workbooks."),
    ("./cities/", "Places I Have Been", "Explore 84 cities in Korea and 25 other countries on an interactive Leaflet map."),
    ("./cover_designs.html", "Cover Designs — Storyboard", "Six storybook and minimalist cover layout prototypes."),
    ("/koi-coach/", "KOI Coach", "Curated mathematics and informatics olympiad problems, solution archives and student progress tracking."),
]

def replace_once(old, new):
    global source
    if old not in source:
        raise ValueError(f"Missing source text: {old[:80]}")
    source = source.replace(old, new, 1)

source = re.sub(r'<html lang="ko"', '<html lang="en"', source, count=1)
replace_once('<title>정동수 · Dongsoo Jung — Stargate Corp / AI Lab</title>', '<title>Dongsoo Jung — Stargate Corp / AI Lab</title>')
source = re.sub(r'(<meta name="description" content=")[^"]*(">)', r'\1Dongsoo Jung’s portal connecting AI, spatial data, urban and industry research, and KOI education with verifiable projects and services.\2', source, count=1)
source = re.sub(r'(<meta property="og:description" content=")[^"]*(">)', r'\1AI, spatial data, research and KOI education from Stargate Corp.\2', source, count=1)
source = re.sub(r'(<meta property="og:title" content=")[^"]*(">)', r'\1Dongsoo Jung — Stargate Corp / AI Lab\2', source, count=1)
source = source.replace('href="./', 'href="/')
source = source.replace('aria-current="page">한국어', '>한국어', 1).replace('hreflang="en">English', 'hreflang="en" aria-current="page">English', 1)
source = source.replace('rel="canonical" href="https://stargateedu.co.kr/"', 'rel="canonical" href="https://stargateedu.co.kr/en/"', 1)
source = source.replace('property="og:url" content="https://stargateedu.co.kr/"', 'property="og:url" content="https://stargateedu.co.kr/en/"', 1)
source = source.replace('"name":"정동수"', '"name":"Dongsoo Jung"', 1)
source = source.replace('"alternateName":"Dongsoo Jung"', '"alternateName":"정동수"', 1)
source = source.replace('"url":"https://stargateedu.co.kr/"', '"url":"https://stargateedu.co.kr/en/"', 1)
source = source.replace('"name":"서울대학교"', '"name":"Seoul National University"', 1)
source = source.replace('"name":"북한대학원대학교"', '"name":"University of North Korean Studies"', 1)

# Translate each currently published card in place, preserving icons, destinations and metadata.
pattern = re.compile(r'<a class="proj"[^>]*href="([^"]+)"[\s\S]*?</a>')
found = pattern.findall(source)
if len(found) != len(cards) or found != [item[0] if not item[0].startswith('./') else '/' + item[0][2:] for item in cards]:
    raise ValueError("Korean home project list changed; update the English translations before rebuilding")

def translate_card(match):
    index = translate_card.index
    translate_card.index += 1
    href, title, description = cards[index]
    block = match.group(0)
    if index == 0:
        block = block.replace('AI · 데이터 · 연구 · 교육을 묶어 한국 정보를 세계가 쓰는 Korea Intelligence로 확장합니다.', description)
        return block
    block, n = re.subn(r'(<div class="ttl">)[\s\S]*?(</div>)', lambda m: m[1] + title + m[2], block, count=1)
    if n != 1: raise ValueError(f"Missing title: {href}")
    block, n = re.subn(r'(<div class="sub">)[\s\S]*?(</div>)', lambda m: m[1] + description + m[2], block, count=1)
    if n != 1: raise ValueError(f"Missing description: {href}")
    return block

translate_card.index = 0
source = pattern.sub(translate_card, source)

# Copy is deliberately limited to display strings; category data values stay in Korean
# because the shared grid logic uses those values as stable internal identifiers.
copy = {
    '언어 선택': 'Select language', '디자인 테마 선택': 'Select design theme', '디자인 테마': 'Design theme',
    '다음 디자인으로 전환': 'Switch to next design theme',
    '다크': 'Dark', '화이트': 'Light', '오션': 'Ocean', '모노': 'Mono',
    '전략 인사이트': 'Strategy insights', '연구 대시보드': 'Research dashboards',
    '메인 화면 보기 방식': 'Portal view', '화면 전환': 'Switch view', '메인 보기': 'Main view', '목록 대시보드': 'List dashboard',
    '오늘의 격언': 'Daily wisdom', '사이트 사용 분석 대시보드': 'Site analytics dashboard',
    '오늘 ': 'Today ', '누적 ': 'Total ',
    'AI와 공간데이터로': 'Using AI and spatial data to', '도시·산업 문제를 해결합니다.': 'solve urban and industry problems.',
    '공간계량·GIS·DID 연구, 공공데이터 기반 AI 제품, KOI 알고리즘 교육을': 'Spatial econometrics, GIS and DID research, public-data AI products, and KOI education become',
    '검증 가능한 결과물과 서비스로 연결합니다.': 'verifiable work and services.',
    'DID · 정책효과': 'DID · policy impact', 'KOI · 알고리즘': 'KOI · algorithms',
    '공간데이터 AI 분석': 'Spatial-data AI analysis', '플랫폼 재무 분석': 'Platform financial analysis',
    '정동수 · Dongsoo Jung': 'Dongsoo Jung', 'Stargate Corp CEO · 도시공간 데이터 연구자': 'Stargate Corp CEO · urban and spatial-data researcher',
    '서울대 스마트도시공학 박사과정 수료': 'Completed doctoral coursework in Smart City Engineering at Seoul National University',
    '공간계량 · 헤도닉 가격모형 · DID · Python/GIS': 'Spatial econometrics · hedonic pricing · DID · Python/GIS',
    '공군 시설장교(서울공항 PM) · 공군참모총장상 · 토목기사': 'ROK Air Force facilities officer (Seoul Air Base PM) · Chief of Staff Award · Civil Engineer',
    '대치동 KOI 수학정보올림피아드 강사': 'KOI mathematics and informatics olympiad instructor in Daechi-dong',
    '학력': 'Education', '전문': 'Specialties', '경력': 'Experience', '교육': 'Teaching',
    '바로가기': 'Explore', '전략·연구 자료를 확인하거나 카카오톡으로 링크를 보낼 수 있습니다.': 'Explore strategy and research, or send a link to KakaoTalk.',
    '한국의 경제·기업·부동산·관광·도시·교육 데이터를 AI와 연구로 연결해 글로벌 Intelligence 제품으로 확장합니다.': 'Turn Korean economic, business, real-estate, tourism, urban and education data into global intelligence products.',
    '당근·숨고·크몽·네이버·쿠팡 등 플랫폼 기업과 헬스케어 스타트업 100곳의 매출·사업모델을 분석합니다.': 'Analyze revenue and business models at platform companies and 100 healthcare startups.',
    '서울 도시데이터, 환율·무역·관광 등 공공데이터를 인터랙티브 대시보드로 탐색합니다.': 'Explore Seoul urban data, exchange rates, trade and tourism through interactive dashboards.',
    '글로벌 허브': 'Global hub', '전략 허브': 'Strategy hub', '연구 허브': 'Research hub',
    '기업·플랫폼·산업·AI · 쿠팡 포함 최신 리서치': 'Business · platforms · industries · AI · latest research including Coupang',
    '도시·공간·경제·과학 · 55개 프로젝트': 'Urban · spatial · economic · science · 55 projects',
    '대표 프로젝트 · Featured Projects': 'Featured projects', '전체 프로젝트 · All Projects': 'All projects',
    '스타게이트의 교육·도시데이터·연구·전략을 보여주는 대표 프로젝트입니다.': 'Featured work across education, urban data, research and strategy.',
    '프로젝트 운영 요약': 'Project activity summary', '게시됨': 'Published', '신규·실험': 'New / experimental',
    '최근 30일 조회': 'Views in 30 days', '홈 클릭': 'Home clicks',
    '카카오톡 보내기 펼치기': 'Show KakaoTalk sender', '카카오톡 보내기 접기': 'Hide KakaoTalk sender',
    '카카오톡 보내기': 'Send to KakaoTalk', '정렬': 'Sort', '프로젝트 정렬': 'Project sorting',
    '사용빈도순': 'Most used', '가나다순': 'A–Z', '필요순': 'Pinned / needs', '최근업데이트순': 'Recently updated',
    '프로젝트 검색': 'Search projects', '검색어 지우기': 'Clear search', '프로젝트 카테고리': 'Project categories',
    '전체 프로젝트 보기': 'View all projects', '전체': 'All', '전략': 'Strategy', '연구': 'Research', '사업': 'Business',
    '라이프·여행': 'Life and travel',
    '스타게이트가 직접 정리한 국내 여행·생활권 가이드는 전용 페이지에서 확인할 수 있습니다.': 'Explore Stargate’s guides to travel and neighborhoods in Korea.',
    '스타게이트 여행 가이드': 'Stargate travel guides',
    '부산 핫플, 강남 생활권, 양평 두물머리 등 검증한 이동 동선과 방문 정보를 한곳에 모았습니다.': 'Find source-checked routes and visitor information for Busan, Gangnam and Dumulmeori.',
    '국내 여행 · 생활권 · 한·영 안내': 'Korean travel · neighborhoods · Korean and English guides',
    '여행 페이지 보기': 'Explore travel',
    '상호 : 주식회사 별의문 · 대표자명 : 정동수 · 사업자번호 : 848-86-03835 · 통신판매업신고번호 : 2025-서울강남-05246호 · 주소 : 서울특별시 강남구 삼성로63길 8-15, 204호 (대치동) · 전화 : 070-8018-8227 · 개인정보보호책임자 : 정동수 · 이메일 : support@stargateedu.co.kr': 'Business: Stargate Corporation (주식회사 별의문) · CEO: Dongsoo Jung · Business registration: 848-86-03835 · Mail-order registration: 2025-Seoul Gangnam-05246 · Address: 204, 8-15 Samseong-ro 63-gil, Gangnam-gu, Seoul, Korea · Phone: 070-8018-8227 · Privacy officer: Dongsoo Jung · Email: support@stargateedu.co.kr',
    '화면을 한 번 누르면 음악이 재생됩니다': 'Tap the page once to play music',
}

# Replace only literal display content, never attributes such as data-project-category.
for ko, en in sorted(copy.items(), key=lambda item: -len(item[0])):
    source = re.sub(r'(?<=>)' + re.escape(ko) + r'(?=<)', en, source)
    source = source.replace('aria-label="' + ko + '"', 'aria-label="' + en + '"')
    source = source.replace('placeholder="' + ko + '"', 'placeholder="' + en + '"')

# Card action labels and short metadata are ordinary visible text.
card_labels = {
    '열기': 'Open', '보고서': 'Report', '대시보드': 'Dashboard', '연구 보기': 'Read research',
    '글 읽기': 'Read', '전략 보기': 'View strategy', '홈페이지 열기': 'Open website',
    '전광판': 'Open display', '쇼핑하기': 'Shop', '읽기': 'Read', '보내기': 'Send',
    '문제 풀기': 'Solve problems', '분석하기': 'Analyze', '비교 보기': 'Compare',
}
for ko, en in sorted(card_labels.items(), key=lambda item: -len(item[0])):
    source = re.sub(r'(?<=>)' + re.escape(ko) + r'(?=\s*(?:→|↗|<))', en, source)

# Remaining phrases include icons, line breaks or mixed-language technology labels.
loose_copy = {
    '· 누적 ': '· Total ',
    '공간계량·GIS·DID 연구, 공공데이터 기반 AI 제품, KOI 알고리즘 교육을\n        검증 가능한 결과물과 서비스로 연결합니다.': 'Spatial econometrics, GIS and DID research, public-data AI products, and KOI education become verifiable work and services.',
    '↗ 전략 인사이트': '↗ Strategy insights', '◉ 연구 대시보드': '◉ Research dashboards',
    '<div class="avatar">정</div>': '<div class="avatar">DJ</div>',
    '글로벌 허브 →': 'Global hub →', '전략 허브 →': 'Strategy hub →', '연구 허브 →': 'Research hub →',
    '🟡 카카오톡 보내기': '🟡 Send to KakaoTalk',
    '혁신의숲 · THE VC · 매출 14곳 확인': 'Innoforest · THE VC · 14 revenue figures verified',
    'Chart.js · ECB · 한국은행 · Binance': 'Chart.js · ECB · Bank of Korea · Binance',
    'Chart.js · 관세청 · 공공데이터 API': 'Chart.js · Korea Customs Service · public data API',
    'Chart.js · 금융위원회 · data.go.kr': 'Chart.js · Financial Services Commission · data.go.kr',
    '계획·목표치 · Seller Central 연동 전': 'Plans and targets · before Seller Central integration',
    '정보비대칭 · 계약 · 시장설계': 'Information asymmetry · contracts · market design',
    '측정 · 시공간 · 양자물질': 'Measurement · spacetime · quantum matter',
    '심해 · 내핵 · 자기장 · 맨틀': 'Deep sea · inner core · magnetic field · mantle',
    '암 · 뇌 · 감염·내성': 'Cancer · brain · infection and resistance',
    '제품 열기 →': 'Open product →', 'Gemini · 단계별 풀이 · 검산': 'Gemini · step-by-step solutions · verification',
    '국토교통부 API · Supabase': 'Ministry of Land API · Supabase',
    '대시보드 열기 →': 'Open dashboard →',
    'K-Startup · 창업지원 · 공공데이터': 'K-Startup · startup support · public data',
    'Chart.js · 한국관광공사 공식 통계': 'Chart.js · Korea Tourism Organization statistics',
    '여행 페이지 보기 →': 'Explore travel →',
}
for old, new in loose_copy.items():
    source = source.replace(old, new)

# Keep the current home interactions and translate their generated labels.
script_copy = {
    "label: '다크'": "label: 'Dark'", "label: '화이트'": "label: 'Light'", "label: '오션'": "label: 'Ocean'", "label: '모노'": "label: 'Mono'",
    ' 디자인으로 전환 (현재 ': ' theme (current: ', '현재 ${info.label} · 다음 ${next.label}': 'Current: ${info.label} · Next: ${next.label}',
    '영문 A–Z, 한글 가나다, 숫자 순으로 전체 프로젝트를 표시합니다. ‘사용빈도순’을 누르면 최근 실제 사용이 많은 프로젝트부터 볼 수 있습니다.': 'Browse all projects in A–Z order. Choose Most used to see projects ranked by recent activity.',
    '최근 30일 페이지 조회와 홈 클릭을 기준으로 사용이 많은 프로젝트부터 표시합니다. 같은 횟수는 가나다순입니다.': 'Rank projects by page views and home clicks over the last 30 days. Ties are sorted A–Z.',
    '나만의 창고 · 고정한 순서와 최근 사용을 먼저 보여줍니다. 제목·설명·태그·별칭으로 찾고 주제와 종류를 함께 선택하세요.': 'Show pinned items and recently used projects first. Search by title, description, tags or aliases.',
    '각 프로젝트 페이지의 최근 배포 갱신 시각을 기준으로 최신 항목부터 표시합니다.': 'Show the most recently updated project pages first.',
    "'전략', '연구', '교육', '사업'": "'전략', '연구', '교육', '사업'",  # internal identifiers
    "'전체' : category": "'All' : ({'전략':'Strategy','연구':'Research','교육':'Education','사업':'Business'}[category] || category)",
    ' 프로젝트 ${count}개': ' projects: ${count}', '전체 ${available.length}개 보기': 'View all ${available.length} projects',
    '전체 ${availableCards().length}개 보기': 'View all ${availableCards().length} projects',
    '검색 중': 'Searching', '${visible}/${availableCards().length}개': '${visible}/${availableCards().length}',
    '스타게이트의 교육·도시데이터·연구·전략을 보여주는 대표 프로젝트 ${featuredCount}개입니다.': 'Featured work across education, urban data, research and strategy: ${featuredCount} projects.',
    '카카오톡 보내기 접기': 'Hide KakaoTalk sender', '카카오톡 보내기 펼치기': 'Show KakaoTalk sender',
    '외부': 'External', '실험중': 'Experimental', '신규': 'New', '게시됨': 'Published',
    '>상태<': '>Status<', '>페이지 수정일<': '>Page updated<', '>확인중<': '>Checking<',
    '>30일 조회<': '>30-day views<', '>7일 추세<': '>7-day trend<', '>홈 클릭<': '>Home clicks<',
    '직전 7일 0회 → 최근 7일 ': 'Previous 7 days: 0 → Recent 7 days: ',
    '직전 7일 ': 'Previous 7 days: ', '회 → 최근 7일 ': ' → Recent 7 days: ', '회"': '"',
    '연결 실패': 'Unavailable', '방문 통계를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.': 'Visitor statistics could not be loaded. Please try again later.',
    '미확인': 'Unknown', '전체 프로젝트 · All Projects': 'All projects', '대표 프로젝트 · Featured Projects': 'Featured projects',
    'new Intl.DateTimeFormat("ko-KR"': 'new Intl.DateTimeFormat("en-US"', 'toLocaleString("ko-KR")': 'toLocaleString("en-US")',
}
for old, new in script_copy.items():
    if old != new:
        source = source.replace(old, new)

# Remove stale private Gmail references and keep every inquiry address consistent.
source = source.replace('support@stargateedu.co.kr', 'support@stargateedu.co.kr')
source = source.replace('/assets/dashboard-data-status.js?v=20261015-1', '/assets/dashboard-data-status.js?v=20261016-en-1')
source = source.replace('</style>', '@media(max-width:480px){body{zoom:1}}\n</style>', 1)
(ROOT / 'en' / 'index.html').write_text(source, encoding='utf-8')
print(f"Wrote /en/ with {len(cards)} current project cards")
