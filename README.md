# CampusConnect (Next.js)

Full-stack rewrite of CampusConnect as a **single Next.js 15 + TypeScript
application**: the React frontend, the entire REST API (App Router route
handlers under `/api/*`), and Socket.IO realtime all run in one process behind
one port.

Project by **Shubham Badgujar**.

## What's inside

- **Frontend**: App Router pages ported 1:1 from the original React/Vite app
  (Student / Teacher / Admin portals, attendance, chat, announcements, exams,
  FixIt, calendars). Client-side role guards, Tailwind 3, framer-motion,
  recharts, leaflet, face-api.js.
- **API**: every legacy Express endpoint rewritten as a typed route handler in
  `src/app/api/**` — auth/OTP reset, user & teacher management, the fully
  server-verified attendance stack (WebAuthn passkeys, face liveness
  multi-frame matching, teacher QR), timetables, subject sets, uploads
  (Cloudinary), OCR pipelines (tesseract.js + pdf-parse, optional Gemini),
  bulk onboarding, exam reminders.
- **Realtime**: Socket.IO hosted by the custom server (`server.ts`); route
  handlers emit through a shared singleton. Same event names as the legacy app.
- **Data**: the same Firebase project (Auth + Firestore), same collections,
  same security rules (`firestore.rules`) — this app is a drop-in replacement
  against existing data.

## Getting started

```bash
npm install
```

1. Copy `.env.example` → `.env.local` and fill in values (see
   SETUP_CREDENTIALS.md in the original repo for how to obtain each).
2. Place your Firebase Admin key at `service-account-key.json` (repo root) —
   or set `FIREBASE_SERVICE_ACCOUNT_BASE64`.
3. Run:

```bash
npm run dev
```

Open http://localhost:3000. The API is same-origin (`/api/...`) — no CORS, no
separate backend URL.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Custom server (Next dev compiler + Socket.IO) with watch/restart |
| `npm run build` | `next build` (also the type-check gate) |
| `npm start` | Production server (`NODE_ENV=production tsx server.ts`) |
| `npm run typecheck` | `tsc --noEmit` |
| `node scripts/createDemoAccounts.js` | Demo admin/teachers/students |
| `node scripts/rotateStudentPasswords.js` | Rotate all student passwords |

## Architecture

```
server.ts                 # http server: Next handler + Socket.IO + scheduler
src/app/**                # pages (route groups per role) + api/** route handlers
src/lib/server/**         # the old 9,400-line Express monolith, split into modules
src/lib/client/**         # firebase client, api client, attendance service
src/server/socket.ts      # Socket.IO connection handlers
src/components/**         # UI components (common / student / teacher / admin)
scripts/**                # admin utilities (CommonJS, run with node)
```

## Deployment (Render)

One web service replaces the old two-service setup. `render.yaml` is a ready
Blueprint: build `npm ci && npm run build`, start `npm start`, health check on
`/api/subjects`. Set the env vars listed in `.env.example` (service account as
`FIREBASE_SERVICE_ACCOUNT_BASE64`). Remember to add the deployed domain to
Firebase Auth → Authorized domains.

## Relationship to the original

The original two-app version lives in `CampusConnect-main` (React+Vite frontend
+ Express backend) and remains the reference implementation. All security
hardening from it is preserved here: admin-guarded management endpoints,
server-verified WebAuthn with single-use session-bound challenges, multi-frame
face liveness, crypto-random passwords, peppered OTPs, and prefix-locked
Cloudinary deletion.
