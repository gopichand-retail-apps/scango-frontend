import { spawnSync } from "node:child_process";

const isWindows = process.platform === "win32";
const frontendPort = process.env.SCANGO_E2E_FRONTEND_PORT ?? "5113";
const backendPort = process.env.SCANGO_E2E_BACKEND_PORT ?? "5114";
const apiBaseUrl = `http://127.0.0.1:${backendPort}/api/v1`;
const unavailableApiBaseUrl = "http://127.0.0.1:1/api/v1";
const frontendDist = process.env.SCANGO_E2E_BUILD_DIR?.trim() || "node_modules/.cache/scango-e2e";
const isMock = process.env.VITE_IS_MOCK ?? "true";
const environment = {
  ...process.env,
  SCANGO_E2E_FRONTEND_PORT: frontendPort,
  SCANGO_E2E_BACKEND_PORT: backendPort,
  SCANGO_E2E_BUILD_DIR: frontendDist,
  SCANGO_E2E_ISOLATED: process.env.SCANGO_E2E_ISOLATED ?? "true",
  VITE_IS_MOCK: isMock,
  VITE_MOCK_API_BASE_URL:
    process.env.VITE_MOCK_API_BASE_URL ?? (isMock === "true" ? apiBaseUrl : unavailableApiBaseUrl),
  VITE_REAL_API_BASE_URL:
    process.env.VITE_REAL_API_BASE_URL ?? (isMock === "false" ? apiBaseUrl : unavailableApiBaseUrl),
};

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: environment,
    stdio: "inherit",
    shell: isWindows,
  });
  if (result.error) {
    process.stderr.write(`${result.error.message}\n`);
    return 1;
  }
  return result.status ?? 1;
}

const packageManager = isWindows ? "npm.cmd" : "npm";
const packageRunner = isWindows ? "npx.cmd" : "npx";
const buildStatus = run(packageManager, ["run", "build", "--", "--outDir", frontendDist]);
process.exitCode =
  buildStatus === 0 ? run(packageRunner, ["playwright", "test", ...process.argv.slice(2)]) : buildStatus;
