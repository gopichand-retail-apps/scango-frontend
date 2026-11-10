const defaultIsMock = true;
const defaultLocalMockApiBaseUrl = "http://127.0.0.1:5112/api/v1";
const modeOverride = import.meta.env.VITE_IS_MOCK;

if (modeOverride !== undefined && modeOverride !== "true" && modeOverride !== "false") {
  throw new Error('VITE_IS_MOCK must be "true" or "false".');
}

export const isMock = modeOverride === undefined ? defaultIsMock : modeOverride === "true";

export function resolveApiBaseUrl(devMockApiBaseUrl?: string): string {
  const localMockApiBaseUrl = import.meta.env.DEV ? devMockApiBaseUrl?.trim() || defaultLocalMockApiBaseUrl : undefined;
  const selectedBaseUrl = isMock
    ? import.meta.env.VITE_MOCK_API_BASE_URL?.trim() || localMockApiBaseUrl
    : import.meta.env.VITE_REAL_API_BASE_URL?.trim();
  if (!selectedBaseUrl) {
    throw new Error(
      isMock
        ? import.meta.env.DEV
          ? "A local mock API base URL is required when VITE_IS_MOCK=true."
          : "VITE_MOCK_API_BASE_URL is required in production when VITE_IS_MOCK=true."
        : "VITE_REAL_API_BASE_URL is required when VITE_IS_MOCK=false.",
    );
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(selectedBaseUrl);
  } catch {
    throw new Error("The selected API base URL must be an absolute HTTP(S) URL.");
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("The selected API base URL must use HTTP or HTTPS.");
  }
  return parsedUrl.toString().replace(/\/+$/, "");
}
