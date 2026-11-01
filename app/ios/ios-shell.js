/* App Store 빌드의 WKWebView가 document start에 넣는 스크립트.
   Xcode의 WKUserScript injectionTime = .atDocumentStart, forMainFrameOnly = true.
   멤버십·인증서와 무관하게 웹 쪽에서 미리 고정한다. */
(function () {
  var root = document.documentElement;
  root.classList.add("stargate-ios-app");
  var style = document.createElement("style");
  style.textContent = [
    "html.stargate-ios-app a[href*='play.google.com']{display:none!important}",
    "html.stargate-ios-app .app-install-qr{display:none!important}",
    "html.stargate-ios-app #buy{display:none!important}"
  ].join("");
  root.appendChild(style);

  function softenMathDemo() {
    var file = document.getElementById("file");
    if (file) file.removeAttribute("capture");
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", softenMathDemo);
  } else {
    softenMathDemo();
  }
})();
