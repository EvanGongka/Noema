import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:13100",
    locale: "zh-CN",
    colorScheme: "light",
    channel: "chrome",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command:
      "bash scripts/run-next-isolated.sh .next-e2e pnpm build && NEXT_DIST_DIR=.next-e2e pnpm start --port 13100",
    url: "http://127.0.0.1:13100",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
