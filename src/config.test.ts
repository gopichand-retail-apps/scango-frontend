import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadConfig() {
  vi.resetModules();
  return import("./config");
}

describe("API data-mode configuration", () => {
  it("defaults to mock mode and the explicit local loopback API", async () => {
    const config = await loadConfig();

    expect(config.isMock).toBe(true);
    expect(config.resolveApiBaseUrl()).toBe("http://127.0.0.1:5112/api/v1");
    expect(config.resolveApiBaseUrl(" http://localhost:5114/api/v1/ ")).toBe("http://localhost:5114/api/v1");
  });

  it("requires a dedicated mock endpoint for production mode", async () => {
    vi.stubEnv("VITE_IS_MOCK", "true");
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_MOCK_API_BASE_URL", "");
    const config = await loadConfig();

    expect(() => config.resolveApiBaseUrl()).toThrow("VITE_MOCK_API_BASE_URL is required in production");
  });

  it("requires explicit live endpoint configuration without falling back", async () => {
    vi.stubEnv("VITE_IS_MOCK", "false");
    vi.stubEnv("VITE_REAL_API_BASE_URL", "");
    const config = await loadConfig();

    expect(config.isMock).toBe(false);
    expect(() => config.resolveApiBaseUrl("http://127.0.0.1:5112/api/v1")).toThrow(
      "VITE_REAL_API_BASE_URL is required when VITE_IS_MOCK=false.",
    );
  });

  it("rejects invalid modes and non-HTTP endpoint values", async () => {
    vi.stubEnv("VITE_IS_MOCK", "sometimes");
    await expect(loadConfig()).rejects.toThrow('VITE_IS_MOCK must be "true" or "false".');

    vi.stubEnv("VITE_IS_MOCK", "true");
    const config = await loadConfig();
    expect(() => config.resolveApiBaseUrl("not-an-url")).toThrow("absolute HTTP(S) URL");
    expect(() => config.resolveApiBaseUrl("ftp://example.invalid/api")).toThrow("must use HTTP or HTTPS");
  });
});
