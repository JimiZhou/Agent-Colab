import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:8799", headless: true },
  webServer: {
    command:
      "ADMIN_TOKEN=browser-test-admin-secret-32-characters DATABASE_FILE=data/browser-test.sqlite PORT=8799 BASE_URL=http://127.0.0.1:8799 npm start",
    url: "http://127.0.0.1:8799/health",
    reuseExistingServer: false,
  },
  reporter: "list",
});
