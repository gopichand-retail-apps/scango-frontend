import { defineConfig, devices } from "@playwright/test";

const isContinuousIntegration = Boolean(process.env.CI);
const frontendPort = getPort("SCANGO_E2E_FRONTEND_PORT", 5111);
const backendPort = getPort("SCANGO_E2E_BACKEND_PORT", 5112);
const frontendUrl = `http://127.0.0.1:${frontendPort}`;
const backendHealthUrl = `http://127.0.0.1:${backendPort}/api/v1/health`;
const frontendDist = process.env.SCANGO_E2E_BUILD_DIR?.trim() || "node_modules/.cache/scango-e2e";
const reuseExistingServer = !isContinuousIntegration && process.env.SCANGO_E2E_ISOLATED !== "true";

if (frontendPort === backendPort) {
  throw new Error("The ScanGo frontend and backend must use different E2E ports.");
}

function getPort(name: string, defaultPort: number): number {
  const port = Number(process.env[name] ?? defaultPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be a valid TCP port.`);
  }
  return port;
}

export default defineConfig({
  testDir: "./e2e",
  timeout: 10_000,
  fullyParallel: false,
  forbidOnly: isContinuousIntegration,
  retries: isContinuousIntegration ? 1 : 0,
  workers: 1,
  reporter: "list",
  expect: { timeout: 3_000 },
  use: {
    baseURL: frontendUrl,
    actionTimeout: 3_000,
    navigationTimeout: 5_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm start",
      cwd: "../scango-backend",
      url: backendHealthUrl,
      reuseExistingServer,
      timeout: 20_000,
      env: {
        PORT: String(backendPort),
        SCANGO_DB_PATH: ":memory:",
        SCANGO_E2E_FRONTEND_ORIGIN: frontendUrl,
      },
    },
    {
      command: `npm run preview -- --outDir ${JSON.stringify(frontendDist)} --port ${frontendPort} --strictPort`,
      url: frontendUrl,
      reuseExistingServer,
      timeout: 20_000,
    },
  ],
});
