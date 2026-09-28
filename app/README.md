# EGE Field

Airfield daily report app for Eau Gallie Electric. Runs on an iPad as an installable web app. Spec lives in `../docs/SPEC.md`.

## Run it

```
npm install
npm run dev        # local dev server
npm run build      # production build into dist/
npm run preview    # serve the build
npm run walk       # headless iPad walkthrough of the foreman side (preview running, BASE_URL and TEST_PHOTO env)
npm run walk:admin # headless walkthrough of job setup from a PDF (BASE_URL and TEST_PDF env)
npm run fake-supabase 4600   # a stand in server for the sync contract
npm run walk:sync  # two tablets syncing through it (BASE_URL, SYNC_URL, TEST_PHOTO env)
npm run gen        # regenerate the placeholder airfield sheets and part list
```

## Where things are

- `src/types.ts` data model
- `src/db.ts` on device database (Dexie over IndexedDB)
- `src/lib/status.ts` the five step ladder, step meanings per part type, the one write path for status
- `src/seed.ts` loads the placeholder airfield on first run
- `src/screens/` Start, MapScreen (airfield), ZoneScreen (sheet, pins, list, bulk), PartCard, ReportScreen (the six Autodesk sections)
- `src/screens/admin/` job setup: jobs, plan sheets (PDF rendered on device), zones, pay items, pins, publish
- `src/lib/sync.ts` push dirty rows, pull by server time, merge. `src/components/SyncPanel.tsx` the pill and the connect sheet
- `src/lib/billing.ts` charges off the event log, rollup preview, lock, CSV. `src/screens/BillingScreen.tsx` the office view
- `src/lib/pdf.ts` pdf.js page rendering, `src/lib/jobio.ts` job export and import as one file
- `src/lib/report.ts` and `src/lib/reportText.ts` turn the day's taps, flags, crew and photos into the six sections
- `src/components/Signature.tsx` finger signature, `src/components/Photos.tsx` camera button and thumbnails
- `src/ege/fonts.css` and `public/fonts/` self hosted Oswald, Roboto, IBM Plex Mono
- `src/components/PanZoom.tsx` pinch, drag, double tap viewer
- `src/ege/` the Eau Gallie UI kit stylesheet. The kit's script is served from `public/ege-ui.js`
- `scripts/gen-placeholder.mjs` draws the placeholder sheets and writes the matching parts
- `public/placeholder/` the generated sheets
- `public/logo.png` the Eau Gallie Electric logo, also used for the home screen icons

## Build steps (from the spec)

1. Placeholder airfield, zones, pins, five step taps, flags, list, bulk. Done.
2. Daily report in the six Autodesk sections, photos, review and submit. Done.
3. Admin setup: PDF upload, sheet naming, zone drawing, pin placement, pay items. Done.
4. Offline sync through Supabase, two tablets. Done. See `../supabase/README.md` to stand it up.
5. Billing rollup and billed lock. Done.
6. Copy for Autodesk. Done, it's on the report screen. No API push, decided against it.
