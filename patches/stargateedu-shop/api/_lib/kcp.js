const crypto = require("node:crypto");
const { getProduct, isSubscription } = require("./catalog");

const ENDPOINTS = Object.freeze({
  test: {
    register: "https://stg-spl.kcp.co.kr/std/brpay/treg",
    payment: "https://stg-spl.kcp.co.kr/gw/enc/v1/payment"
  },
  live: {
    register: "https://spl.kcp.co.kr/std/brpay/treg",
    payment: "https://spl.kcp.co.kr/gw/enc/v1/payment"
  }
});

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function hasKcpCredentials() {
  return Boolean(
    process.env.KCP_SITE_CD &&
      process.env.KCP_CERT_INFO &&
      process.env.KCP_PRIVATE_KEY &&
      process.env.CHECKOUT_SIGNING_SECRET
  );
}

function getKcpEnv() {
  return process.env.KCP_ENV === "live" ? "live" : "test";
}

function normalizePem(value) {
  return String(value || "")
    .replace(/\\n/g, "\n")
    .replace(/\r/g, "")
    .trim();
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function signCheckout(payload) {
  const body = base64url(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", requiredEnv("CHECKOUT_SIGNING_SECRET"))
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

function verifyCheckout(token) {
  if (typeof token !== "string" || !token.includes(".")) {
    throw new Error("Invalid checkout token");
  }
  const [body, signature] = token.split(".");
  const expected = crypto
    .createHmac("sha256", requiredEnv("CHECKOUT_SIGNING_SECRET"))
    .update(body)
    .digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("Invalid checkout signature");
  }
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (!payload.exp || Date.now() > payload.exp) {
    throw new Error("Checkout session expired");
  }
  return payload;
}

function createOrderId(productId) {
  const suffix = crypto.randomBytes(6).toString("hex");
  return `SG${Date.now().toString(36)}${productId.replace(/[^a-z0-9]/gi, "").slice(0, 12)}${suffix}`.slice(
    0,
    50
  );
}

function getSiteOrigin(req) {
  const configured = process.env.SITE_ORIGIN;
  if (configured) return configured.replace(/\/$/, "");
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (!host) throw new Error("Unable to determine site origin");
  return `${proto}://${host}`;
}

function createKcpSignData({ siteCd, goodMny, payMethod, regType, orderId }) {
  const plain = `${siteCd}^${goodMny}^${payMethod}^${regType}^${orderId}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(plain);
  signer.end();
  return signer.sign(normalizePem(requiredEnv("KCP_PRIVATE_KEY")), "base64");
}

async function kcpRequest(kind, payload) {
  const endpoints = ENDPOINTS[getKcpEnv()];
  const response = await fetch(endpoints[kind], {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || (data.res_cd && data.res_cd !== "0000")) {
    const error = new Error(data.res_msg || data.error || "KCP request failed");
    error.statusCode = response.status || 502;
    error.providerCode = data.res_cd || data.error_code;
    throw error;
  }
  return data;
}

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  return {};
}

function parseFormBody(raw) {
  const params = new URLSearchParams(String(raw || ""));
  const out = {};
  for (const [key, value] of params.entries()) out[key] = value;
  return out;
}

module.exports = {
  createKcpSignData,
  createOrderId,
  getKcpEnv,
  getProduct,
  getSiteOrigin,
  hasKcpCredentials,
  isSubscription,
  kcpRequest,
  normalizePem,
  parseFormBody,
  parseJsonBody,
  requiredEnv,
  sendJson,
  signCheckout,
  verifyCheckout
};
