import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOOKS_PATH = path.join(ROOT, 'reading', 'data', 'books.json');
const OUTPUT_PATH = path.join(ROOT, 'reading', 'data', 'featured-ai-books.json');
const SOURCE_OVERRIDES = new Map([
  ['391339ae11e581c1a917c7315080a573', 'https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=314827830'],
]);

const SELECTED = [
  ['30b339ae11e58147b6deed78615523d9', 'AI 미래', 'AI가 일상과 산업을 바꿀 가능성을 기술 전망과 서사로 함께 살펴보는 책입니다.', ['AI 미래', '산업 변화', '기술 전망']],
  ['30b339ae11e58141a7a0d4da058d0b56', 'AI 미래', '인공지능 이후의 국제 질서와 인간의 역할을 함께 생각하기 위한 관점서입니다.', ['AI 사회', '국제 질서', '인간과 기술']],
  ['391339ae11e5816dba33c2850ccb2873', 'AI 미래', '생성형 AI 경쟁의 흐름과 국내 산업이 준비해야 할 과제를 파악하는 데 초점을 둡니다.', ['생성형 AI', '산업 전략', '기술 경쟁']],
  ['391339ae11e5818094cdd022bc8bc31a', 'AI 학습', 'AI와 빅데이터 분야에 입문해 학습 경로와 실무 역량을 설계하려는 독자를 위한 책입니다.', ['AI 입문', '빅데이터', '학습 로드맵']],
  ['391339ae11e5818291bfcb96901904dc', 'AI 자동화', 'Claude와 MCP를 활용해 반복 업무를 자동화하는 실무 흐름을 빠르게 익히는 안내서입니다.', ['Claude', 'MCP', '업무 자동화']],
  ['391339ae11e581f3aed2f22e0386bc67', 'AI 코딩', '아이디어를 AI와 함께 서비스 구조로 구체화하는 바이브 코딩의 설계 관점을 다룹니다.', ['바이브 코딩', '서비스 설계', 'AI 개발']],
  ['391339ae11e581fda6edfe879fdc37c2', 'AI 코딩', 'Cursor를 활용해 코드를 작성하고 수정하는 AI 협업 개발의 기본 과정을 익히는 책입니다.', ['Cursor', 'AI 코딩', '개발 입문']],
  ['391339ae11e5816b8e00e8ffecdb9569', 'AI 코딩', 'Cursor AI로 여러 프로그램을 직접 만들며 프롬프트와 구현 과정을 연결하는 실습서입니다.', ['Cursor', '프로젝트 실습', '바이브 코딩']],
  ['391339ae11e5817a9092d736fcae9bf9', 'AI 코딩', 'Claude Code를 개발 과정에 적용해 탐색·수정·검증을 이어가는 실무 사용법을 다룹니다.', ['Claude Code', '에이전트 코딩', '개발 생산성']],
  ['391339ae11e581daa06bef3871754196', '생성형 AI 활용', '챗GPT의 핵심 기능을 업무와 일상에 적용하는 가장 짧은 실습 경로를 제공합니다.', ['ChatGPT', '업무 활용', '생성형 AI']],
  ['391339ae11e5815a8083d9f6423988f4', '생성형 AI 활용', '보고서와 기획서 작성을 위한 프롬프트를 업무 단계별로 구성하는 방법을 다룹니다.', ['프롬프트', '보고서', '기획 업무']],
  ['391339ae11e581af87b7c5b304eee583', 'AI 자동화', '챗GPT와 파이썬을 연결해 웹 데이터 수집 과정을 자동화하는 프로젝트형 실습서입니다.', ['ChatGPT', '크롤링', '파이썬 자동화']],
  ['391339ae11e581829e34d4478b858d61', '프롬프트 엔지니어링', '좋은 결과를 얻기 위한 프롬프트 구조와 반복 개선 원리를 체계적으로 학습하는 책입니다.', ['프롬프트 엔지니어링', '생성형 AI', '질문 설계']],
  ['391339ae11e581ec9d83e2dda74f3c3d', 'AI 코딩', 'Cursor의 기능과 활용 사례를 폭넓게 살펴보고 개발 업무에 적용하기 위한 참고서입니다.', ['Cursor', 'AI 개발 도구', '개발 생산성']],
  ['391339ae11e581519c57f94af8015688', 'AI 에이전트', 'LangChain과 RAG를 이용해 외부 지식을 연결한 생성형 AI 서비스를 구현하는 실습서입니다.', ['LangChain', 'RAG', 'LLM 애플리케이션']],
  ['391339ae11e5818d94a7e3816dc3a4fd', '프롬프트 엔지니어링', '다양한 생성형 AI 상황에 재사용할 수 있는 프롬프트 패턴을 실무 중심으로 정리합니다.', ['프롬프트', '업무 자동화', '생성형 AI']],
  ['30b339ae11e5815f8008d8fd5d6a30a7', '머신러닝', '사이킷런과 텐서플로를 바탕으로 머신러닝의 개념과 구현을 함께 익히는 대표 실무서입니다.', ['머신러닝', '딥러닝', 'TensorFlow']],
  ['391339ae11e581cbb52dc37cfabec144', '개발 기초', '파이썬 문법에서 실습까지 단계적으로 이어지는 개발 입문서로 기초를 다지는 데 적합합니다.', ['파이썬', '프로그래밍 입문', '개발 기초']],
  ['30b339ae11e5816d811afc2e704bbf94', '개발 기초', '독학 흐름에 맞춘 예제와 연습문제로 파이썬 기본기를 쌓는 입문서입니다.', ['파이썬', '독학', '프로그래밍 입문']],
  ['391339ae11e581c1a917c7315080a573', 'AI 자동화', '파이썬으로 파일·문서·웹 업무를 자동화해 반복 작업을 줄이는 방법을 실습합니다.', ['파이썬', 'RPA', '업무 자동화']],
  ['30b339ae11e581bd9fa2f223cd4ebbf6', '데이터 분석', '파이썬 데이터 분석의 전 과정을 실제 데이터와 함께 따라가는 입문 실습서입니다.', ['데이터 분석', '파이썬', '시각화']],
  ['30b339ae11e581199466eb086419a81f', '데이터 분석', '데이터와 인과관계를 구분해 더 나은 의사결정을 만드는 분석적 사고를 소개합니다.', ['데이터 기반 의사결정', '인과관계', '분석 사고']],
  ['30b339ae11e581e3aef4c69f919ffbec', '데이터 분석', '빅데이터가 사회와 비즈니스에서 어떤 방식으로 활용되는지 쉽게 이해하도록 돕는 안내서입니다.', ['빅데이터', '데이터 활용', '디지털 전환']],
  ['391339ae11e58171a717f039a19609a8', '알고리즘', '문제 해결 과정을 이야기와 예제로 풀어 알고리즘 사고방식에 친숙해지도록 돕습니다.', ['알고리즘', '문제 해결', '개발 사고']],
  ['391339ae11e581c993c6d86f7c7e8f70', '알고리즘', '파이썬으로 코딩 테스트 유형을 분석하고 효율적인 풀이 전략을 연습하는 실전서입니다.', ['코딩 테스트', '파이썬', '알고리즘']],
  ['30b339ae11e58151b643d7a8f865f249', '개발 인프라', '컨테이너의 기본 개념부터 이미지와 운영 환경까지 도커 활용법을 다루는 실무서입니다.', ['Docker', '컨테이너', '개발 환경']],
  ['30b339ae11e581e8b5c3d49ee7d92b94', '개발 인프라', '클라우드 환경에 맞는 애플리케이션 구조와 운영 원칙을 이해하기 위한 책입니다.', ['클라우드 네이티브', '마이크로서비스', '운영']],
  ['30b339ae11e581059df0f49dcff6dc0f', '개발 인프라', '개발과 운영의 협업을 개선하는 문화·자동화·측정 원칙을 종합적으로 살펴봅니다.', ['DevOps', 'CI/CD', '협업']],
  ['30b339ae11e581b9a3eec4e8401038a7', '개발 인프라', '리눅스 시스템을 설치·관리하고 서버 운영의 기초를 다지는 종합 안내서입니다.', ['Linux', '서버 운영', '시스템 관리']],
  ['391339ae11e581bb836acace8a1950bd', '개발 협업', 'Git과 GitHub의 기본 명령부터 협업 흐름까지 단계적으로 익히는 입문서입니다.', ['Git', 'GitHub', '개발 협업']],
];

