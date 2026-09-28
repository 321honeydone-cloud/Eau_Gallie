# Airfield Daily Report App. Spec v0.1

Eau Gallie Electric. Internal working spec. Built from the interview on 2026-09-28.

## BOSS brief

- B: Eau Gallie Electric. Foreman on a tablet on the airfield, office billing off what he taps. Eau Gallie is job one, every airfield after it reuses the same app.
- O: End of day the foreman has tapped every part he touched, the report is in Autodesk Forms, and the office can pull a unit price rollup for the pay app without asking anybody anything.
- S: The Eau Gallie UI kit (ege-ui.css and ege-ui.js, navy and red on white, Oswald and Roboto). Blunt internal copy. No em or en dashes, no semicolons.
- S: Offline all day. Two foremen at once. Works with gloves. No login. Placeholder airfield until the real plans land. Never double bills a part.

## What we decided

| Question | Answer |
|---|---|
| How the customer gets billed | Unit price per part installed. Count times contract unit price. |
| Parts the foreman taps | Fixtures and signs, base cans and transformers, conduit and duct bank and cable runs, vaults and handholes and regulators and equipment. Plus demo of all of the above, which the schedule shows is its own phase of work. |
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
| Narrative | Buttons, not typing. Every section is built from taps and radio picks. One optional text box per section for anything extra, and iPad dictation works in it off the keyboard mic key. |
| Signer | Whoever submits also signs. No separate superintendent review step. |
| Phases | A phase is a group of zones. Each zone carries a phase. Map colors by phase, report can group by phase. The Autodesk schedule already breaks work down as Phase, then plan sheet (E108, E109), then activity. So a zone is a plan sheet. |
| Device | iPad. Installable web app on Safari, added to the home screen. |
| Look | The Eau Gallie UI kit Manny supplied. Light theme, so the daylight toggle is gone. Real logo file still needed, a temporary wordmark is in its place. |

## The status ladder, spelled out

Same five steps for every part type. What each step means changes by type so the foreman isn't guessing.

| Step | Fixture or sign | Base can or transformer | Conduit, duct, cable (linear) | Vault, handhole, regulator |
|---|---|---|---|---|
| Not started | Nothing done | Nothing done | Nothing done | Nothing done |
| Rough in | Core drilled or trenched to the spot | Excavated | Trenched or bored, footage entered | Excavated |
| Set | Base in, backfilled | Can set, plumb, backfilled | Conduit or duct in, footage entered | Structure set |
| Wired | Cable landed, transformer connected | Transformer in, secondary landed | Cable pulled, footage entered | Cable landed, gear mounted |
| Complete | Fixture on, aimed, tested | Lid on, tested | Terminated, tested, footage entered | Energized, tested |

Demo parts use the same five buttons with demo meanings. The schedule sample lists the demo activities by name: remove light fixtures and signs, disconnect cable at base cans, remove cable, cut conduit, saw cut and remove conduit and base cans in asphalt, remove manholes and conduit in earth.

| Step | Demo part |
|---|---|
| Not started | Still in service |
| Rough in | Disconnected, locked out |
| Set | Saw cut or excavated |
| Wired | Pulled out of the ground or off the base |
| Complete | Hauled off, hole backfilled or plugged |

RE parts. The plans mark some fixtures RE, meaning remove, preserve, and reinstall. An RE part is one part with two ladders, demo then install. It shows once on the map. The card shows which ladder is active. Billing treats the demo and the reinstall as two pay items on the same part.

Linear parts carry a total quantity (LF) and the foreman enters footage done at each step. Billing reads the Complete footage, not the ladder alone.

Any part can also carry a problem flag on top of its step. Flag reasons: conflict in the field, damaged, missing material, waiting on RFI, waiting on inspection. A flagged part shows red in the zone and lists on the report under Issues. Flags don't move the ladder.

## Billing rules

- Every status change is an event. Who, when, from what, to what, footage if linear, photos, note. Events are never edited, only added. That log is the billing backup.
- Billing rollup: pick a date range, app sums every Complete event in that window times the pay item unit price, grouped by pay item and by zone.
- Once a Complete event has been pulled into a submitted rollup it's marked billed and can't land in another one. Rolling a part back from Complete after it's billed creates a credit line, it doesn't erase anything.
- Pay items come from the bid schedule. Sample is in docs/reference/bid-schedule-pensacola-rw8-26-sample.pdf. Columns are Item No, Spec Ref (FAA item like L-125, P-401, SP-105), Description, Approx Quantity, Unit, Unit Price, Total. Every part points at exactly one pay item. The app shows installed vs bid quantity per item so an overrun is visible before the customer sees it.
- Units seen on the sample: LS, SY, AC, CY, TN, GAL, EA, LF, AL. The electrical items are mostly EA, LF, and LS. The app stores the unit as text and keys billing off a billing type instead.
- Three billing types. Unit price (EA, LF, SY, and so on): count times unit price, driven by parts. Lump sum (LS): percent complete, foreman taps a button row on the report (0, 10, 25, 50, 75, 90, 100) whenever it moves, billing uses the latest. Allowance (AL): billed on actual cost with backup, the app just holds the number and flags when it's touched.
- Which list we bill against depends on the job. Some GCs hand us a subcontract schedule of values with our own numbering, some use the owner's items straight. Admin picks per job. Pay items always carry both an owner item number and an optional sub item number so either way works.

