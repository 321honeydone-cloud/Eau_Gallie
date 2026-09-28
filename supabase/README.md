# Sync backend, one time setup

Takes about ten minutes. Free tier is plenty for a crew.

1. Go to supabase.com, sign in, New project. Name it EGE Field, pick a strong database password (you never type it again), region East US.
2. Open the SQL Editor, paste everything in `schema.sql`, Run. It makes one table and one private files bucket, and lets the tablets read and write with the anon key.
3. Project Settings, API. Copy the Project URL and the anon public key.
4. On each iPad open the app, tap the sync pill in the top bar (it says Not synced), paste the URL and the key, Connect.

That's it. Every tap goes up when the tablet has signal and comes down to the other tablets within a minute. Offline it queues and the pill says how many are waiting.

Keep the anon key inside the company. There is no login on the tablets, so anyone with that key can read the job data. If it ever leaks, Settings, API, roll the anon key, and paste the new one on the tablets.

Moving a whole job setup (sheets, zones, pins, pay items) also goes through sync now. Set it up on one iPad and the others get it.
