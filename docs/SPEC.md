# Airfield Daily Report App. Spec v0.1

Eau Gallie Electric. Internal working spec. Built from the interview on 2026-09-28.

## BOSS brief

- B: Eau Gallie Electric. Foreman on a tablet on the airfield, office billing off what he taps. Eau Gallie is job one, every airfield after it reuses the same app.
- O: End of day the foreman has tapped every part he touched, the report is in Autodesk Forms, and the office can pull a unit price rollup for the pay app without asking anybody anything.
- S: Manny's industrial UI system, bolt glyph badge. Blunt internal copy. No em or en dashes, no semicolons.
- S: Offline all day. Two foremen at once. Works with gloves. No login. Placeholder airfield until the real plans land. Never double bills a part.

## What we decided

| Question | Answer |
|---|---|
| How the customer gets billed | Unit price per part installed. Count times contract unit price. |
| Parts the foreman taps | Fixtures and signs, base cans and transformers, conduit and duct bank and cable runs, vaults and handholes and regulators and equipment. |
| Where the part list comes from | Plan sheets and the bid takeoff spreadsheet, cross referenced so they stay honest with each other. |
| Status ladder | Not started, Rough in, Set, Wired, Complete. Complete is the billable trigger. |
| Zone view | Both. Pins on the plan sheet for point items, list for linear runs. Foreman flips between them. |
| Report fields | Crew, hours, equipment. Photos per part or per zone. Weather, delays, safety, visitors. |
| Where the report goes | Autodesk Build Forms. Manny can get admin, so a real API push is on the table. |
| New job setup | Admin uploads the plan PDF, draws zone boxes on the overview sheet, links each zone to its detail sheet, drops pins by hand from the takeoff. |
| Site conditions | Bad or no signal on the field. More than one foreman at a time. |
| Drawings | None yet. Build against a placeholder airfield and swap the real set in later. |
| Hosting | Installable web app, free tier backend for sync and photos. |
| Login | None. Tablet is trusted. Foreman picks his name at the start of the day. |
| Report shape | One report per job per day. Zones are sections. Both foremen land on the same report. |

## The status ladder, spelled out

Same five steps for every part type. What each step means changes by type so the foreman isn't guessing.

| Step | Fixture or sign | Base can or transformer | Conduit, duct, cable (linear) | Vault, handhole, regulator |
|---|---|---|---|---|
| Not started | Nothing done | Nothing done | Nothing done | Nothing done |
| Rough in | Core drilled or trenched to the spot | Excavated | Trenched or bored, footage entered | Excavated |
| Set | Base in, backfilled | Can set, plumb, backfilled | Conduit or duct in, footage entered | Structure set |
| Wired | Cable landed, transformer connected | Transformer in, secondary landed | Cable pulled, footage entered | Cable landed, gear mounted |
| Complete | Fixture on, aimed, tested | Lid on, tested | Terminated, tested, footage entered | Energized, tested |

Linear parts carry a total quantity (LF) and the foreman enters footage done at each step. Billing reads the Complete footage, not the ladder alone.

Any part can also carry a problem flag on top of its step. Flag reasons: conflict in the field, damaged, missing material, waiting on RFI, waiting on inspection. A flagged part shows red in the zone and lists on the report under Issues. Flags don't move the ladder.

## Billing rules

- Every status change is an event. Who, when, from what, to what, footage if linear, photos, note. Events are never edited, only added. That log is the billing backup.
- Billing rollup: pick a date range, app sums every Complete event in that window times the pay item unit price, grouped by pay item and by zone.
- Once a Complete event has been pulled into a submitted rollup it's marked billed and can't land in another one. Rolling a part back from Complete after it's billed creates a credit line, it doesn't erase anything.
- Pay items come from the bid schedule. Item number, description, unit (EA or LF), unit price, bid quantity. Every part points at exactly one pay item. The app shows installed vs bid quantity per item so an overrun is visible before the customer sees it.

## Crew

Foremen in the picker: Darrell Simpson, Carlos Leisse. More get added from the admin screen.

## Foreman flow on the tablet

1. Open the app. Tap your name. Today's report opens or gets created.
2. Airfield map. Zones are big tappable shapes colored by percent complete. Tap a zone.
3. Zone view. Plan sheet fills the screen, pins on every point part, colored by step. Toggle to the list for linear runs and for anyone who'd rather tap rows than pins.
4. Tap a pin or a row. A card slides up. Five big step buttons, the current one lit. Footage field if linear. Camera button. Flag button. Note field. Tap the step, card closes, pin recolors. Two taps per part, that's the goal.
5. Bulk mode. Long press a pin, drag over others, set them all to one step. For the day when the crew sets twenty cans in a row.
6. Report tab. Crew (tap names), hours, equipment (tap from a job list), weather, delays, safety, visitors, notes. The zone sections build themselves from the day's events. Photos show up under the part or zone they were taken in.
7. End of day. Review screen shows everything tapped today. Submit. Report locks for that foreman. Second foreman's submit merges into the same report.

