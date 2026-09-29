# Prompt Shield — Automated LLM Prompt Security Analyser

> Secure every prompt before it reaches your LLM.

Prompt Shield is a full-stack web application that analyses Large Language Model (LLM) prompts for **prompt injection, jailbreak attempts, information leakage, inconsistent behaviour and excessive token usage** before they are deployed. It produces a transparent, weighted **security score**, findings with masked evidence, **recommendations**, **PDF reports**, and **version comparisons** that show whether a change improved or worsened security.

It runs completely offline in **Local Analysis Mode** (no API key needed). Adding an OpenAI or Gemini key optionally enables **AI Enhanced** mode.

---

## Table of contents

1. [Problem statement](#problem-statement)
2. [Proposed solution](#proposed-solution)
3. [How Prompt Shield works](#how-prompt-shield-works)
4. [Features](#features)
5. [Architecture](#architecture)
6. [Technology stack](#technology-stack)
7. [Project structure](#project-structure)
8. [Installation](#installation)
9. [Environment variables](#environment-variables)
10. [Database setup](#database-setup)
11. [Running the backend and frontend](#running-the-backend-and-frontend)
12. [Running tests](#running-tests)
13. [Demo credentials and demo flow](#demo-credentials-and-demo-flow)
14. [API overview](#api-overview)
15. [Security notes](#security-notes)
16. [Screenshots](#screenshots)
17. [Limitations](#limitations)
18. [Future enhancements](#future-enhancements)

---

## Problem statement

LLM applications build prompts from trusted instructions _and_ untrusted text (user messages, documents, tool output). This creates new risks:

- **Prompt injection** – text such as "ignore all previous instructions" hijacks the application.
- **Jailbreaks** – personas like "DAN" or "developer mode" try to switch off safety rules.
- **Information leakage** – API keys, passwords or personal data placed in prompts can be extracted.
- **Inconsistency** – vague or contradictory instructions make behaviour unpredictable.
- **Cost** – bloated prompts waste tokens on every request.

Developers need a way to analyse prompts **before** they are used.

## Proposed solution

Prompt Shield is a security-analysis layer between the developer and the LLM. A developer writes or uploads a prompt, the system validates it, runs five modular scanners, computes a documented weighted score, generates findings-driven recommendations, and stores everything so that versions can be compared and reported.

## How Prompt Shield works

```
Developer
   ↓
Prompt (editor or .txt / .md / .json upload)
   ↓
Validation (empty, size, malformed input, template syntax)
   ↓
Security Scanner  ── Injection · Jailbreak · Leakage · Consistency · Token cost
   ↓
AI / Local Analysis (Local by default, optional OpenAI / Gemini review)
   ↓
Scoring (weighted average + severity caps)
   ↓
Recommendations (generated from actual findings)
   ↓
Dashboard  →  Vulnerability report  →  PDF  →  Versions & comparison
```

## Features

| Epic                            | Implemented features                                                                                                                                                                                                                                                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · User & prompt management    | Registration, login, logout, JWT auth, protected routes, session expiry handling, prompt editor with line numbers and live highlighting, template upload (.txt/.md/.json), structured validation                                                                                                                                  |
| 2 · Security scanning engine    | Rule-based injection detector (overrides, extraction, role manipulation, chat-template tokens, hidden Unicode, Base64 payloads, exfiltration, undelimited placeholders, obfuscation pass), jailbreak detector, leakage detector with masking (23 detectors incl. Luhn-checked cards), consistency simulation, token cost analysis |
| 3 · Analysis & scoring          | Per-category safety scores, weighted overall score with severity caps, risk levels, persisted stage log and results                                                                                                                                                                                                               |
| 4 · Recommendations & dashboard | Findings-driven recommendation engine, security dashboard (score, KPIs, trend, radar, activity, severity distribution), vulnerability report with filtering/sorting, history with search/filters/pagination, global recommendations page                                                                                          |
| 5 · Reporting                   | Server-side PDF (PDFKit) with score ring, category bars, findings, recommendations, token & consistency analysis; in-app preview and download                                                                                                                                                                                     |
| 6 · Version management          | Immutable versions (v1, v2, v3…), version timeline, line + word diff, score/category deltas, vulnerabilities introduced/resolved, IMPROVED/WORSENED verdict                                                                                                                                                                       |

Also: Local/AI analysis modes, analysis progress page driven by real backend stages, responsive command-center UI, skeleton/empty/error states, toasts, accessible forms and dialogs.

## Architecture

```
┌──────────────────────── client (React + Vite) ────────────────────────┐
│ pages → components → services (Axios) → /api (Vite dev proxy)         │
└───────────────────────────────┬───────────────────────────────────────┘
                                │ JSON / JWT Bearer
┌───────────────────────────────▼──────── server (Express 5) ───────────┐
│ routes → middleware (helmet, CORS, rate-limit, auth, zod validation)  │
│        → controllers → services                                        │
│                         ├─ analysis.service ── SecurityScanner         │
│                         │     ├ InjectionScanner   ├ ConsistencyScanner│
│                         │     ├ JailbreakScanner   └ TokenCostScanner  │
│                         │     └ LeakageScanner                         │
│                         ├─ scoring / recommendation / report / pdf     │
│                         ├─ comparison (diff) / dashboard               │
│                         └─ ai/ LocalProvider | OpenAIProvider | Gemini │
│ Prisma ORM 7 (better-sqlite3 driver adapter) → SQLite                  │
└────────────────────────────────────────────────────────────────────────┘
```

See [`docs/architecture.md`](docs/architecture.md) for the design decisions.

## Technology stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS 4, React Router, Axios, Recharts, Lucide icons, React Hook Form, Zod
- **Backend:** Node.js, Express 5, TypeScript, JWT (jsonwebtoken), bcrypt (bcryptjs), Helmet, CORS, express-rate-limit, Multer, PDFKit, jsdiff
- **Database:** SQLite with Prisma ORM 7 (driver adapter `@prisma/adapter-better-sqlite3`)
- **Testing:** Vitest, Supertest, Testing Library
- **Quality:** ESLint (typescript-eslint), Prettier, strict TypeScript

## Project structure

```
prompt-shield/
├── client/                    React frontend
│   ├── public/                favicon / logo
│   └── src/
│       ├── components/        ui/ (Button, Card, Modal, Badge, RiskBadge, ScoreRing, ProgressBar,
│       │                      Tooltip, DataTable, Toast, ConfirmDialog, Empty/Loading/ErrorState),
│       │                      analysis/, prompt/, versions/, navigation/, brand/
│       ├── context/           AuthContext, ToastContext
│       ├── hooks/             useAsync, useDebouncedValue, useDocumentTitle
│       ├── layouts/           AppLayout (sidebar + topbar), AuthLayout
│       ├── pages/             16 pages (landing, auth, dashboard, analysis, reports, versions…)
│       ├── services/          Axios API clients
│       ├── types/             API DTO types
│       └── utils/             formatting, risk colours, helpers
├── server/                    Express API
│   ├── prisma/                schema.prisma, migrations/, seed.ts
│   ├── src/
│   │   ├── config/            env, constants, scoring model
│   │   ├── controllers/       HTTP handlers
│   │   ├── data/              demo/sample prompts
│   │   ├── lib/               Prisma client
│   │   ├── middleware/        auth, validation, rate limits, upload, errors
│   │   ├── models/            DTO mappers
│   │   ├── routes/            REST routes
│   │   ├── scanners/          scanner engine, pattern libraries, rule engine
│   │   ├── services/          business logic (+ ai/ providers)
│   │   ├── types/             shared types
│   │   ├── utils/             text, masking, tokens, responses
│   │   ├── validators/        Zod request schemas
│   │   ├── app.ts / server.ts
│   └── tests/                 unit + API tests
├── docs/                      architecture, api, security-scanning, database, development
├── scripts/setup.mjs          one-command setup
├── tests/                     end-to-end smoke test
├── .env.example
└── package.json               npm workspaces
```

## Installation

**Prerequisites:** Node.js **22 LTS** (20.19+ works) and npm 10+. Git is recommended.

```bash
git clone <your-repo-url> prompt-shield
cd prompt-shield
npm install          # installs client + server (npm workspaces) and generates the Prisma client
npm run setup        # creates server/.env, applies migrations, seeds demo data
npm run dev          # starts API (http://localhost:5000) and UI (http://localhost:5173)
```

> On first run Prisma downloads its migration engine for your OS (internet access needed once).

## Environment variables

`npm run setup` copies [`.env.example`](.env.example) to `server/.env` and generates a random `JWT_SECRET`.

| Variable                          | Default                    | Description                                        |
| --------------------------------- | -------------------------- | -------------------------------------------------- |
| `PORT`                            | `5000`                     | API port                                           |
| `CLIENT_ORIGIN`                   | `http://localhost:5173`    | Allowed CORS origin(s), comma-separated            |
| `DATABASE_URL`                    | `file:./dev.db`            | SQLite file, relative to `server/`                 |
| `JWT_SECRET`                      | generated                  | Signing secret (≥ 32 chars required in production) |
| `JWT_EXPIRES_IN`                  | `8h`                       | Session length                                     |
| `BCRYPT_ROUNDS`                   | `12`                       | Password hashing cost                              |
| `AI_PROVIDER`                     | `auto`                     | `auto` \| `local` \| `openai` \| `gemini`          |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | empty / `gpt-4o-mini`      | Optional AI Enhanced mode                          |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | empty / `gemini-2.5-flash` | Optional AI Enhanced mode                          |
| `TOKEN_PRICE_PER_MILLION_USD`     | `0.5`                      | Reference price for the illustrative cost estimate |
| `MAX_UPLOAD_BYTES`                | `262144`                   | Upload size limit                                  |

The client needs no configuration in development (Vite proxies `/api`). See `client/.env.example` for `VITE_API_URL`.

**Never commit `.env` files or real keys** – they are git-ignored.

## Database setup

| Command (from the repository root) | Purpose                                              |
| ---------------------------------- | ---------------------------------------------------- |
| `npm run db:deploy`                | Apply committed migrations (used by `setup`)         |
| `npm run db:seed`                  | Re-create the demo account and demo analyses         |
| `npm run db:migrate`               | Create a new migration after editing `schema.prisma` |
| `npm run db:reset`                 | Drop, re-migrate and re-seed the database            |
| `npm run db:studio`                | Browse data in Prisma Studio                         |

## Running the backend and frontend

```bash
npm run dev          # both (recommended)
npm run dev:server   # API only  → http://localhost:5000/api/health
npm run dev:client   # UI only   → http://localhost:5173
npm run build        # production build of both
npm start            # run the compiled API (after npm run build)
```

## Running tests

```bash
npm test             # backend (55 tests) + frontend tests
npm run test:server  # Vitest + Supertest
npm run test:client  # Vitest + Testing Library
npm run test:smoke   # end-to-end demo flow against a running API
npm run lint         # ESLint for both workspaces
npm run typecheck    # TypeScript for both workspaces
```

## Demo credentials and demo flow

> Development / demo data created by `npm run db:seed`.

- **Email:** `demo@promptshield.local`
- **Password:** `Demo@12345`

The demo account contains 7 prompts, 10 versions and 10 analyses spread over two weeks (safe, injection, jailbreak, leakage, verbose, RAG and code-review prompts). All numbers come from the real scanners.

Suggested live demo: register/login → dashboard → **New Analysis** → _Load sample_ → validate → start scan → watch the stage-by-stage progress → results, vulnerabilities and recommendations → **New version** → fix the prompt → analyse v2 → **Compare** v1 vs v2 → **Generate PDF** → download → **History**.

## API overview

All responses use `{ "success": true, "data": …, "message": … }` or `{ "success": false, "error": { "code", "message", "details" } }`.

| Method         | Endpoint                                                           | Description                                                             |
| -------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| POST           | `/api/auth/register` · `/api/auth/login` · `/api/auth/logout`      | Authentication                                                          |
| GET/PUT/DELETE | `/api/auth/me` · PUT `/api/auth/password`                          | Profile, password, account deletion                                     |
| GET/POST       | `/api/prompts`                                                     | List / create prompts (creates v1)                                      |
| POST           | `/api/prompts/validate` · `/api/prompts/upload`                    | Validate raw text · parse an uploaded template                          |
| GET/PUT/DELETE | `/api/prompts/:id`                                                 | Prompt detail with versions                                             |
| POST           | `/api/prompts/:id/validate` · `/api/prompts/:id/analyze`           | Validate stored version · start analysis (`?wait=true` for synchronous) |
| GET/POST       | `/api/prompts/:id/versions` · GET `/api/prompts/:id/versions/:n`   | Versions                                                                |
| GET            | `/api/prompts/:id/compare?from=1&to=2`                             | Version comparison                                                      |
| GET            | `/api/analyses` · `/api/analyses/:id` · `/api/analyses/:id/status` | History, detail, live progress                                          |
| GET            | `/api/analyses/:id/report` · `/api/analyses/:id/pdf`               | Vulnerability report · PDF                                              |
| GET            | `/api/dashboard/summary` · `/api/recommendations`                  | Dashboard metrics · recommendations                                     |
| GET            | `/api/health` · `/api/system/status` · `/api/samples`              | Health, analysis mode, sample prompts                                   |

Full reference: [`docs/api.md`](docs/api.md).

## Security notes

- Passwords hashed with bcrypt; JWTs (HS256) with issuer/audience checks and expiry; password changes revoke older sessions (`tokenVersion`).
- Helmet security headers, strict CORS allow-list, JSON body limit (1 MB), rate limiting on auth, analysis and the whole API.
- Every request is validated with Zod; errors never expose stack traces.
- Uploads: memory-only, 256 KB limit, extension allow-list, binary and encoding checks – content is **never executed**.
- Resource ownership is enforced on every query (other users' data returns 404).
- **Secrets are masked everywhere** they are displayed (findings, reports, PDFs, diffs), and only masked text is ever sent to external AI providers.
- Parameterised queries via Prisma; React escapes all rendered text (no `dangerouslySetInnerHTML`).

## Screenshots

_Add screenshots of the landing page, dashboard, analysis progress, results, report, version comparison and PDF here._

| Dashboard                        | Analysis result               | Version comparison             |
| -------------------------------- | ----------------------------- | ------------------------------ |
| `docs/screenshots/dashboard.png` | `docs/screenshots/result.png` | `docs/screenshots/compare.png` |

## Limitations

- Detection is **rule-based and heuristic**; it will miss novel attacks and can produce false positives. Scores are project-defined classifications, not security guarantees.
- Local consistency testing is a deterministic **simulation** based on how explicitly the prompt defines behaviour; real sampling needs an AI provider.
- Token counts are **estimates** (±15% for English), not a real tokenizer.
- The OpenAI/Gemini integrations follow the public REST APIs but depend on your key, model availability and quotas.
- The PDF uses standard PDF fonts; non-Latin characters are replaced with `?`.
- JWTs are stored in `localStorage` for simplicity; an httpOnly-cookie session would further reduce XSS impact.

## Future enhancements

- Real tokenizers per model (e.g. tiktoken) and live pricing tables
- ML-based injection classifiers alongside the rules
- Team workspaces, sharing and role-based access control
- CI/CD integration (GitHub Action that fails a build on critical findings)
- Scheduled re-scans and alerting, webhook notifications
- PostgreSQL for multi-user deployments

---

Made as a university Software Engineering project. See [`docs/development.md`](docs/development.md) for the Git workflow and a suggested feature-by-feature commit plan.

Prompt Shield provides secure prompt analysis and AI security insights.
