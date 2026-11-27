# ScanGo Frontend

![CI](https://github.com/gopichand-retail-apps/scango-frontend/actions/workflows/ci.yml/badge.svg)
**Live demo:** https://scango-frontend.vercel.app/

[Architecture guide](docs/architecture.md) — source map, workflows, contracts, data, security, and checks.

## Repository layout and Windows workflow

This is the ScanGo React/Vite frontend repository. It keeps its own Git history, origin, package manifest, and lockfile; the API is the independent [scango-backend](https://github.com/gopichand-retail-apps/scango-backend) repository. Place the pair under one ScanGo folder to use the supplied single-folder VS Code workspace.

Use Node **24.15.0** and npm with the committed lockfile. From this repository in PowerShell:

```powershell
npm.cmd ci
npm.cmd run dev
```

The client is at http://127.0.0.1:5111; start the API separately. For both services in the complete Retail Apps workspace, use `./scripts/Start-Apps.ps1 -App ScanGo` from the workspace root. Use `-EnvironmentName IT` only for the independent IT copies.

See the [app overview](docs/architecture.md#1-scope-users-and-repository-boundary) and [canonical architecture](docs/architecture.md). The architecture guide is included in this repository. No cross-app backend integration is added by this organization change.

The React + TypeScript kiosk UI owns presentation, barcode/search input, accessible touch/keyboard controls, theme preference, and checkout feedback. All prices, coupon decisions, totals, state transitions, and persistence come from the API.

## Run

Use Node.js 22.13 or newer. Start the API using the [backend README](https://github.com/gopichand-retail-apps/scango-backend/blob/main/README.md), then run:

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5111`. User-facing copy, synthetic product data, scanner/scale limits, coupon offers, and simulator settings are runtime-validated from `public/scango-model.json` using the strict `version/appId/locale/messages/data` contract. API endpoints are configured separately through Vite environment variables. The theme preference is the only browser-persisted preference.

## Checks

```sh
npm run format:check
npm run lint
npm run build
npm run test:coverage
npm run test:e2e
npm audit
```

The unit suite enforces at least 90% statements, branches, functions, and lines.
The browser suite builds to ignored `node_modules/.cache/scango-e2e` by default
and uses an in-memory API database. It covers the checkout flows, idempotent
replay, model replacement and document metadata, architecture absence, safe API
error mapping, endpoint selection, recovery, local theme persistence, product
image loading, and mobile width.

To keep E2E isolated when the default ports are occupied, choose two unused ports and run:

```sh
SCANGO_E2E_FRONTEND_PORT=5113 \
SCANGO_E2E_BACKEND_PORT=5114 \
SCANGO_E2E_BUILD_DIR=/tmp/scango-e2e-mock \
VITE_IS_MOCK=true npm run test:e2e
```

`VITE_SCANGO_KIOSK_ID` (build time, default `kiosk-01`) names the kiosk; it must be registered in the backend's synthetic fixture. It is a public label, not a secret.

Run the same command with `VITE_IS_MOCK=false` and a distinct
`SCANGO_E2E_BUILD_DIR` for live-selection mode. Both runs deliberately make the
unselected endpoint unreachable; live-selection only verifies routing to the
isolated test API.

## Limits

The tender screen is a local simulation. It has no card fields or live payment credentials. Each checkout belongs to the kiosk that started it: the API returns a bearer token once, the client keeps it in module memory only (never in browser storage, URLs or the page) and sends it with `X-Kiosk-Id`. A reload therefore starts a fresh checkout. After 150 idle seconds an alert dialog offers more time; at 180 seconds the visible checkout clears and the server keeps the audited outcome. When the scale reading does not match, the kiosk shows "An attendant is on the way" with no approve controls and checks for the decision every 3 seconds. Attendants use `/staff` (not linked from the kiosk): they sign in with a synthetic staff code and PIN, see only their store's exceptions, choose a reason, and approve or remove the item; if another attendant got there first, the console says so and refreshes. The staff token is held in memory like the shopper token.

The receipt screen prints receipt-only (SCN-04, [src/styles/receipt-print.css](src/styles/receipt-print.css)): the header, alerts, panels and buttons are hidden and both themes print black on white, showing only the receipt number, lines, totals and tender status. Cancelling the print dialog leaves the receipt on screen. **Start new checkout** resets the session server-side (the token stops working, so the next shopper cannot reopen the receipt) and returns to the welcome screen with focus on **Start checkout**. Physical printer output has not been tested.

Every write follows the stable intent key pattern (SCN-03): the `Idempotency-Key` is created when the shopper or attendant confirms an action, reused for every retry of that action, replaced when its payload changes, and discarded after a confirmed result, a definite refusal, reset, expiry or sign-out. Each HTTP attempt sends its own `X-Request-ID`. If the reply is lost (network error, timeout or 5xx), the kiosk shows "Waiting for confirmation" with a focused **Check again** button and locks other writes; checking again replays the stored result, so a lost scan adds exactly one unit and a lost tender reply never shows a receipt until the server confirms the payment. Keys live in memory only. There is no shopper identity, hardware attestation or administrator role; the interface is not suitable for deployment beyond loopback. Architecture is not exposed in the product UI or public static assets. The canonical architecture and threat boundary are in the [architecture document](docs/architecture.md) and [security notes](docs/architecture.md#8-security-privacy-and-egress).

## Vercel frontend configuration

Import this frontend's GitHub repository as its own Vercel project. Set **Root Directory** to the repository root (`./`), **Node.js Version** to **24.x**, and keep the checked-in [vercel.json](vercel.json). It selects Vite, dist output, and browser-route fallback with `npm ci` and `npm run build`. The SPA fallback excludes /api and /socket.io so missing backend routes do not return HTML.

Set `VITE_IS_MOCK=true` and `VITE_MOCK_API_BASE_URL` to an approved isolated HTTPS API **base including /api/v1**. For the other selector, set `VITE_IS_MOCK=false` and `VITE_REAL_API_BASE_URL`. The [environment template](.env.vercel.example) lists exact names; it is documentation, not an automatically loaded production configuration. Replace its reserved .invalid host. Changing mode or endpoints requires a new build/deployment. Both selectors still call an API; neither creates a browser-only backend or real provider integration.

Production Vite assets do not contain the development proxy; requests use the configured absolute API URL. A hosted API needs independently verified identity, persistence, exact origin/CORS and session/CSRF settings. Existing APIs remain local-only; localhost in a deployed bundle would point at the visitor or build machine.

The configuration adds noindex, frame/content-type/referrer/permission protections and no-store for the active UI model. Headers and noindex do not provide access control. Keep preview deployment protection enabled and use synthetic data. Hosted routing, cookies, headers, and user workflows have **not** been verified; no deployment is performed.

Known release gaps: Shopper sessions are bound to this kiosk by an in-memory bearer token with an idle warning and expiry (SCN-01). Only an attendant signed in at the same store can clear an exception, from the separate `/staff` console (SCN-02); attendant identities are synthetic fixture profiles with PINs. Receipt printing is receipt-only (SCN-04). Two Windows backend tests and critical server coverage fail in the baseline. Separate IT fixes do not change this baseline.
