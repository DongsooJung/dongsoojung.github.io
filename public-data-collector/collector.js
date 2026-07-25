/**
 * 브라우저용 공공데이터 수집기
 * - serviceKey 이중 인코딩 방지
 * - CSV 생성 후 Supabase Storage/로그 테이블 저장
 */
(function (global) {
  const SUPABASE_URL = 'https://inftexpcnfinglwlrvsj.supabase.co';
  const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImluZnRleHBjbmZpbmdsd2xydnNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MTMyMzgsImV4cCI6MjA4ODQ4OTIzOH0.HONuULp0L3B5T0gTiwJMnowjJonJzzNHhUV_LtpDQoI';
  const STORAGE_BUCKET = 'public-data-csv';
  const LOG_TABLE = 'public_data_collection_logs';
  const KEY_STORAGE = 'stargate-data-go-kr-key';
  const PCT_ENCODED = /%[0-9A-Fa-f]{2}/;
  const FATAL_CODES = new Set(['12', '20', '30', '31', '32', '33']);
  const OK_CODES = new Set(['00', '0', '000', 'NORMAL_SERVICE', 'NORMAL SERVICE.']);

  function seoulParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    return Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  }

  function seoulStamp(date = new Date()) {
    const p = seoulParts(date);
    return {
      ymd: `${p.year}${p.month}${p.day}`,
      ym: `${p.year}${p.month}`,
      isoDate: `${p.year}-${p.month}-${p.day}`,
      fileStamp: `${p.year}${p.month}${p.day}_${p.hour}${p.minute}${p.second}`,
    };
  }

  function previousMonthYm() {
    const p = seoulParts();
    const year = Number(p.year);
    const month = Number(p.month);
    if (month === 1) return `${year - 1}12`;
    return `${year}${String(month - 1).padStart(2, '0')}`;
  }

  const API_CATALOG = [
    {
      id: 'apt_trade',
      name: '부동산_실거래가',
      description: '국토부 아파트 매매 실거래가 (기본: 강남구·전월)',
      url: 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev',
      params: { LAWD_CD: '11680' },
      dynamicParams: () => ({ DEAL_YMD: previousMonthYm() }),
      maxPages: 3,
      rowsPerPage: 1000,
    },
    {
      id: 'store_dong',
      name: '서울_상권정보',
      description: '소상공인 상가업소 행정동 목록 (기본: 역삼1동)',
      url: 'https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInDong',
      params: { divId: 'adongCd', key: '1168010100', type: 'json' },
      maxPages: 3,
      rowsPerPage: 1000,
    },
    {
      id: 'store_upjong',
      name: '소상공인_상권분석',
      description: '업종·행정동 상가업소 (기본: 음식업·대치2동)',
      url: 'https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInUpjong',
      params: { indsLclsCd: 'Q', divId: 'adongCd', key: '1168011800', type: 'json' },
      maxPages: 3,
      rowsPerPage: 1000,
    },
    {
      id: 'village_fcst',
      name: '기상청_단기예보',
      description: '단기예보 조회 (기본: 강남구 격자 nx=61, ny=126)',
      url: 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst',
      params: { dataType: 'JSON', base_time: '0500', nx: '61', ny: '126' },
      dynamicParams: () => ({ base_date: seoulStamp().ymd }),
      maxPages: 1,
      rowsPerPage: 1000,
    },
  ];

  class DataGoKrError extends Error {
    constructor(code, message, fatal = false) {
      super(`[${code}] ${message}`);
      this.code = code;
      this.fatal = fatal;
    }
  }

  function encodeServiceKey(apiKey) {
    return PCT_ENCODED.test(apiKey) ? apiKey : encodeURIComponent(apiKey);
  }

  function buildUrl(baseUrl, params, apiKey) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params || {})) {
      if (key === 'serviceKey' || value == null || value === '') continue;
      query.set(key, String(value));
    }
    const rest = query.toString();
    const keyPart = `serviceKey=${encodeServiceKey(apiKey)}`;
    return rest ? `${baseUrl}?${keyPart}&${rest}` : `${baseUrl}?${keyPart}`;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function decodeXml(value = '') {
    return value
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&quot;', '"')
      .replaceAll('&apos;', "'")
      .replaceAll('&amp;', '&')
      .trim();
  }

  function readTag(xml, tag) {
    const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    return decodeXml(match?.[1] || '');
  }

  function asInt(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function raiseIfXmlError(text) {
    const code = readTag(text, 'returnReasonCode') || readTag(text, 'resultCode');
    const msg = readTag(text, 'returnAuthMsg') || readTag(text, 'resultMsg') || code;
    if (code && !OK_CODES.has(code)) {
      throw new DataGoKrError(code, msg || '상세 메시지 없음', FATAL_CODES.has(code));
    }
  }

  function raiseIfJsonError(data) {
    const header = data?.header || data?.response?.header || {};
    const code = String(header.resultCode || header.returnReasonCode || '').trim();
    const msg = String(header.resultMsg || header.returnAuthMsg || '').trim();
    if (code && !OK_CODES.has(code)) {
      throw new DataGoKrError(code, msg || '상세 메시지 없음', FATAL_CODES.has(code));
    }
  }

  function parseJsonPayload(data) {
    if (Array.isArray(data)) {
      return { items: data.filter((row) => row && typeof row === 'object'), totalCount: data.length };
    }
    let body = data;
    if (data?.response && typeof data.response === 'object') body = data.response.body || {};
    else if (data?.body && typeof data.body === 'object') body = data.body;
    let items = body?.items ?? [];
    if (items && typeof items === 'object' && !Array.isArray(items)) items = items.item ?? [];
    if (items && typeof items === 'object' && !Array.isArray(items)) items = [items];
    if (!Array.isArray(items)) items = [];
    return {
      items: items.filter((row) => row && typeof row === 'object' && !Array.isArray(row)),
      totalCount: asInt(body?.totalCount, 0),
    };
  }

  function parseXmlPayload(text) {
    const blocks = text.match(/<item>[\s\S]*?<\/item>/gi) || [];
    const items = blocks.map((block) => {
      const row = {};
      for (const match of block.matchAll(/<([A-Za-z0-9_]+)>([\s\S]*?)<\/\1>/g)) {
        if (match[1].toLowerCase() === 'item') continue;
        row[match[1]] = decodeXml(match[2]);
      }
      return row;
    }).filter((row) => Object.keys(row).length);
    return { items, totalCount: asInt(readTag(text, 'totalCount'), items.length) };
  }

  function parseResponse(text) {
    const stripped = (text || '').trim();
    if (!stripped) throw new DataGoKrError('99', '빈 응답을 받았습니다.');
    if (stripped.startsWith('<')) {
      raiseIfXmlError(stripped);
      return parseXmlPayload(stripped);
    }
    let data;
    try {
      data = JSON.parse(stripped);
    } catch (error) {
      throw new DataGoKrError('99', `응답 파싱 실패: ${error.message}`);
    }
    raiseIfJsonError(data);
    return parseJsonPayload(data);
  }

  async function fetchPage(baseUrl, params, apiKey) {
    const url = buildUrl(baseUrl, params, apiKey);
    const response = await fetch(url, {
      headers: { Accept: 'application/json, text/xml, */*' },
    });
    const text = await response.text();
    if (response.status === 403) {
      throw new DataGoKrError('30', 'HTTP 403. 인증키 또는 활용신청을 확인하십시오.', true);
    }
    if (!response.ok) {
      throw new DataGoKrError(String(response.status), text.slice(0, 200) || `HTTP ${response.status}`);
    }
    return parseResponse(text);
  }

  async function paginate(api, apiKey) {
    const baseParams = {
      ...api.params,
      ...(typeof api.dynamicParams === 'function' ? api.dynamicParams() : {}),
    };
    const collected = [];
    const maxPages = api.maxPages || 3;
    const rowsPerPage = api.rowsPerPage || 1000;

    for (let page = 1; page <= maxPages; page += 1) {
      if (page > 1) await sleep(1100);
      const result = await fetchPage(
        api.url,
        { ...baseParams, pageNo: String(page), numOfRows: String(rowsPerPage) },
        apiKey,
      );
      if (!result.items.length) break;
      collected.push(...result.items);
      if (result.items.length < rowsPerPage) break;
      if (result.totalCount && collected.length >= result.totalCount) break;
    }
    return { items: collected, params: baseParams };
  }

  function toCsv(rows) {
    if (!rows.length) return '\uFEFFid\n';
    const fields = [];
    const seen = new Set();
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        if (!seen.has(key)) {
          seen.add(key);
          fields.push(key);
        }
      }
    }
    const escape = (value) => {
      const text = value == null ? '' : String(value);
      if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
      return text;
    };
    return `\uFEFF${[fields.join(',')].concat(rows.map((row) => fields.map((f) => escape(row[f])).join(','))).join('\n')}\n`;
  }

  function getStoredKey() {
    try {
      return localStorage.getItem(KEY_STORAGE) || '';
    } catch (_) {
      return '';
    }
  }

  function setStoredKey(value) {
    try {
      if (value) localStorage.setItem(KEY_STORAGE, value);
      else localStorage.removeItem(KEY_STORAGE);
    } catch (_) {
      /* ignore */
    }
  }

  async function supabaseFetch(path, options = {}) {
    const response = await fetch(`${SUPABASE_URL}${path}`, {
      ...options,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        ...(options.headers || {}),
      },
    });
    return response;
  }

  async function listLogs(limit = 20) {
    const response = await supabaseFetch(
      `/rest/v1/${LOG_TABLE}?select=*&order=collected_at.desc&limit=${limit}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!response.ok) return [];
    return response.json();
  }

  async function probeSchema() {
    const response = await supabaseFetch(`/rest/v1/${LOG_TABLE}?select=id&limit=1`, {
      headers: { Accept: 'application/json' },
    });
    if (response.ok) return { ok: true };
    const detail = await response.text();
    return {
      ok: false,
      missingTable: detail.includes('PGRST205') || detail.includes('Could not find the table'),
      detail: detail.slice(0, 240),
    };
  }

  async function uploadCsv(storagePath, csv) {
    const response = await supabaseFetch(`/storage/v1/object/${STORAGE_BUCKET}/${storagePath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'x-upsert': 'true',
      },
      body: csv,
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Supabase Storage 업로드 실패 (${response.status}): ${detail.slice(0, 200)}`);
    }
    return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${storagePath}`;
  }

  async function insertLog(row) {
    const response = await supabaseFetch(`/rest/v1/${LOG_TABLE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(row),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Supabase 로그 저장 실패 (${response.status}): ${detail.slice(0, 200)}`);
    }
    const rows = await response.json();
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async function collect({ apis, apiKey, saveToSupabase = true, previewLimit = 12, onProgress } = {}) {
    const key = (apiKey || getStoredKey() || '').trim();
    if (!key) throw new Error('공공데이터포털 인증키를 입력해 주세요.');

    const requested = Array.isArray(apis) && apis.length ? apis : API_CATALOG.map((api) => api.id);
    const stamp = seoulStamp();
    const results = [];

    for (const id of requested) {
      const api = API_CATALOG.find((item) => item.id === id);
      if (!api) {
        results.push({ id, ok: false, error: 'unknown_api' });
        continue;
      }
      onProgress?.(`${api.name} 수집 중…`);
      try {
        const { items, params } = await paginate(api, key);
        const csv = toCsv(items);
        const fileName = `${api.name}_${stamp.fileStamp}.csv`;
        const storagePath = `${stamp.isoDate}/${api.id}/${fileName}`;
        let publicUrl = null;

        let saveWarning = '';
        if (saveToSupabase) {
          try {
            publicUrl = await uploadCsv(storagePath, csv);
            await insertLog({
              api_id: api.id,
              api_name: api.name,
              row_count: items.length,
              file_name: fileName,
              storage_path: storagePath,
              public_url: publicUrl,
              params,
              status: 'ok',
              collected_at: new Date().toISOString(),
            });
          } catch (saveError) {
            saveWarning = saveError instanceof Error ? saveError.message : String(saveError);
          }
        }

        results.push({
          id: api.id,
          name: api.name,
          ok: true,
          rowCount: items.length,
          params,
          fileName,
          storagePath: publicUrl ? storagePath : null,
          publicUrl,
          saveWarning,
          preview: items.slice(0, previewLimit),
          csv,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (saveToSupabase) {
          try {
            await insertLog({
              api_id: api.id,
              api_name: api.name,
              row_count: 0,
              file_name: '',
              storage_path: '',
              public_url: '',
              params: api.params,
              status: 'error',
              error_message: message.slice(0, 500),
              collected_at: new Date().toISOString(),
            });
          } catch (_) {
            /* ignore */
          }
        }
        results.push({
          id: api.id,
          name: api.name,
          ok: false,
          error: message,
          fatal: Boolean(error?.fatal),
        });
        if (error?.fatal) break;
      }
    }

    return {
      ok: results.some((row) => row.ok),
      collectedAt: new Date().toISOString(),
      seoulDate: stamp.isoDate,
      savedToSupabase: saveToSupabase,
      results,
    };
  }

  global.StargatePublicDataCollector = {
    API_CATALOG,
    SUPABASE_URL,
    STORAGE_BUCKET,
    getStoredKey,
    setStoredKey,
    listLogs,
    probeSchema,
    collect,
    buildUrl,
    toCsv,
    encodeServiceKey,
  };
})(typeof window !== 'undefined' ? window : globalThis);
