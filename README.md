# ScanGo Frontend

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

Run the same command with `VITE_IS_MOCK=false` and a distinct
`SCANGO_E2E_BUILD_DIR` for live-selection mode. Both runs deliberately make the
unselected endpoint unreachable; live-selection only verifies routing to the
isolated test API.

## Limits

The tender screen is a local simulation. It has no card fields or live payment credentials. Shopper identity, session ownership, attendant/admin authorization, and idle timeout are absent; the interface is not suitable for deployment beyond loopback. Architecture is not exposed in the product UI or public static assets. The canonical architecture and threat boundary are in the [architecture document](docs/architecture.md) and [security notes](docs/architecture.md#8-security-privacy-and-egress).

## Vercel frontend configuration

Import this frontend's GitHub repository as its own Vercel project. Set **Root Directory** to the repository root (`./`), **Node.js Version** to **24.x**, and keep the checked-in [vercel.json](vercel.json). It selects Vite, dist output, and browser-route fallback with `npm ci` and `npm run build`. The SPA fallback excludes /api and /socket.io so missing backend routes do not return HTML.

Set `VITE_IS_MOCK=true` and `VITE_MOCK_API_BASE_URL` to an approved isolated HTTPS API **base including /api/v1**. For the other selector, set `VITE_IS_MOCK=false` and `VITE_REAL_API_BASE_URL`. The [environment template](.env.vercel.example) lists exact names; it is documentation, not an automatically loaded production configuration. Replace its reserved .invalid host. Changing mode or endpoints requires a new build/deployment. Both selectors still call an API; neither creates a browser-only backend or real provider integration.

Production Vite assets do not contain the development proxy; requests use the configured absolute API URL. A hosted API needs independently verified identity, persistence, exact origin/CORS and session/CSRF settings. Existing APIs remain local-only; localhost in a deployed bundle would point at the visitor or build machine.

The configuration adds noindex, frame/content-type/referrer/permission protections and no-store for the active UI model. Headers and noindex do not provide access control. Keep preview deployment protection enabled and use synthetic data. Hosted routing, cookies, headers, and user workflows have **not** been verified; no deployment is performed.

Known release gaps: Shopper session ownership and staff authorization are absent. Two Windows backend tests and critical server coverage fail in the baseline; receipt-only print CSS is absent. Separate IT fixes do not change this baseline.