## Crew and equipment

Foremen in the picker: Darrell Simpson, Carlos Leisse. More get added from the admin screen.

Default equipment list for a new airfield job, editable per job: trencher, mini excavator, skid steer, directional bore rig, core drill, saw cut rig, concrete mixer, bucket truck, service truck, van, light tower. Trucks and vans get a unit number.

## Foreman flow on the tablet

1. Open the app. Tap your name. Today's report opens or gets created.
2. Airfield map. Zones are big tappable shapes colored by percent complete. Tap a zone.
3. Zone view. Plan sheet fills the screen, pins on every point part, colored by step. Toggle to the list for linear runs and for anyone who'd rather tap rows than pins.
4. Tap a pin or a row. A card slides up. Five big step buttons, the current one lit. Footage field if linear. Camera button. Flag button. Note field. Tap the step, card closes, pin recolors. Two taps per part, that's the goal.
5. Bulk mode. Long press a pin, drag over others, set them all to one step. For the day when the crew sets twenty cans in a row.
6. Report tab. Crew in three buckets with shift times, equipment (tap from a job list), weather, safety, visitors. Planned scope is prefilled from yesterday. Yard and Other for work with no pin. Executive comment. Everything else builds itself from the day's events and flags. Photos show up under the part or zone they were taken in.
7. End of day. Review screen shows the report laid out in the six Autodesk sections. Submit. Second foreman's submit merges into the same report.
8. Sign with a finger on the review screen. Copy for Autodesk or, later, push.

Touch targets 56px minimum. Big fonts. Light theme from the EGE kit reads at noon.

## Buttons over typing

The field tech is standing in the sun with gloves on. Every input that can be a button is a button. Text boxes exist but nothing requires them.

- Status: five step buttons.
- Flag: reason buttons, responsible party buttons, schedule impact buttons. Note box optional.
- Weather: sun, cloud, rain, wind, heat buttons plus a temp picker.
- Crew: tap names into a bucket. Shift start and end are time pickers with the usual times as one tap presets (6:00 AM, 6:30 AM, 3:00 PM, 6:30 PM). Lunch is 30 or 60.
- Equipment: tap from the job's list. Add new from the admin screen.
- Delays and carryover: built from flags. The foreman never types a delay from scratch.
- Yard and Other: pick a category (prefab, vehicle inspection, coordination, material staging, other) and a quantity. Note box optional.
- Planned scope and action plan: checkboxes over yesterday's carryover list plus zone picks for tomorrow. Note box optional.
- Executive comment: optional. One text box.

Every text box is a plain input so the iPad keyboard mic key works for dictation. No custom keyboard, no special field types that break dictation.

## Admin flow, new job setup

1. New job. Name, customer, airport, contract number.
2. Upload the bid schedule. CSV or type it in. This makes the pay item list.
3. Upload the plan set PDF. App renders each page to an image on the device and stores it. Admin names the sheets that matter (E-101 overview, E-201 taxiway A, and so on).
4. Pick the overview sheet. Draw zones on it, rectangle or polygon. Name each one, give it a phase, link it to a detail sheet.
5. Open each zone. Drop pins. Each pin gets a label (fixture ID off the plan), a pay item, and a type. Linear parts get a total quantity instead of a pin, or a pin at the start of the run if you want it on the map.
6. Publish. Tablets sync the job down next time they see signal.

Same flow works for any airfield. Nothing about Eau Gallie is hardcoded.

## Offline and sync

