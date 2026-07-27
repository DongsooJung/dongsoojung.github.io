const { getProduct, parseFormBody, sendJson, verifyCheckout } = require("../_lib/kcp");

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    if (typeof req.body === "string") return resolve(req.body);
    if (req.body && typeof req.body === "object") {
      return resolve(new URLSearchParams(req.body).toString());
    }
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    const raw = req.method === "POST" ? await readRawBody(req) : "";
    const form = req.method === "POST" ? parseFormBody(raw) : Object.fromEntries(new URL(req.url, "http://localhost").searchParams);
    const checkoutToken = form.param_opt_1 || form.checkoutToken || "";
    const checkout = checkoutToken ? verifyCheckout(checkoutToken) : null;
    const product = checkout ? getProduct(checkout.productId) : null;
    const lang = (checkout && checkout.lang) || "ko";
    const productId = (checkout && checkout.productId) || "";

    const encData = form.enc_data || "";
    const encInfo = form.enc_info || "";
    const tranCd = form.tran_cd || "";
    const resCd = form.res_cd || "";

    if (resCd && resCd !== "0000") {
      res.statusCode = 302;
      res.setHeader(
        "Location",
        `/checkout.html?product=${encodeURIComponent(productId)}&lang=${lang}&payment=fail`
      );
      return res.end();
    }

    if (!checkout || !product || !encData || !encInfo || !tranCd) {
      res.statusCode = 302;
      res.setHeader("Location", `/checkout.html?lang=${lang}&payment=fail`);
      return res.end();
    }

    // Bridge page: browser holds checkoutToken in sessionStorage, then posts approve.
    const html = `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>결제 승인 처리 · Stargate Edu</title>
<style>
body{font-family:Inter,'Noto Sans KR',sans-serif;background:#F7F9FC;color:#1A2233;display:grid;place-items:center;min-height:100vh;margin:0}
.card{background:#fff;border:1px solid #E4E7EC;border-radius:16px;padding:28px;max-width:420px;box-shadow:0 12px 32px rgba(11,42,74,.06)}
h1{font-size:20px;margin:0 0 8px;color:#0B2A4A}p{color:#667085;font-size:14px;line-height:1.6}
</style>
</head>
<body>
<div class="card">
  <h1>결제를 승인하고 있습니다</h1>
  <p>잠시만 기다려 주세요. 창을 닫지 마세요.</p>
</div>
<script>
(async function () {
  var tokenKey = "stargate:kcp:" + ${JSON.stringify(productId)};
  var checkoutToken = sessionStorage.getItem(tokenKey) || ${JSON.stringify(checkoutToken)};
  try {
    var response = await fetch("/api/kcp/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checkoutToken: checkoutToken,
        enc_data: ${JSON.stringify(encData)},
        enc_info: ${JSON.stringify(encInfo)},
        tran_cd: ${JSON.stringify(tranCd)}
      })
    });
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok || !data.success) {
      location.replace("/checkout.html?product=" + encodeURIComponent(${JSON.stringify(productId)}) + "&lang=" + encodeURIComponent(${JSON.stringify(lang)}) + "&payment=fail");
      return;
    }
    sessionStorage.removeItem(tokenKey);
    var q = new URLSearchParams({
      order: data.orderId || "",
      tno: data.tno || "",
      amount: String(data.amount || ""),
      product: ${JSON.stringify(productId)},
      lang: ${JSON.stringify(lang)}
    });
    location.replace("/success.html?" + q.toString());
  } catch (error) {
    location.replace("/checkout.html?product=" + encodeURIComponent(${JSON.stringify(productId)}) + "&lang=" + encodeURIComponent(${JSON.stringify(lang)}) + "&payment=fail");
  }
})();
</script>
</body>
</html>`;

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(html);
  } catch (error) {
    console.error("KCP return bridge failed", { message: error.message });
    res.statusCode = 302;
    res.setHeader("Location", "/checkout.html?payment=fail");
    res.end();
  }
};
