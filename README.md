# REPORT STUDIO

Gemini report proofreading, summaries and evaluation, with Vercel server APIs and a Supabase public evaluation board.

## Public evaluations

Users explicitly publish their display name and AI evaluation: score, overview, criteria, strengths and improvements. Original reports, files, summaries, corrections and Gemini keys are not saved in the database. Visitors can leave a 1–5 rating or a short comment. The board refreshes every 30 seconds.

Names are unverified. A signed browser cookie identifies authors for deletion and comment editing. Clearing cookies loses those permissions. This is not account authentication.

## Setup

Follow [Supabase setup](docs/SUPABASE_SETUP.md):

1. Run `supabase/migrations/202610190001_public_reviews.sql` once in Supabase SQL Editor.
2. Set Vercel server environment variables `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `SESSION_SECRET`. Never commit actual secrets.
3. Import this repository into Vercel: Other framework, Node.js 22.x, build `npm run build`, output `dist`. Root Directory must contain `package.json`.
4. Redeploy after changing environment variables. Connect the production branch to `main` for automatic deployments on push.

Pushing code does not configure the database or Vercel environment. Until configured, the board shows a preparation message; Gemini analysis remains available. Users supply their own Gemini keys. The server selects models automatically; optional `GEMINI_MODEL` sets an operator preference.

## Development

```sh
npm ci
npm run dev
npm test
npm run build
```

Open http://localhost:3000. Node.js 22+ required; no runtime npm dependencies. The development server does not automatically load `.env`; set environment variables in the process environment using `.env.example` as a reference.

GitHub Actions runs tests and builds on main pushes and pull requests. Tests mock upstream services and cover analysis validation, evaluation-only storage, signed publication, ownership, ratings and comments. Real Gemini/Supabase integration and Vercel deployment require configured services.

## Structure

| Path | Purpose |
| --- | --- |
| `public/` | Analysis interface and public evaluation board |
| `api/analyze.js`, `api/connection.js` | Server-side Gemini requests |
| `api/community.js` | Public evaluations, ratings and comments |
| `lib/community.js` | Signatures, ownership, field filtering and Supabase requests |
| `supabase/migrations/` | Database schema, grants and write limits |
| `scripts/` | Development server and build |
| `test/` | Automated API tests |

PDF limit: 3,000,000 bytes. DOCX/TXT/MD: 10,000,000 bytes; extracted text: 120,000 characters. DOCX uses Mammoth from jsDelivr. Analysis timeout is 110 seconds; Vercel function configuration is 120 seconds, subject to plan limits.

Gemini keys stay in browser memory and are forwarded through the server to Google for requests. Reports are sent to Google for analysis and subject to Google's processing policies. Use a key suitable for server requests, without HTTP referrer restrictions.
