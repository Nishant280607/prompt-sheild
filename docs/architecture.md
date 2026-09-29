# Architecture

## Overview
Prompt Shield is a two-tier web application in an npm-workspaces monorepo:

- **client/** – single-page React application (Vite, TypeScript, Tailwind CSS).
- **server/** – REST API (Express 5, TypeScript) with a SQLite database accessed through Prisma ORM 7.

In development the Vite dev server proxies `/api` to the API, so the browser talks to a single origin.

## Backend layers
| Layer | Folder | Responsibility |
| --- | --- | --- |
| Routes | `src/routes` | Map URLs to controllers and attach middleware |
| Middleware | `src/middleware` | Auth (JWT), Zod validation, rate limits, uploads, error envelope |
| Controllers | `src/controllers` | Translate HTTP ↔ service calls; no business logic |
| Services | `src/services` | Business logic: prompts, versions, analysis orchestration, scoring, recommendations, reports, PDF, comparison, dashboard |
| Scanners | `src/scanners` | Security checks; pure functions of the prompt text |
| Models | `src/models` | Map database rows to API DTOs |
| Data access | `src/lib/prisma.ts` | Single Prisma client with the better-sqlite3 driver adapter |

## Key decisions
1. **Modular scanner engine.** Every scanner implements `Scanner { category, stage, label, scan(ctx) }` and returns the same `ScannerResult` shape. The registry in `scanners/SecurityScanner.ts` defines order and pipeline stages. Adding a check means adding one class and one line.
2. **Shared scan context.** Text is prepared once per analysis: sensitive values are detected and masked (`redacted`), a de-obfuscated copy (`folded`) is built, and a line index is computed. All evidence is cut from the redacted text, so secrets can never leak into findings.
3. **Transparent rules over black boxes.** Patterns are plain, commented regular expressions with explicit explanations, severities and recommendation codes. Defensive wording ("never ignore these rules", "if a user asks you to…") is recognised to limit false positives.
4. **Real progress, not an animation.** `POST /prompts/:id/analyze` creates an `Analysis` row, returns `202`, and runs the pipeline in the background. Each stage start/finish is persisted in `stageLog`; the progress page polls `GET /analyses/:id/status` and replays the recorded stages (with a short minimum display time because local scans take milliseconds). `?wait=true` provides a synchronous variant for tests and scripts. Interrupted runs are marked as failed on start-up.
5. **Configurable, documented scoring.** Weights, severity impacts, caps and bands live in `config/scoring.ts`. Category results store the weight used, so old reports remain reproducible.
6. **Local-first AI abstraction.** `AIProvider` has three implementations. `resolveProvider()` picks OpenAI/Gemini only if a key is configured; otherwise `LocalProvider` (no network). External providers only *add* advisory findings (capped at HIGH) and response sampling, and they only ever receive redacted text. Provider errors fall back to local results with a notice.
7. **Immutable versions.** Editing content creates a new `PromptVersion`; analyses belong to a version. Comparisons diff masked text and match vulnerabilities by rule + matched text.
8. **Consistent API envelope and errors.** `sendSuccess`/`sendError` plus a single error handler convert `AppError`, Zod, Multer, body-parser and Prisma errors into safe messages.

## Frontend structure
- `layouts/AppLayout` – responsive shell: off-canvas sidebar on small screens, topbar with analysis mode and user menu.
- `context/AuthContext` – session state, token persistence, automatic logout on expiry or revoked sessions (Axios interceptor).
- `pages/` – lazily loaded route components; each handles loading (skeletons), empty and error states.
- `components/` – reusable design system (glass panels, score ring, badges, data table, modal, toasts) and domain components (category cards, findings, recommendations, prompt editor, version comparison, charts).

## Request flow: "Analyze Prompt"
```
NewAnalysisPage → POST /api/prompts            (create v1, validation enforced)
                → POST /api/prompts/:id/analyze (202 + analysisId)
                        └─ analysis.service.startAnalysis → executeAnalysis (background)
                              └─ runSecurityScan: INITIALIZING → 5 scanners → SCORING → RECOMMENDATIONS
                              └─ persist results in one transaction
AnalysisProgressPage → polls GET /api/analyses/:id/status → shows real stages
AnalysisResultPage   → GET /api/analyses/:id
```
