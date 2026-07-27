const {
  createKcpSignData,
  createOrderId,
  getProduct,
  getSiteOrigin,
  hasKcpCredentials,
  isSubscription,
  kcpRequest,
  normalizePem,
  parseJsonBody,
  requiredEnv,
  sendJson,
  signCheckout
} = require("../_lib/kcp");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    if (!hasKcpCredentials()) {
      return sendJson(res, 503, {
        error:
          "KCP 운영/테스트 자격증명이 아직 등록되지 않았습니다. Vercel 환경변수(KCP_SITE_CD, KCP_CERT_INFO, KCP_PRIVATE_KEY, CHECKOUT_SIGNING_SECRET)를 설정한 뒤 다시 시도해 주세요.",
        code: "KCP_CREDENTIALS_MISSING",
        configured: false
      });
    }

    const body = parseJsonBody(req);
    const productId = typeof body.productId === "string" ? body.productId : "";
    const lang = body.lang === "en" ? "en" : "ko";
    const product = getProduct(productId);
    if (!product) return sendJson(res, 400, { error: "Unknown product" });

    const siteCd = requiredEnv("KCP_SITE_CD");
    const orderId = createOrderId(productId);
    const payMethod = "CARD";
    const ua = String(req.headers["user-agent"] || "");
    const regType = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ? "mobile" : "web";
    const goodMny = String(product.priceKRW);
    const origin = getSiteOrigin(req);

    const checkoutToken = signCheckout({
      orderId,
      productId,
      amount: product.priceKRW,
      payMethod,
      regType,
      subscription: isSubscription(product.billing),
      lang,
      exp: Date.now() + 15 * 60 * 1000
    });

    const retUrl = `${origin}/api/kcp/return?checkoutToken=${encodeURIComponent(checkoutToken)}`;
    const failUrl = `${origin}/checkout.html?product=${encodeURIComponent(productId)}&lang=${lang}&payment=fail`;

    const registerPayload = {
      site_cd: siteCd,
      kcp_cert_info: normalizePem(requiredEnv("KCP_CERT_INFO")),
      kcp_sign_data: createKcpSignData({
        siteCd,
        goodMny,
        payMethod,
        regType,
        orderId
      }),
      ordr_idxx: orderId,
      pay_method: payMethod,
      good_mny: goodMny,
      good_name: product.name.slice(0, 100),
      reg_type: regType,
      ret_URL: retUrl,
      fail_url: failUrl
    };

    const registered = await kcpRequest("register", registerPayload);
    const payUrl = registered.pay_url || registered.PayUrl;
    if (!payUrl) {
      return sendJson(res, 502, {
        error: "KCP 거래등록 응답에 결제창 URL이 없습니다.",
        code: "KCP_PAY_URL_MISSING"
      });
    }

    return sendJson(res, 200, {
      configured: true,
      payUrl,
      orderId,
      checkoutToken,
      form: { ordr_idxx: orderId, param_opt_1: checkoutToken }
    });
  } catch (error) {
    console.error("KCP ready failed", {
      message: error.message,
      statusCode: error.statusCode,
      providerCode: error.providerCode
    });
    return sendJson(res, error.statusCode || 500, {
      error: "결제 준비에 실패했습니다.",
      code: error.providerCode || "PAYMENT_READY_FAILED"
    });
  }
};
