(function () {
  "use strict";

  var params = new URLSearchParams(location.search);
  var lang = params.get("lang") === "en" ? "en" : "ko";
  var productId = params.get("product") || "";
  var paymentState = params.get("payment") || "";
  var catalog = window.STARGATE_CATALOG || {};
  var product = catalog[productId];
  var config = window.STARGATE_PAYMENT || {};
  var business = window.STARGATE_BUSINESS || {};
  var apiBase = String(config.apiBase || "").replace(/\/$/, "");
  var tokenKey = "stargate:kcp:" + productId;

  var copy = {
    ko: {
      title: "결제 준비",
      lead: "상품·금액·약관 동의를 확인한 뒤 NHN KCP 결제창으로 이동합니다.",
      summary: "선택 상품",
      type: "상품 유형",
      delivery: "제공 방식",
      period: "수강·이용 기간",
      billing: "결제 주기",
      total: "총 결제금액",
      pay: "KCP로 결제하기",
      processing: "KCP 결제창을 준비하고 있습니다…",
      fail: "결제 인증에 실패했거나 취소되었습니다. 다시 시도해 주세요.",
      missingCreds:
        "심사·운영용 KCP 자격증명이 서버에 아직 등록되지 않았습니다. 환경변수 설정 전에도 약관 동의와 주문 문의는 가능합니다.",
      genericError: "결제를 처리하지 못했습니다. 잠시 후 다시 시도하거나 고객센터로 문의해 주세요.",
      support: "결제·주문 문의",
      back: "← 쇼핑 계속하기",
      secure: "카드 정보는 NHN KCP가 직접 처리하며 이 사이트에는 저장되지 않습니다.",
      note: "결제 전 반드시 약관·개인정보·환불규정을 확인해 주세요. 실물 교재는 배송비·배송 가능 지역을 별도로 안내합니다.",
      productError: "선택한 상품을 찾을 수 없습니다.",
      agreeTerms: '이용약관에 동의합니다. (<a href="/terms.html" target="_blank" rel="noopener">전문 보기</a>)',
      agreePrivacy: '개인정보처리방침에 동의합니다. (<a href="/privacy.html" target="_blank" rel="noopener">전문 보기</a>)',
      agreeRefund: '환불규정에 동의합니다. (<a href="https://stargateedu.co.kr/refund/" target="_blank" rel="noopener">전문 보기</a>)',
      agreeSubscription: "정기결제(자동결제) 고지에 동의합니다. 매 결제 주기마다 동일 금액이 자동 청구되며, 해지 전까지 갱신됩니다.",
      subscriptionNote:
        "본 상품은 정기결제(구독) 상품입니다. 첫 결제 후 선택한 주기(월/년)마다 자동 청구되며, 해지는 다음 결제일 전까지 이메일(ceo@stargateedu.co.kr) 또는 고객센터로 요청할 수 있습니다. 연 구독 중도 해지 시 연 구독가 기준 월할 정산 후 잔액을 환불합니다.",
      types: { course: "온라인 강의", subscription: "구독", book: "교재", live: "라이브 과정", consulting: "컨설팅" },
      deliveries: {
        digital: "디지털 제공",
        physical: "실물 배송",
        live: "실시간 온라인",
        in_person: "오프라인",
        appointment: "예약제"
      },
      billings: { one_time: "1회 결제", monthly: "매월 자동결제", annual: "매년 자동결제" }
    },
    en: {
      title: "Payment preparation",
      lead: "Confirm the product, amount, and required consents before opening the NHN KCP checkout.",
      summary: "Selected product",
      type: "Product type",
      delivery: "Delivery",
      period: "Access period",
      billing: "Billing",
      total: "Total",
      pay: "Pay with KCP",
      processing: "Preparing the KCP checkout…",
      fail: "Payment authentication failed or was canceled. Please try again.",
      missingCreds:
        "KCP credentials are not configured on the server yet. You can still review consents and contact support to place an order.",
      genericError: "We could not process the payment. Please try again later or contact support.",
      support: "Payment & order support",
      back: "← Continue shopping",
      secure: "NHN KCP processes card details directly. This site never stores them.",
      note: "Please review the Terms, Privacy Policy, and Refund Policy before paying.",
      productError: "The selected product could not be found.",
      agreeTerms: 'I agree to the Terms. (<a href="/terms.html" target="_blank" rel="noopener">View</a>)',
      agreePrivacy: 'I agree to the Privacy Policy. (<a href="/privacy.html" target="_blank" rel="noopener">View</a>)',
      agreeRefund: 'I agree to the Refund Policy. (<a href="https://stargateedu.co.kr/refund/" target="_blank" rel="noopener">View</a>)',
      agreeSubscription:
        "I agree to recurring billing. The same amount will be charged each billing cycle until cancellation.",
      subscriptionNote:
        "This is a subscription product. After the first payment, billing renews automatically each month/year until you cancel via email (ceo@stargateedu.co.kr). Annual plans are refunded on a pro-rata monthly basis against the annual price.",
      types: { course: "Online course", subscription: "Subscription", book: "Book", live: "Live program", consulting: "Consulting" },
      deliveries: {
        digital: "Digital access",
        physical: "Physical shipping",
        live: "Live online",
        in_person: "In person",
        appointment: "By appointment"
      },
      billings: { one_time: "One-time", monthly: "Monthly auto-pay", annual: "Annual auto-pay" }
    }
  }[lang];

  document.documentElement.lang = lang;
  document.title = copy.title + " · Stargate Edu";
  document.getElementById("title").textContent = copy.title;
  document.getElementById("lead").textContent = copy.lead;
  document.getElementById("summaryLabel").textContent = copy.summary;
  document.getElementById("typeLabel").textContent = copy.type;
  document.getElementById("deliveryLabel").textContent = copy.delivery;
  document.getElementById("periodLabel").textContent = copy.period;
  document.getElementById("billingLabel").textContent = copy.billing;
  document.getElementById("totalLabel").textContent = copy.total;
  document.getElementById("payButton").textContent = copy.pay;
  document.getElementById("supportLink").textContent = copy.support;
  document.getElementById("backLink").textContent = copy.back;
  document.getElementById("secureText").textContent = copy.secure;
  document.getElementById("note").textContent = copy.note;
  document.getElementById("agreeTermsText").innerHTML = copy.agreeTerms;
  document.getElementById("agreePrivacyText").innerHTML = copy.agreePrivacy;
  document.getElementById("agreeRefundText").innerHTML = copy.agreeRefund;
  document.getElementById("agreeSubscriptionText").textContent = copy.agreeSubscription;
  document.getElementById("subscriptionNote").textContent = copy.subscriptionNote;
  document.getElementById("bizInfo").textContent = business.footerLine || "";
  document.getElementById("homeLink").href = lang === "en" ? "./en/" : "./";
  document.getElementById("backLink").href = lang === "en" ? "./en/" : "./";
  document.getElementById("supportLink").href =
    "mailto:" +
    (business.email || config.supportEmail || "ceo@stargateedu.co.kr") +
    "?subject=" +
    encodeURIComponent((lang === "en" ? "Order inquiry: " : "상품 주문 문의: ") + (product && product.name ? product.name[lang] || product.name.ko : productId));

  var pageError = document.getElementById("pageError");
  var checkoutView = document.getElementById("checkoutView");
  if (!product) {
    checkoutView.style.display = "none";
    pageError.style.display = "block";
    pageError.textContent = copy.productError;
    return;
  }

  var isSubscription = product.billing === "monthly" || product.billing === "annual";
  document.getElementById("productName").textContent = product.name[lang] || product.name.ko;
  document.getElementById("productType").textContent = copy.types[product.type] || product.type;
  document.getElementById("delivery").textContent = copy.deliveries[product.delivery] || product.delivery;
  document.getElementById("period").textContent =
    (product.accessPeriod && (product.accessPeriod[lang] || product.accessPeriod.ko)) ||
    (lang === "en" ? "See product details" : "상품 상세 안내 기준");
  document.getElementById("billing").textContent = copy.billings[product.billing] || product.billing;
  document.getElementById("price").textContent = new Intl.NumberFormat(lang === "en" ? "en-US" : "ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0
  }).format(product.priceKRW);

  if (isSubscription) {
    document.getElementById("subscriptionNote").classList.add("show");
    document.getElementById("agreeSubWrap").hidden = false;
  }

  var statusEl = document.getElementById("status");
  var payButton = document.getElementById("payButton");
  var checks = [
    document.getElementById("agreeTerms"),
    document.getElementById("agreePrivacy"),
    document.getElementById("agreeRefund")
  ];
  if (isSubscription) checks.push(document.getElementById("agreeSubscription"));

  function syncPayEnabled() {
    payButton.disabled = !checks.every(function (el) {
      return el.checked;
    });
  }
  checks.forEach(function (el) {
    el.addEventListener("change", syncPayEnabled);
  });
  syncPayEnabled();

  function showStatus(type, message) {
    statusEl.className = "status show " + type;
    statusEl.textContent = message;
  }

  if (paymentState === "fail" || paymentState === "cancel") {
    showStatus("error", copy.fail);
  }

  payButton.addEventListener("click", async function () {
    if (payButton.disabled) return;
    payButton.disabled = true;
    showStatus("wait", copy.processing);
    try {
      var response = await fetch(apiBase + "/api/kcp/ready", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: productId, lang: lang })
      });
      var data = await response.json().catch(function () {
        return {};
      });
      if (response.status === 503 && data.code === "KCP_CREDENTIALS_MISSING") {
        showStatus("info", copy.missingCreds);
        payButton.disabled = false;
        return;
      }
      if (!response.ok || !data.payUrl || !data.checkoutToken) {
        showStatus("error", data.error || copy.genericError);
        payButton.disabled = false;
        return;
      }
      sessionStorage.setItem(tokenKey, data.checkoutToken);
      var form = document.getElementById("kcpForm");
      form.action = data.payUrl;
      form.innerHTML = "";
      var fields = Object.assign({}, data.form || {}, {
        ordr_idxx: data.orderId,
        param_opt_1: data.checkoutToken
      });
      Object.keys(fields).forEach(function (key) {
        var input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = fields[key];
        form.appendChild(input);
      });
      form.submit();
    } catch (error) {
      showStatus("error", copy.genericError);
      payButton.disabled = false;
    }
  });
})();
