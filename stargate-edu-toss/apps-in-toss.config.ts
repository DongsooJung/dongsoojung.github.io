import { defineConfig } from "@apps-in-toss/web-framework/config";

export default defineConfig({
  appName: "stargate-edu",
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
