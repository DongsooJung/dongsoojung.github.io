const {
  getProduct,
  kcpRequest,
  normalizePem,
  parseJsonBody,
  requiredEnv,
  sendJson,
  verifyCheckout
} = require("../_lib/kcp");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    const body = parseJsonBody(req);
    const checkout = verifyCheckout(body.checkoutToken);
    const product = getProduct(checkout.productId);
    const encData = typeof body.enc_data === "string" ? body.enc_data : "";
    const encInfo = typeof body.enc_info === "string" ? body.enc_info : "";
    const tranCd = typeof body.tran_cd === "string" ? body.tran_cd : "";

    if (!product || !encData || !encInfo || !tranCd) {
      return sendJson(res, 400, { error: "Invalid payment approval request" });
    }
    if (product.priceKRW !== checkout.amount) {
      return sendJson(res, 409, { error: "Payment amount mismatch" });
    }

    const approved = await kcpRequest("payment", {
      site_cd: requiredEnv("KCP_SITE_CD"),
      kcp_cert_info: normalizePem(requiredEnv("KCP_CERT_INFO")),
      enc_data: encData,
      enc_info: encInfo,
      tran_cd: tranCd,
      ordr_idxx: checkout.orderId,
      ordr_mony: String(checkout.amount),
      pay_type: "PACA",
      ordr_no: checkout.orderId
    });

    if (String(approved.amount || "") !== String(checkout.amount)) {
      console.error("KCP amount mismatch", {
        orderId: checkout.orderId,
        expected: checkout.amount,
        actual: approved.amount
      });
      return sendJson(res, 409, { error: "Payment amount mismatch" });
    }

    return sendJson(res, 200, {
      success: true,
      orderId: checkout.orderId,
      tno: approved.tno,
      amount: approved.amount,
      cardName: approved.card_name || null,
      approvedAt: approved.app_time || null,
      subscription: Boolean(checkout.subscription)
    });
  } catch (error) {
    console.error("KCP approve failed", {
      message: error.message,
      statusCode: error.statusCode,
      providerCode: error.providerCode
    });
    return sendJson(res, error.statusCode || 500, {
      error: "결제 승인에 실패했습니다.",
      code: error.providerCode || "PAYMENT_APPROVE_FAILED"
    });
  }
};
