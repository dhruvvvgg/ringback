import { defineConfig } from "@playwright/test";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
process.env.PLAYWRIGHT_BROWSERS_PATH ||= "/workspace/.cache/ms-playwright";
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  timeout: 60000,
  reporter: [["list"], ["json", { outputFile: "artifacts/e2e/results.json" }]],
  use: {
    baseURL: "http://localhost:3100",
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
    video: "on",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm start",
    url: "http://localhost:3100/healthz",
    reuseExistingServer: false,
    env: { PORT: "3100", TEMPORAL_ADDRESS: "localhost:7233", TEMPORAL_TASK_QUEUE: `e2e-${process.pid}`, LOCAL_DB_PATH: `.data/e2e-${process.pid}.sqlite`, EMBEDDING_PROVIDER: "keyword" },
    timeout: 60000,
  },
});