- Installable web app. Everything the foreman needs (sheets, pins, pay items, today's report) is cached on the tablet.
- All taps write locally first. An outbox queues them. When the tablet sees signal it pushes the queue and pulls what the other tablet did.
- Status events are append only, so two foremen never conflict on parts. Report header fields (weather, delays) are last write wins per field. Crew lists merge.
- Photos compress on the device before upload so a day of pictures doesn't eat the cell plan.

## Autodesk Forms

The real form is "Daily Report v2" in Autodesk Build. Sample export is in docs/reference/autodesk-daily-report-v2-sample.pdf. Six numbered sections plus a signature block. Here's what each one is and where the app gets it from.

| Form field | What goes in it | Where the app gets it |
|---|---|---|
| 1.1 Planned Scope of Work for Today | Work type, area, planned qty, crew assigned | Prefilled from yesterday's 1.5 Action Plan. Foreman edits. |
| 1.2 Work Executed | Work type, area, installed qty, percent complete. Photos attach here. | Built from today's status events, grouped by zone. "Taxiway B2: 6 cans Set, 4 fixtures Complete, 320 LF conduit Set." Photos ride along. |
| 1.3 Outstanding / Carryover Work | Pending work, reason, impact level | Parts that moved today but didn't reach Complete, plus every open flag. |
| 1.4 Delays and Issues | Delay type, responsible party, schedule impact | Straight from flags. Each flag carries a responsible party and a schedule impact (see below). |
| 1.5 Action Plan and Projection | Recovery needed, action type, expected timeline | Carryover list plus whatever the foreman adds. Becomes tomorrow's 1.1. |
| 1.6 Crew and Production Summary | Internal, subcontractor, temporary personnel. Shift times, lunch. General Status checklist. Executive Comment. | Crew picker with three buckets and shift time buttons. General Status builds itself from the day's events and flags. Executive Comment is optional text, dictation friendly. |
| Signature | Form says superintendent reviews and signs. | Whoever submits signs. One step. Signature drawn on the screen with a finger. |

Flag fields, lifted from 1.4 so they map straight across:

- Responsible party: Internal, GC, Owner, Sub, Vendor, Equipment condition, Work area availability, Weather.
- Schedule impact: No Impact, Minor (under 1 day), Moderate (1 to 3 days), Major (3 plus days).

Crew fields, lifted from 1.6:

- Three buckets: Internal, Subcontractor, Temporary. Names per bucket. Shift start, shift end, lunch minutes per bucket.
- Report prep time for the foreman writing it.

Things the sample report tracks that aren't parts on a drawing: vehicle inspections, prefab work in the yard (JCP assemblies, 2 can and 3 can configs), coordination with other contractors (asphalt, utility services, core drilling sub). The app needs a Yard and Other section per day for work that has no pin. Free text with an optional quantity.

The sample also confirms the install sequence the crew actually runs: Core Drilling, Can Leveling, Concrete at the Base, Transformer and Light. That lines up with Rough in, Set, Set, Wired then Complete. Good.

Phase 1 ships a copy path. Review screen has a Copy for Autodesk button that puts each section on the clipboard one at a time in the order above, so the superintendent pastes 1.1 through 1.6 into the form without retyping. Photos download as a bundle for the 1.2 attachments.

Phase 2 pushes it for real through Autodesk Platform Services and the ACC Forms API. App creates a Daily Report v2 form in the ACC project, fills the six sections, submits. Photo attachment through that API needs to be verified before we promise it. If forms can't take photos through the API, photos go to the ACC Photos or Files API and the form gets links. Needs an APS app registered under the company Autodesk account and one time authorization by an ACC admin.

## Data model

- Job: id, name, customer, airport, contract no.
- PayItem: job, item no, sub item no (optional), spec ref, description, unit, billing type (unit, lump sum, allowance), unit price, bid qty, percent complete (lump sum only).
- Sheet: job, name, page number, image, width, height.
- Phase: job, name, order.
- Zone: job, phase, name, overview sheet, shape (points in percent coords), detail sheet.
- Part: job, zone, label, kind (point or linear), work (install, demo, or RE), pin x and y in percent coords (optional for linear), total qty, install pay item, demo pay item, install step, demo step.
- Flag: part (or zone, or none for yard work), reason, responsible party, schedule impact, opened by, opened at, closed at, note.
- StatusEvent: part, report date, foreman, from step, to step, qty done (linear), note, created at, billed in (rollup id or null).
- Photo: job, report date, part or zone, foreman, file, caption, created at.
- DailyReport: job, date, foremen, crew (three buckets with shift and lunch), equipment, weather, safety, visitors, planned scope, action plan, yard and other work, executive comment, submitted by, signature image, signed at, autodesk form id.
- BillingRollup: job, date from, date to, created at, lines (pay item, qty, unit price, total).

## Tech

- React, TypeScript, Vite. Installable PWA with a service worker. Added to the iPad home screen so Safari doesn't purge the offline data.
- Dexie (IndexedDB) on the device. Supabase (Postgres, Storage) for sync and photos. Free tier until it matters.
- pdf.js renders plan pages to images in the browser. No server side PDF work.
- Pan and zoom on sheets with pointer events, pins positioned in percent so they survive any screen size.
- The Eau Gallie UI kit, vendored into the app.

## Build order

1. Placeholder airfield, zones, pins, status taps, list view, local only. The thing you can hold and poke. DONE, see app/ and docs/screenshots/.
2. Daily report screen, photos, review and submit, printable view.
3. Admin setup: PDF upload, sheet naming, zone drawing, pin placement, pay items.
4. Offline sync through Supabase, two tablets.
5. Billing rollup and billed lock.
6. Copy for Autodesk.
7. Autodesk API push.
8. Takeoff spreadsheet import (later).
8b. Autodesk Build Schedule sync (later). The schedule has a percent complete per activity and activities are already split by phase and sheet. The app can compute percent complete per sheet per activity type from part steps and push it up, so the Gantt updates itself off the taps.
9. Symbol detection on the drawing (maybe, later).

## Open items

- Real logo file. The kit's header wants an image. A temporary wordmark is in public/logo.svg until the PNG or SVG shows up.
- Bid schedule sample is the owner's original for Pensacola and only 4 pages. The electrical L items (L-108 cable, L-110 duct, L-115 manholes, L-125 lights and signs) are probably on pages we don't have. Format is known, that's enough to build the import.


ASSUMED: one contract per job, no change order tracking in v1. ASSUMED: the office pulls rollups, foremen never see prices.
