# EGE Field

Airfield daily report app for Eau Gallie Electric. Runs on an iPad as an installable web app. Spec lives in `../docs/SPEC.md`.

## Run it

```
npm install
npm run dev        # local dev server
npm run build      # production build into dist/
npm run preview    # serve the build
npm run walk       # headless iPad walkthrough, screenshots to /tmp/shots (needs preview running on 4173)
npm run gen        # regenerate the placeholder airfield sheets and part list
```

## Where things are

- `src/types.ts` data model
- `src/db.ts` on device database (Dexie over IndexedDB)
- `src/lib/status.ts` the five step ladder, step meanings per part type, the one write path for status
- `src/seed.ts` loads the placeholder airfield on first run
- `src/screens/` Start, MapScreen (airfield), ZoneScreen (sheet, pins, list, bulk), PartCard, ReportStub
- `src/components/PanZoom.tsx` pinch, drag, double tap viewer
- `src/ege/` the Eau Gallie UI kit stylesheet. The kit's script is served from `public/ege-ui.js`
- `scripts/gen-placeholder.mjs` draws the placeholder sheets and writes the matching parts
- `public/placeholder/` the generated sheets
- `public/logo.png` the Eau Gallie Electric logo, also used for the home screen icons

## Build steps (from the spec)

1. Placeholder airfield, zones, pins, five step taps, flags, list, bulk. Done.
2. Daily report in the six Autodesk sections, photos, review and submit.
3. Admin setup: PDF upload, sheet naming, zone drawing, pin placement, pay items.
4. Offline sync through a backend, two tablets.
5. Billing rollup and billed lock.
6. Copy for Autodesk.
7. Autodesk API push.