function readJsonLd(html) {
  const matches = [...html.matchAll(/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of matches) {
    try {
      const value = JSON.parse(match[1]);
      const nodes = Array.isArray(value) ? value : [value];
      const book = nodes.find((node) => node?.['@type'] === 'Book');
      if (book) return book;
    } catch { /* 다른 스크립트 블록을 계속 확인 */ }
  }
  throw new Error('Book JSON-LD를 찾지 못했습니다.');
}

const nameOf = (value) => Array.isArray(value)
  ? value.map(nameOf).filter(Boolean).join(', ')
  : typeof value === 'string' ? value : value?.name || '';

export function normalizeBookTitle(value = '') {
  return String(value).normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/[\p{P}\p{S}\s]/gu, '');
}

export function assertMatchingSource(catalogTitle, schema) {
  const catalog = normalizeBookTitle(catalogTitle);
  const source = normalizeBookTitle(schema?.name);
  if (!catalog || !source || (!catalog.includes(source) && !source.includes(catalog))) {
    throw new Error(`${catalogTitle}: 출처 도서명이 일치하지 않습니다 (${schema?.name || '제목 없음'}).`);
  }
  const cover = new URL(schema.image);
  if (cover.protocol !== 'https:' || cover.hostname !== 'image.aladin.co.kr') {
    throw new Error(`${catalogTitle}: 허용되지 않은 표지 URL입니다.`);
  }
}

