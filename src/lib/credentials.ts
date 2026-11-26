// Tokens live in module memory only: never in browser storage, URLs, React state or logs.
// A reload therefore starts a fresh checkout, which is the intended behaviour on a shared kiosk.
let sessionToken: string | null = null;
let staffToken: string | null = null;

export function setSessionToken(token: string | null): void {
  sessionToken = token;
}

export function getSessionToken(): string | null {
  return sessionToken;
}

export function setStaffToken(token: string | null): void {
  staffToken = token;
}

export function getStaffToken(): string | null {
  return staffToken;
}

export function clearCredentials(): void {
  sessionToken = null;
  staffToken = null;
}
