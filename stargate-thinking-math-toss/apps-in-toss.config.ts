import { defineConfig } from "@apps-in-toss/web-framework/config";

/*
 * appName은 앱인토스 콘솔에 등록한 앱 이름(영문 키)과 반드시 같아야 함.
 * 콘솔 등록 후 실제 값으로 바꿀 것. 다르면 번들 업로드가 거부됨.
 * 이 파일은 `npx ait init`이 만드는 파일과 같은 형식이며,
 * init을 다시 돌려 덮어써졌다면 아래 값만 다시 넣으면 됨.
 */
export default defineConfig({
  appName: "stargate-thinking-math",
  brand: {
    primaryColor: "#3446B8",
  },
  navigationBar: {
    withBackButton: true,
    withHomeButton: false,
    withTitle: true,
    theme: "light",
  },
  webView: {
    bounces: false,
    pullToRefreshEnabled: false,
    allowsBackForwardNavigationGestures: false,
  },
  permissions: [],
  webBundleDir: "dist",
});
