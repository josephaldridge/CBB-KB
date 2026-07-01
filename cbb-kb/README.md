# Cowboy Academy — Knowledge Base

Next.js 14 (App Router) + Upstash Redis. Same stack as your KPI tracker.
The entire KB (categories + articles) lives under one Redis key and is **shared
across everyone** who visits — edits by one person show up for all.

## What's inside

- `app/page.js` — renders the KB UI
- `components/KnowledgeBase.jsx` — the full client app (search, browse, edit)
- `app/api/kb/route.js` — `GET` reads the KB, `PUT` saves the whole document
- `app/api/kb/reset/route.js` — `POST` restores the original seed content
- `lib/kb.js` — Redis client + read/write/validate helpers
- `lib/seed.json` — the original 11 categories / 47 articles (seeded on first load)

## Deploy to Vercel

1. **Create an Upstash Redis database** (console.upstash.com) and copy its
   REST URL and REST token.

2. **Push this folder to GitHub** (new repo), then in Vercel: *Add New → Project
   → import the repo*. Framework auto-detects as Next.js.

3. **Add Environment Variables** in Vercel (Project → Settings → Environment Variables):

   | Name | Value |
   |------|-------|
   | `UPSTASH_REDIS_REST_URL` | (from Upstash) |
   | `UPSTASH_REDIS_REST_TOKEN` | (from Upstash) |
   | `KB_ADMIN_PASSCODE` | any word you choose — required to edit/add/delete/reset |

4. **Deploy.** First visit seeds Redis with the original content automatically.

That's it. Anyone can read; editing prompts once for the passcode (cached in
their browser afterward). Read-only visitors never need it.

## Local development

```bash
cp .env.example .env.local   # fill in the three values
npm install
npm run dev                  # http://localhost:3000
```

## Notes

- The whole KB is ~50 KB, so it's read/written as a single Redis key
  (`cbb:kb:v2`). Simple and safe for this size; last write wins.
- **Export** (top-right) downloads a JSON backup any time.
- **Reset** (top-right) restores the seed — passcode required.
- To change the passcode later, update `KB_ADMIN_PASSCODE` in Vercel and redeploy;
  editors clear their cached one via browser devtools (`localStorage` key
  `cbb-kb-pass`) or just get re-prompted if it no longer matches.
