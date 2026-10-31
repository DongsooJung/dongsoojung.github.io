import { defineConfig } from "vite";

// 앱인토스는 SSR 불가, CSR/SSG만 허용 → 정적 빌드(dist)만 사용
export default defineConfig({
  base: "./",
  build: { outDir: "dist", target: "es2019" },
});