function safeAladinProductUrl(value, title) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'www.aladin.co.kr'
    || url.pathname.toLowerCase() !== '/shop/wproduct.aspx' || !/^\d+$/.test(url.searchParams.get('ItemId') || '')) {
    throw new Error(`${title}: 허용되지 않은 알라딘 상품 URL입니다.`);
  }
  return `https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=${url.searchParams.get('ItemId')}`;
}

export async function updateFeaturedAiBooks() {
  const [catalog, previous] = await Promise.all([
    fs.readFile(BOOKS_PATH, 'utf8').then(JSON.parse),
    fs.readFile(OUTPUT_PATH, 'utf8').then(JSON.parse).catch(() => null),
  ]);
  const booksById = new Map(catalog.books.map((book) => [book.notionId, book]));
  const featured = [];

  for (const [notionId, theme, curationNote, keywords] of SELECTED) {
    const source = booksById.get(notionId);
    if (!source?.aladinUrl) throw new Error(`${notionId}: 알라딘 URL이 없습니다.`);
    const sourceUrl = safeAladinProductUrl(SOURCE_OVERRIDES.get(notionId) || source.aladinUrl, source.title);
    const response = await fetch(sourceUrl, { headers: { 'user-agent': 'StargateEdu reading metadata updater/1.0' } });
    if (!response.ok) throw new Error(`${source.title}: HTTP ${response.status}`);
    const schema = readJsonLd(await response.text());
    assertMatchingSource(source.title, schema);
    featured.push({
      notionId,
      rank: featured.length + 1,
      theme,
      title: source.title,
      sourceTitle: schema.name,
      author: nameOf(schema.author) || source.author,
      publisher: nameOf(schema.publisher),
      coverUrl: schema.image || '',
      isbn: schema.workExample?.[0]?.isbn || '',
      publishedAt: schema.workExample?.[0]?.datePublished || '',
      curationNote,
      keywords,
      sourceUrl,
      aladinUrl: sourceUrl,
      indexable: true,
    });
  }

  const incomplete = featured.filter((book) => !book.author || !book.publisher || !book.coverUrl
    || !book.curationNote || book.keywords.length < 2);
  if (featured.length !== 30 || incomplete.length) {
    throw new Error(`대표 도서 검증 실패: ${featured.length}권, 불완전 ${incomplete.length}권`);
  }
  const sameBooks = previous && JSON.stringify(previous.books) === JSON.stringify(featured);
  const payload = {
    generatedAt: sameBooks ? previous.generatedAt : new Date().toISOString(),
    source: '알라딘 공개 도서정보 및 StargateEdu 편집 큐레이션',
    notice: '큐레이션 소개는 개인 독후감과 구분됩니다.',
    total: featured.length,
    books: featured,
  };
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`AI 기술 대표 도서 ${featured.length}권 서지정보 갱신 완료`);
  return payload;
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) await updateFeaturedAiBooks();
