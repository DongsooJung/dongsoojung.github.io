const ENDPOINT = "https://www.work24.go.kr/cm/openApi/call/wk/callOpenApiSvcInfo210L01.do";
const PAGE_SIZE = 100;
const MAX_PAGES = 10;

function decodeXml(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/gi, " ")
    .replace(/&gt;/gi, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]*>/g, " ")
    .replace(/[<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readTag(xml, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

export function parseWork24Response(xml) {
  if (!/<wantedRoot(?:\s|>)/i.test(xml)) throw new Error("고용24 응답 형식이 올바르지 않습니다.");
  const records = [...xml.matchAll(/<wanted(?:\s[^>]*)?>([\s\S]*?)<\/wanted>/gi)].map(([, record]) => ({
    id: readTag(record, "wantedAuthNo"),
    company: readTag(record, "company"),
    title: readTag(record, "title"),
    location: readTag(record, "region") || readTag(record, "basicAddr"),
    career: readTag(record, "career"),
    employmentType: employmentType(readTag(record, "empTpCd")),
    description: [readTag(record, "indTpNm"), readTag(record, "salTpNm"), readTag(record, "sal")].filter(Boolean).join(" · "),
    postedAt: readTag(record, "regDt"),
    deadline: readTag(record, "closeDt"),
    source: readTag(record, "infoSvc") || "고용24 OPEN-API",
    url: readTag(record, "wantedInfoUrl") || readTag(record, "wantedMobileInfoUrl"),
  }));
  const apiError = ["errCd", "errMsg", "errorCode", "errorMessage"].map((tag) => readTag(xml, tag)).find(Boolean);
  if (apiError) throw new Error("고용24가 채용정보 요청을 거부했습니다.");
  const totalValue = readTag(xml, "total");
  const total = totalValue ? Number(totalValue) : records.length;
  if (!Number.isFinite(total) || (total > 0 && !records.length) || (!records.length && !totalValue && readTag(xml, "message"))) throw new Error("고용24 채용정보 응답에 공고 목록이 없습니다.");
  return { total, rows: records };
}

function employmentType(code) {
  return ({ "4": "파견근로", "10": "기간의 정함이 없는 근로계약", "11": "기간의 정함이 없는 근로계약(시간선택제)", "20": "기간의 정함이 있는 근로계약", "21": "기간의 정함이 있는 근로계약(시간선택제)", Y: "대체인력채용" })[code] || code;
}

export function parseWork24Date(value) {
  const compact = String(value ?? "").trim();
  if (!compact) return "";
  if (/^\d{8}$/.test(compact)) return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}T00:00:00+09:00`;
  return compact;
}

export async function fetchWork24Jobs(authKey, { fetchImpl = fetch } = {}) {
  if (!authKey) throw new Error("WORK24_AUTH_KEY가 설정되지 않았습니다.");
  const rows = [];
  let total = Infinity;
  for (let page = 1; page <= MAX_PAGES && rows.length < total; page += 1) {
    const url = new URL(ENDPOINT);
    url.search = new URLSearchParams({ authKey, callTp: "L", returnType: "XML", startPage: String(page), display: String(PAGE_SIZE), regDate: "D-3", sortOrderBy: "DESC", empTpGb: "1" });
    const response = await fetchImpl(url, { headers: { accept: "application/xml, text/xml" }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`고용24 채용정보 요청 실패: HTTP ${response.status}`);
    const pageResult = parseWork24Response(await response.text());
    total = pageResult.total;
    rows.push(...pageResult.rows);
    if (!pageResult.rows.length) break;
  }
  return { rows, mode: "authorized", source: "고용24 OPEN-API", sourceCount: total, truncated: rows.length < total };
}