Touch targets 56px minimum. Big fonts. Daylight theme is the default on the tablet, high contrast light so it reads at noon. Dark gold house theme is one tap away and is the default for the office and admin screens.

## Admin flow, new job setup

1. New job. Name, customer, airport, contract number.
2. Upload the bid schedule. CSV or type it in. This makes the pay item list.
3. Upload the plan set PDF. App renders each page to an image on the device and stores it. Admin names the sheets that matter (E-101 overview, E-201 taxiway A, and so on).
4. Pick the overview sheet. Draw zones on it, rectangle or polygon. Name each one. Link it to a detail sheet.
5. Open each zone. Drop pins. Each pin gets a label (fixture ID off the plan), a pay item, and a type. Linear parts get a total quantity instead of a pin, or a pin at the start of the run if you want it on the map.
6. Publish. Tablets sync the job down next time they see signal.

Same flow works for any airfield. Nothing about Eau Gallie is hardcoded.

## Offline and sync

- Installable web app. Everything the foreman needs (sheets, pins, pay items, today's report) is cached on the tablet.
- All taps write locally first. An outbox queues them. When the tablet sees signal it pushes the queue and pulls what the other tablet did.
- Status events are append only, so two foremen never conflict on parts. Report header fields (weather, delays) are last write wins per field. Crew lists merge.
- Photos compress on the device before upload so a day of pictures doesn't eat the cell plan.

## Autodesk Forms

Phase 1 ships a copy path. Report view has a Copy for Autodesk button that puts the whole report on the clipboard as plain text laid out to match the form fields, plus a photo bundle download. Foreman pastes into the form.

Phase 2 pushes it for real through Autodesk Platform Services and the ACC Forms API. App creates a form from the daily report template in the ACC project, fills the fields, submits. Photo attachment through that API needs to be verified before we promise it. If forms can't take photos through the API, photos go to the ACC Photos or Files API and the form gets links. Needs an APS app registered under the company Autodesk account and one time authorization by an ACC admin.

## Data model

- Job: id, name, customer, airport, contract no.
- PayItem: job, item no, description, unit (EA or LF), unit price, bid qty.
- Sheet: job, name, page number, image, width, height.
- Zone: job, name, overview sheet, shape (points in percent coords), detail sheet.
- Part: job, zone, pay item, label, kind (point or linear), pin x and y in percent coords (optional for linear), total qty, current step, flag, flag reason.
- StatusEvent: part, report date, foreman, from step, to step, qty done (linear), note, created at, billed in (rollup id or null).
- Photo: job, report date, part or zone, foreman, file, caption, created at.
- DailyReport: job, date, foremen, crew, hours, equipment, weather, delays, safety, visitors, notes, submitted by, autodesk form id.
- BillingRollup: job, date from, date to, created at, lines (pay item, qty, unit price, total).

## Tech

- React, TypeScript, Vite. Installable PWA with a service worker.
- Dexie (IndexedDB) on the device. Supabase (Postgres, Storage) for sync and photos. Free tier until it matters.
- pdf.js renders plan pages to images in the browser. No server side PDF work.
- Pan and zoom on sheets with pointer events, pins positioned in percent so they survive any screen size.
- Manny's industrial UI system per the honeydone-ui skill, bolt glyph in the badge.

## Build order

1. Placeholder airfield, zones, pins, status taps, list view, local only. The thing you can hold and poke.
2. Daily report screen, photos, review and submit, printable view.
3. Admin setup: PDF upload, sheet naming, zone drawing, pin placement, pay items.
4. Offline sync through Supabase, two tablets.
5. Billing rollup and billed lock.
6. Copy for Autodesk.
7. Autodesk API push.
8. Takeoff spreadsheet import (later).
9. Symbol detection on the drawing (maybe, later).

## Open items

- Autodesk form fields. Need a screenshot or export of the actual daily report form so the copy path lines up with it field for field.
- Bid schedule format. A sample of a real one, even an old job, so the import matches what the office already has.
- Equipment list. What's normally on an airfield job for this crew (trencher, directional bore, core drill, bucket truck, and so on).

ASSUMED: unit is EA or LF only, no SF or CY items. ASSUMED: one contract per job, no change order tracking in v1. ASSUMED: the office pulls rollups, foremen never see prices.
