const API_ENDPOINT =
  'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade';
const DEAL_MONTH = '202606';
const SUPABASE_FALLBACK_URL = 'https://inftexpcnfinglwlrvsj.supabase.co';
const DISTRICTS = [
  { code: '41591', name: '만세구' },
  { code: '41593', name: '효행구' },
  { code: '41595', name: '병점구' },
  { code: '41597', name: '동탄구' },
];

const decodeXml = (value = '') =>
  value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')
    .trim();

const readTag = (xml, tag) => {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return decodeXml(match?.[1] || '');
};

const toNumber = (value) => {
  const parsed = Number(String(value).replaceAll(',', '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

async function fetchXml(districtCode, pageNo, numOfRows) {
  const serviceKey = process.env.DATA_GO_KR_API_KEY;
  if (!serviceKey) throw new Error('DATA_GO_KR_API_KEY is not configured');
  const params = new URLSearchParams({
    serviceKey,
    LAWD_CD: districtCode,
    DEAL_YMD: DEAL_MONTH,
    pageNo: String(pageNo),
    numOfRows: String(numOfRows),
  });
  const response = await fetch(`${API_ENDPOINT}?${params}`, {
    headers: { accept: 'application/xml', 'user-agent': 'stargate-hwaseong-api/1.0' },
  });
  const xml = await response.text();
  const resultCode = readTag(xml, 'resultCode');
  if (!response.ok || !['000', '00'].includes(resultCode)) {
    throw new Error(readTag(xml, 'resultMsg') || `public_api_${response.status}`);
  }
  return xml;
}

function parseItems(xml, district, globalStart, localStart) {
  return (xml.match(/<item>[\s\S]*?<\/item>/gi) || []).map((block, index) => {
    const year = readTag(block, 'dealYear') || '2026';
    const month = readTag(block, 'dealMonth').padStart(2, '0');
    const day = readTag(block, 'dealDay').padStart(2, '0');
    const globalIndex = globalStart + localStart + index;
    return {
      transaction_key: `${DEAL_MONTH}:${district.code}:${globalIndex}`,
      global_index: globalIndex,
      deal_month: '2026-06',
      district_code: district.code,
      district_name: district.name,
      neighborhood: readTag(block, 'umdNm'),
      apartment_name: readTag(block, 'aptNm'),
      deal_date: `${year}-${month}-${day}`,
      price_manwon: Math.round(toNumber(readTag(block, 'dealAmount'))),
      area_sqm: toNumber(readTag(block, 'excluUseAr')),
      floor: Math.round(toNumber(readTag(block, 'floor'))),
      build_year: Math.round(toNumber(readTag(block, 'buildYear'))),
      jibun: readTag(block, 'jibun'),
      deal_type: readTag(block, 'dealingGbn'),
      agent_location: readTag(block, 'estateAgentSggNm'),
      buyer_type: readTag(block, 'buyerGbn'),
      seller_type: readTag(block, 'slerGbn'),
      cancellation_date: readTag(block, 'cdealDay'),
      registration_date: readTag(block, 'rgstDate'),
    };
  });
}

async function fetchGlobalSlice(offset, limit) {
  const totals = await Promise.all(
    DISTRICTS.map(async (district) => {
      const xml = await fetchXml(district.code, 1, 1);
      return { ...district, total: toNumber(readTag(xml, 'totalCount')) };
    }),
  );
  const totalCount = totals.reduce((sum, district) => sum + district.total, 0);
  const end = Math.min(offset + limit, totalCount);
  const rows = [];
  let globalStart = 0;

  for (const district of totals) {
    const sliceStart = Math.max(offset, globalStart);
    const sliceEnd = Math.min(end, globalStart + district.total);
    if (sliceStart < sliceEnd) {
      let localStart = sliceStart - globalStart;
      let remaining = sliceEnd - sliceStart;
      while (remaining > 0) {
        const pageNo = Math.floor(localStart / 100) + 1;
        const pageOffset = localStart % 100;
        const xml = await fetchXml(district.code, pageNo, 100);
        const pageRows = parseItems(xml, district, globalStart, (pageNo - 1) * 100);
        const selected = pageRows.slice(pageOffset, pageOffset + remaining);
        rows.push(...selected);
        localStart += selected.length;
        remaining -= selected.length;
        if (!selected.length) break;
      }
    }
    globalStart += district.total;
  }
  return { rows, totalCount, totals };
}

function supabaseConfig() {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return null;
  return {
    url: (process.env.SUPABASE_URL || SUPABASE_FALLBACK_URL).replace(/\/$/, ''),
    key,
  };
}

async function storedCount() {
  const config = supabaseConfig();
  if (!config) return 0;
  const response = await fetch(
    `${config.url}/rest/v1/hwaseong_real_estate?select=transaction_key&deal_month=eq.2026-06&limit=1`,
    {
      headers: {
        apikey: config.key,
        authorization: `Bearer ${config.key}`,
        prefer: 'count=exact',
      },
    },
  );
  if (!response.ok) return 0;
  return Number((response.headers.get('content-range') || '').split('/')[1] || 0);
}

async function upsertRows(rows) {
  const config = supabaseConfig();
  if (!config || !rows.length) return false;
  const payload = rows.map((row) => ({
    ...row,
    price_per_sqm_manwon: row.area_sqm
      ? Number((row.price_manwon / row.area_sqm).toFixed(2))
      : 0,
  }));
  const response = await fetch(
    `${config.url}/rest/v1/hwaseong_real_estate?on_conflict=transaction_key`,
    {
      method: 'POST',
      headers: {
        apikey: config.key,
        authorization: `Bearer ${config.key}`,
        'content-type': 'application/json',
        prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) throw new Error(`supabase_${response.status}`);
  return true;
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  res.setHeader('access-control-allow-origin', 'https://www.stargateedu.co.kr');
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, storedCount: await storedCount() });
  }
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  try {
    const offset = Math.max(0, Math.floor(Number(req.body?.offset) || 0));
    const limit = Math.min(100, Math.max(1, Math.floor(Number(req.body?.limit) || 100)));
    const result = await fetchGlobalSlice(offset, limit);
    const stored = await upsertRows(result.rows);
    return res.status(200).json({
      ok: true,
      rows: result.rows,
      offset,
      nextOffset: offset + result.rows.length,
      totalCount: result.totalCount,
      districtTotals: result.totals,
      stored,
      storedCount: stored ? await storedCount() : 0,
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error: error instanceof Error ? error.message : 'sync_failed',
    });
  }
}
