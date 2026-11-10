# ScanGo Frontend

The React + TypeScript kiosk UI owns presentation, barcode/search input, accessible touch/keyboard controls, theme preference, and checkout feedback. All prices, coupon decisions, totals, state transitions, and persistence come from the API.

## Run

Use Node.js 22.13 or newer. Start the API using the [backend README](../scango-backend/README.md), then run:

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

The tender screen is a local simulation. It has no card fields or live payment credentials. Shopper identity, session ownership, attendant/admin authorization, and idle timeout are absent; the interface is not suitable for deployment beyond loopback. Architecture is not exposed in the product UI or public static assets. The canonical architecture and threat boundary are in the [architecture document](../docs/architecture.md) and [security notes](../docs/security/README.md).
