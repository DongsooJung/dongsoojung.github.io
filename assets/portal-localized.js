(() => {
  const lang = document.documentElement.lang.startsWith('ja') ? 'ja' : 'zh';
  const projects = [
    {
      href:'/stargate-main/',badge:'CORP',emoji:'⭐',bg:'linear-gradient(135deg,#0B1A3A,#C9A24E)',
      zh:['STARGATE 总部 · Stargate Corporation','专注于人工智能、空间计量与城市工程的公司主页，并统一连接总部、博客和商店。','企业网站 · 三站导航','打开 →'],
      ja:['STARGATE 本社 · Stargate Corporation','AI・空間計量・都市工学を展開する企業サイト。本社・ブログ・ショップを統合ナビゲーションで結びます。','企業サイト · 3サイトナビ','開く →']
    },
    {
      href:'https://blog.stargateedu.co.kr/',badge:'BLOG',emoji:'✍️',bg:'radial-gradient(320px 170px at 20% 25%,rgba(196,162,101,.45),transparent 60%),linear-gradient(135deg,#17130d,#352816)',
      zh:['STARGATE 官方博客','汇集房地产与经济、数学与AI、政治与数据频道的最新文章。','博客 · blog.stargateedu.co.kr','阅读 →'],
      ja:['STARGATE 公式ブログ','不動産・経済、数学・AI、政治・データの各チャンネル最新記事をまとめて紹介します。','ブログ · blog.stargateedu.co.kr','読む →']
    },
    {
      href:'https://shop.stargateedu.co.kr/',badge:'SHOP · NEW',image:'/assets/shop-card.svg',
      zh:['Stargate Edu Shop · 在线教育商店','提供 KOI、KMO 信息学与数学奥林匹克课程、教材、模拟考试和一对一辅导。','商店 · shop.stargateedu.co.kr','购物 →'],
      ja:['Stargate Edu Shop · オンラインスクールストア','KOI・KMOの情報／数学オリンピック講座、教材、模擬試験、1対1コーチングを提供します。','ストア · shop.stargateedu.co.kr','ショップへ →']
    },
    {
      href:'/math-library/',emoji:'📚',bg:'linear-gradient(135deg,#0f1a2e,#1f3054)',
      zh:['数学教材库 · 树形可视化','通过矩形树图、旭日图、折叠树和条形图探索 25GB、437 本教材和 20 个分类。','D3.js · 交互式','打开 →'],
      ja:['数学教材ライブラリ · ツリー可視化','25GB・437冊・20カテゴリの教材を、ツリーマップ、サンバースト、折りたたみツリー、棒グラフで探索できます。','D3.js · インタラクティブ','開く →']
    },
    {
      href:'https://dongsoojung.github.io/stargate-ai-gallery/hub.html',badge:'FEATURED',emoji:'🛰️',hero:true,
      zh:['Stargate AI Gallery','收录 33 个由 AI 生成的着陆页、仪表板和信息图。建议从分类中心开始浏览。','HTML · AI 画廊 · 分类中心','打开 →'],
      ja:['Stargate AI Gallery','AIで生成したランディングページ、ダッシュボード、インフォグラフィック33件の公開アーカイブです。','HTML · AIギャラリー · ハブ','開く →']
    },
    {
      href:'https://dongsoojung.github.io/stargate-ai-gallery/',emoji:'🔍',bg:'linear-gradient(135deg,#102042,#1c2f5c)',
      zh:['画廊搜索索引','可按文件名、分类和原始路径搜索及排序画廊内容。','搜索 · 索引','打开 →'],
      ja:['ギャラリー検索インデックス','ファイル名、カテゴリ、元のパスからギャラリー項目を検索・並べ替えできます。','検索 · インデックス','開く →']
    },
    {
      href:'/publishing-market-2025/',badge:'NEW · DATA',emoji:'📚',bg:'radial-gradient(320px 170px at 20% 25%,rgba(232,200,122,.4),transparent 60%),radial-gradient(300px 160px at 80% 80%,rgba(139,127,240,.45),transparent 60%),linear-gradient(135deg,#0c0f1c,#1a2138)',
      zh:['2025 韩国出版市场仪表板','基于 72 家出版社的 DART 披露与韩国出版文化协会统计，展示营收、业务板块与营业利润率。','DART · KPA · Chart.js','打开 →'],
      ja:['2025年 韓国出版市場ダッシュボード','出版社72社のDART開示と韓国出版文化協会の統計に基づき、売上・部門別実績・営業利益率を可視化します。','DART · KPA · Chart.js','開く →']
    },
    {
      href:'/cities/',badge:'NEW',emoji:'🌏',bg:'radial-gradient(340px 170px at 22% 22%,rgba(79,127,255,.5),transparent 60%),radial-gradient(280px 160px at 82% 82%,rgba(46,196,182,.4),transparent 60%),linear-gradient(135deg,#0d1426,#121b33)',
      zh:['我的足迹 · 交互式地图','使用 Leaflet 展示 84 座到访城市，包括韩国 36 座城市及海外 25 个国家，并支持地区筛选。','Leaflet · 交互式地图','打开 →'],
      ja:['訪れた都市 · インタラクティブマップ','国内36都市と海外25か国を含む84都市をLeafletで表示し、地域別の絞り込みに対応します。','Leaflet · インタラクティブマップ','開く →']
    },
    {
      href:'/ds-research-urban-analytics/',badge:'LIVE',emoji:'🏙️',bg:'linear-gradient(135deg,#0a0e27,#1baf7a)',
      zh:['首尔实时城市数据仪表板','利用首尔开放数据 API，实时分析主要热点区域的人口、拥挤度、天气与商业圈。','实时 · Python · Chart.js','打开 →'],
      ja:['ソウル・リアルタイム都市データダッシュボード','ソウル公開データAPIを利用し、主要スポットの人口・混雑・天気・商圏をリアルタイム分析します。','リアルタイム · Python · Chart.js','開く →']
    },
    {
      href:'/court-auction/',badge:'NEW',emoji:'🏛️',bg:'radial-gradient(360px 160px at 20% 20%,rgba(79,127,255,.5),transparent 60%),radial-gradient(280px 160px at 80% 80%,rgba(255,184,107,.4),transparent 60%),linear-gradient(135deg,#0d1426,#1a2540)',
      zh:['法院拍卖房地产仪表板 · 2026','按月整理住宅与商业房地产拍卖信息，并提供地区、用途、类型与评估价格筛选。','数据 · SVG 仪表板','打开 →'],
      ja:['裁判所競売・不動産ダッシュボード · 2026','住宅・商業用不動産の競売情報を月別に整理し、地域・用途・種別・評価額で絞り込めます。','データ · SVGダッシュボード','開く →']
    },
    {
      href:'/kmong-research/',emoji:'📊',bg:'linear-gradient(135deg,#1a2f5c,#2563EB)',
      zh:['Kmong 交易额与财务研究 2025','分析 Kmong 在 2022–2025 年的交易总额、营收与营业利润等 B2B 市场数据。','市场研究 · Chart.js','打开 →'],
      ja:['Kmong 流通総額・財務リサーチ 2025','Kmongの2022〜2025年の流通総額、売上高、営業利益などを分析したB2B市場レポートです。','市場調査 · Chart.js','開く →']
    },
    {
      href:'/cover_designs.html',emoji:'📖',bg:'linear-gradient(135deg,#2a2015,#5c4223)',
      zh:['封面设计 — 故事板','六种故事书与极简风格封面版式设计原型。','设计 · 字体排印','打开 →'],
      ja:['カバーデザイン — ストーリーボード','絵本とミニマルデザインによる6種類の表紙レイアウト試作です。','デザイン · タイポグラフィ','開く →']
    },
    {
      href:'/koi-coach/',emoji:'🧠',bg:'linear-gradient(135deg,#1a2340,#243560)',
      zh:['KOI Coach','面向韩国信息学奥林匹克的精选题目、解答资料与学生学习进度管理。','教育','打开 →'],
      ja:['KOI Coach','韓国情報オリンピック対策の問題キュレーション、解説アーカイブ、学習進捗管理を提供します。','教育','開く →']
    },
    {
      href:'https://github.com/DongsooJung/smart-city-gis',emoji:'🗺️',bg:'linear-gradient(135deg,#1b2640,#223054)',
      zh:['空间计量实验室 · 城市空间分析','涵盖可达性、步行性、土地利用熵、DID、空间自相关与分级设色图的研究代码。','研究 · GitHub','打开 →'],
      ja:['空間計量ラボ · 都市空間分析','アクセシビリティ、歩行性、土地利用エントロピー、DID、空間自己相関、コロプレス可視化の研究コードです。','研究 · GitHub','開く →']
    },
    {
      href:'/stay/',badge:'STAY',emoji:'🏠',bg:'linear-gradient(135deg,#3b2a1c,#8B5A3C 60%,#C9A77B)',
      zh:['Stay with Dongsoo · 大峙洞住宿','由博士背景房东亲自运营的大峙洞高品质短租住宿，可通过 Airbnb 与 WeHome 预订。','Airbnb · WeHome','打开 →'],
      ja:['Stay with Dongsoo · 大峙洞ステイ','博士課程修了のホストが直接運営する大峙洞のプレミアム短期滞在施設。AirbnbとWeHomeで予約できます。','Airbnb · WeHome','開く →']
    },
    {
      href:'/exchange-rate/',badge:'NEW · API',emoji:'💱',bg:'radial-gradient(360px 160px at 24% 24%,rgba(57,135,229,.45),transparent 60%),radial-gradient(280px 160px at 80% 80%,rgba(176,109,224,.32),transparent 60%),linear-gradient(135deg,#0c1730,#12224a)',
      zh:['月度宏观经济仪表板 · 汇率、利率与物价','汇总主要货币汇率、韩国银行基准利率与消费者物价，并展示趋势区间和环比变化。','Chart.js · 韩国进出口银行 · 韩国银行 API','打开 →'],
      ja:['月次マクロ経済ダッシュボード · 為替・金利・物価','主要通貨の為替、韓国銀行の政策金利、消費者物価を集計し、トレンド帯と前月比を表示します。','Chart.js · 韓国輸出入銀行 · 韓国銀行API','開く →']
    },
    {
      href:'/trade/',badge:'NEW · API',emoji:'🚢',bg:'radial-gradient(360px 160px at 24% 24%,rgba(92,136,236,.45),transparent 60%),radial-gradient(280px 160px at 80% 80%,rgba(34,163,133,.32),transparent 60%),linear-gradient(135deg,#0c1730,#12224a)',
      zh:['月度贸易仪表板 · 各国进出口','利用韩国关税厅 API 展示月度出口、进口、贸易差额、前十国家排名与各国趋势。','Chart.js · 关税厅 API','打开 →'],
      ja:['月次貿易ダッシュボード · 国別輸出入','韓国関税庁APIを用いて、月次輸出・輸入・貿易収支、上位10か国、国別推移を表示します。','Chart.js · 関税庁API','開く →']
    },
    {
      href:'/korea-tourism/',badge:'LIVE · API',emoji:'🧳',bg:'radial-gradient(360px 160px at 25% 25%,rgba(57,135,229,.45),transparent 60%),radial-gradient(280px 160px at 78% 78%,rgba(201,133,0,.30),transparent 60%),linear-gradient(135deg,#0c1730,#12224a)',
      zh:['韩国入境游客仪表板 · 中国、台湾、越南','展示 2024 年以来各国赴韩游客的月度趋势，并通过韩国旅游数据与公共 API 自动更新。','Chart.js · 公共数据 API','打开 →'],
      ja:['訪韓観光客ダッシュボード · 中国・台湾・ベトナム','2024年以降の国籍別訪韓客数を月次で表示し、韓国観光データと公共APIから自動更新します。','Chart.js · 公共データAPI','開く →']
    },
    {
      href:'/stargate-visual/',badge:'LIVE',emoji:'📊',bg:'radial-gradient(360px 160px at 20% 20%,rgba(79,127,255,.5),transparent 60%),radial-gradient(280px 160px at 80% 80%,rgba(99,214,160,.38),transparent 60%),linear-gradient(135deg,#0d1426,#121b33)',
      zh:['Stargate Visual Lab · 数据可视化','空间计量与房地产交互式仪表板档案，包含地区分析和特征价格回归。','Recharts · D3 · Plotly','打开 →'],
      ja:['Stargate Visual Lab · データ可視化','空間計量・不動産のインタラクティブダッシュボード集。地域分析とヘドニック回帰を含みます。','Recharts · D3 · Plotly','開く →']
    }
  ];

  const escapeHtml = (value) => String(value).replace(/[&<>"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));
  const grid = document.getElementById('project-grid');
  if (!grid) return;
  grid.innerHTML = projects.map((project) => {
    const [title, description, tag, action] = project[lang];
    const thumbClass = project.hero ? 'thumb hero-shot' : 'thumb';
    const thumbStyle = project.image ? `background:url('${project.image}') center/cover` : `background:${project.bg || 'var(--grad2)'}`;
    return `<a class="proj" href="${escapeHtml(project.href)}">
      ${project.badge ? `<div class="badge">${escapeHtml(project.badge)}</div>` : ''}
      <div class="${thumbClass}" style="${thumbStyle}">${project.emoji ? `<span class="emo">${project.emoji}</span>` : ''}</div>
      <div class="body">
        <div class="ttl">${escapeHtml(title)}</div>
        <div class="sub">${escapeHtml(description)}</div>
        <div class="row"><span class="tag">${escapeHtml(tag)}</span><span class="go">${escapeHtml(action)}</span></div>
      </div>
    </a>`;
  }).join('');
})();
