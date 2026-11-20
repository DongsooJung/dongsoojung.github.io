/**
 * OneNote · Notion 웹 서비스 상태 집계 프록시
 *
 * GET /api/service-status
 *  - Notion 공식 status page summary
 *  - OneNote / Notion 웹 엔드포인트 도달성·지연 프로브
 *
 * CORS로 브라우저에서 직접 호출이 어려운 Microsoft 엔드포인트를
 * 서버에서 대신 점검하고 단일 JSON으로 반환한다.
 */

const NOTION_SUMMARY = 'https://www.notion-status.com/api/v2/summary.json';
const UA =
  'Mozilla/5.0 (compatible; StargateStatusMonitor/1.0; +https://stargateedu.co.kr/onenote-notion-status/)';

const PROBES = [
  {
    id: 'onenote-web',
    service: 'onenote',
    label: 'OneNote 웹',
    url: 'https://www.onenote.com/',
    accept: [200, 301, 302, 303, 307, 308],
  },
  {
    id: 'onenote-cloud',
    service: 'onenote',
    label: 'OneNote Cloud',
    url: 'https://onenote.cloud.microsoft/',
    accept: [200, 301, 302, 303, 307, 308],
  },
  {
    id: 'onenote-officeapps',
    service: 'onenote',
    label: 'OneNote Office Apps',
    url: 'https://onenote.officeapps.live.com/hosting/discovery',
    accept: [200],
  },
  {
    id: 'notion-web',
    service: 'notion',
    label: 'Notion 웹',
    url: 'https://www.notion.so/',
    accept: [200, 301, 302, 303, 307, 308],
  },
  {
    id: 'notion-api',
    service: 'notion',
    label: 'Notion API',
    url: 'https://api.notion.com/v1/users/me',
    accept: [401, 403], // 인증 거절 응답 수신만 확인; 정상 서비스 증거가 아님
  },
];

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30');
}

async function probe(target) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(target.url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/json,*/*',
      },
    });
    const latencyMs = Date.now() - started;
    const authRequired = [401, 403].includes(response.status);
    const ok = target.accept.includes(response.status) && !authRequired;
    return {
      id: target.id,
      service: target.service,
      label: target.label,
      url: target.url,
      finalUrl: response.url || target.url,
      httpStatus: response.status,
      latencyMs,
      ok,
      state: ok ? (latencyMs > 2500 ? 'degraded' : 'operational') : 'unknown',
      reachability: authRequired ? 'auth_required' : ok ? 'reachable' : 'http_error',
      error: null,
    };
  } catch (error) {
    return {
      id: target.id,
      service: target.service,
      label: target.label,
      url: target.url,
      finalUrl: target.url,
      httpStatus: null,
      latencyMs: Date.now() - started,
      ok: false,
      state: 'unknown',
      reachability: 'unavailable',
      error: error.name === 'AbortError' ? 'timeout' : String(error.message || error),
    };
  } finally {
    clearTimeout(timer);
  }
}

function summarizeProbes(probes) {
  if (!probes.length) return { state: 'unknown', okCount: 0, total: 0, avgLatencyMs: null };
  const okCount = probes.filter((p) => p.ok).length;
  const downCount = probes.filter((p) => p.state === 'down').length;
  const degradedCount = probes.filter((p) => p.state === 'degraded').length;
  const latencies = probes.filter((p) => p.ok && Number.isFinite(p.latencyMs) && p.latencyMs >= 0).map((p) => p.latencyMs);
  const avgLatencyMs = latencies.length
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : null;

  let state = 'operational';
  if (downCount === probes.length) state = 'down';
  else if (downCount > 0 || degradedCount > 0) state = 'degraded';
  else if (probes.some((p) => p.state !== 'operational')) state = 'unknown';

  return { state, okCount, total: probes.length, avgLatencyMs };
}

function mapNotionIndicator(indicator) {
  switch (String(indicator || '').toLowerCase()) {
    case 'none':
      return 'operational';
    case 'minor':
    case 'maintenance':
      return 'degraded';
    case 'major':
    case 'critical':
      return 'down';
    default:
      return 'unknown';
  }
}

async function fetchNotionOfficial() {
  const started = Date.now();
  try {
    const response = await fetch(NOTION_SUMMARY, {
      headers: { Accept: 'application/json', 'User-Agent': UA },
      signal: AbortSignal.timeout(10000),
    });
    const latencyMs = Date.now() - started;
    if (!response.ok) {
      return {
        ok: false,
        latencyMs,
        error: `HTTP ${response.status}`,
        status: null,
        components: [],
        incidents: [],
      };
    }
    const data = await response.json();
    if (!data.status || !Array.isArray(data.components)) throw new Error('공식 상태 JSON 형식 확인 필요');
    const components = Array.isArray(data.components)
      ? data.components
          .filter((c) => c && !c.group && c.name)
          .map((c) => ({
            id: c.id,
            name: c.name,
            status: c.status,
            description: c.description || '',
            updatedAt: c.updated_at || null,
          }))
      : [];

    return {
      ok: true,
      latencyMs,
      error: null,
      pageUrl: data.page?.url || 'https://www.notion-status.com/',
      updatedAt: data.page?.updated_at || null,
      description: data.status?.description || 'Unknown',
      indicator: data.status?.indicator || 'unknown',
      state: mapNotionIndicator(data.status?.indicator),
      components,
      incidents: Array.isArray(data.incidents) ? data.incidents.slice(0, 8) : [],
      scheduledMaintenances: Array.isArray(data.scheduled_maintenances)
        ? data.scheduled_maintenances.slice(0, 5)
        : [],
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: String(error.message || error),
      status: null,
      components: [],
      incidents: [],
    };
  }
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'GET only' });
    return;
  }

  const checkedAt = new Date().toISOString();
  const [notionOfficial, ...probeResults] = await Promise.all([
    fetchNotionOfficial(),
    ...PROBES.map((target) => probe(target)),
  ]);

  const onenoteProbes = probeResults.filter((p) => p.service === 'onenote');
  const notionProbes = probeResults.filter((p) => p.service === 'notion');
  const onenoteSummary = summarizeProbes(onenoteProbes);
  const notionProbeSummary = summarizeProbes(notionProbes);

  const notionOfficialState = notionOfficial.ok ? notionOfficial.state : 'unknown';

  const payload = {
    implementationVersion: '20261120-scope-v2',
    checkedAt,
    region: process.env.VERCEL_REGION || 'local',
    services: {
      onenote: {
        name: 'Microsoft OneNote',
        webUrl: 'https://www.onenote.com/',
        statusPageUrl: 'https://status.cloud.microsoft/',
        official: {
          note:
            'Microsoft Graph 테넌트 상태는 조직의 ServiceHealth.Read.All 권한이 필요하고 개인 Microsoft 계정은 지원하지 않습니다. 공개 응답 도달성은 OneNote 계정·동기화 상태를 증명하지 않습니다.',
          state: 'unknown',
        },
        probes: onenoteProbes,
        summary: onenoteSummary,
        overall: 'unknown',
      },
      notion: {
        name: 'Notion',
        webUrl: 'https://www.notion.so/',
        statusPageUrl: 'https://www.notion-status.com/',
        official: notionOfficial,
        probes: notionProbes,
        summary: notionProbeSummary,
        overall: notionOfficialState,
      },
    },
  };

  res.status(200).json(payload);
}
