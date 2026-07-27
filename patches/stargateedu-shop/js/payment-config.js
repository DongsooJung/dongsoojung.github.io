/**
 * Public payment configuration for the static storefront.
 * Secrets never belong in this repository — configure them in Vercel env vars.
 */
window.STARGATE_PAYMENT = Object.freeze({
  provider: "NHN KCP",
  supportEmail: "ceo@stargateedu.co.kr",
  apiBase: "",
  successUrl: "https://shop.stargateedu.co.kr/success.html",
  cancelUrl: "https://shop.stargateedu.co.kr/cancel.html"
});
