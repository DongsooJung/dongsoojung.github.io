import { defineConfig } from "@apps-in-toss/web-framework/config";

/*
 * appName은 콘솔에 등록된 영문 키 stargate-thinking-math 이다.
 * 이 값을 바꾸거나 미니앱을 새로 만들지 않는다. 다르면 번들 업로드가 거부된다.
 * npx ait init으로 이 파일이 덮이면 아래 appName만 다시 넣는다.
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
