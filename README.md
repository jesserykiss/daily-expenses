# Daily Expenses / 日常支出记录

A mobile-first, local-only expense tracker built with plain HTML, CSS, native ES Modules, Canvas, and Dexie.

## Run

The app must be served over HTTP. Browsers block external ES Modules and local JSON fetches from `file://`.

```powershell
npm.cmd run serve
```

Open `http://127.0.0.1:4173`.

No app build, bundler, runtime CDN, or package dependency is required. `package.json` only provides the local static server and Node test commands.

## Test

```powershell
npm.cmd test
```

The test suite covers amount parsing, local calendar ranges, expense validation, statistics aggregation, rule-based insights, import validation/deduplication, export filenames, and locale parity.

## Features

- Add, edit, and delete expenses with integer-cent storage.
- Filter by natural month and category with bounded 60-record pages.
- View monthly totals, category/payment summaries, 6/12-month trends, and rule-based insights.
- Render all charts with high-DPI Canvas and provide equivalent data tables.
- Switch between Simplified Chinese and English without reloading.
- Export strict versioned JSON and import it with validation, duplicate skipping, and transaction rollback.
- Request persistent browser storage and warn when only best-effort storage is available.

## Storage

All expense data lives in the browser's IndexedDB database named `daily-expenses`. Browser storage is not a permanent backup. The app requests persistent storage where supported, but users should export a JSON backup regularly. Clearing browser data or site data removes the local database.

Direct `file://` execution and PWA installation are intentionally unsupported in this delivery.

## Browser Support

Target browsers are iOS Safari 16+, current Android Chrome, and current desktop Chromium with static HTTP hosting.

The responsive layout and Canvas behavior have been validated in Chromium at 320, 390, 430, and 1280 CSS pixels, including DPR 1/2/3. A final smoke test on a physical iOS Safari 16 device is still required before production deployment because local file sharing/download behavior and browser storage eviction are controlled by iOS.

## Internationalization

Language files are flat JSON objects in `locales/`. Every key and placeholder must exist in both `zh-CN.json` and `en-US.json`. Run `npm.cmd test` after adding copy. Category and payment text keys are derived from the stored enum keys.

## Vendored Dependency

- Dexie 4.0.11: `vendor/dexie-4.0.11.mjs`
- License: Apache-2.0, see `vendor/DEXIE-LICENSE.txt` and `vendor/DEXIE-NOTICE.txt`

## Release Status

Version 1.0.0 includes the complete static expense tracker, bilingual UI, full CRUD, filtering/pagination, statistics and Canvas charts, insights, JSON import/export, storage-risk handling, and automated validation. No backend, account, cloud sync, income tracking, multi-currency, budget, reminder, service worker, or PWA capability is included.
