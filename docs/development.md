# Development guide

## Daily workflow
```bash
npm install        # once, or after pulling dependency changes
npm run setup      # once (creates server/.env, database, demo data)
npm run dev        # API :5000 + UI :5173 with hot reload
npm test           # before every push
npm run lint && npm run typecheck
```

## Conventions
- TypeScript strict mode everywhere; ESM on the server (`.js` extensions in relative imports).
- Controllers stay thin; logic goes into `services/`; scanners are pure functions of the prompt text.
- All request input is validated with Zod (`server/src/validators`), all responses use `sendSuccess` / `sendError`.
- Prettier formatting (`npm run format`); ESLint must report no errors.
- Never commit `.env`, databases, `node_modules`, `dist` or `server/src/generated` (see `.gitignore`).
- Test fixtures build fake secrets at runtime (e.g. `['sk','proj',...].join('-')`) so repository secret scanners are not triggered.

## Troubleshooting
| Problem | Fix |
| --- | --- |
| `The database has not been initialised` | `npm run setup` or `npm run db:deploy` |
| Prisma client missing (`Cannot find module '../generated/prisma/client.js'`) | `npm run db:generate -w server` |
| `Cannot reach the Prompt Shield API` in the UI | Start the backend (`npm run dev:server`) on port 5000 |
| Port already in use | Change `PORT` in `server/.env` and `VITE_DEV_API_PROXY` in `client/.env` |
| Windows: `better-sqlite3` build errors | Use Node 22 LTS (prebuilt binaries are available for LTS releases) |

## Git / GitHub workflow
Suggested branch model: `main` (stable) ← `develop` ← `feature/<epic>-<short-name>` branches merged through pull requests with at least one review.

### Suggested commit plan (one commit or PR per feature)
| # | Branch | Commit message | Files |
| --- | --- | --- | --- |
| 1 | `chore/setup` | chore: initialise monorepo, tooling and environment template | `package.json`, `.gitignore`, `.gitattributes`, `.editorconfig`, `.prettierrc.json`, `.env.example`, `scripts/` |
| 2 | `feature/db-schema` | feat(db): add Prisma schema and initial migration | `server/prisma/schema.prisma`, `server/prisma/migrations/`, `server/prisma.config.ts`, `server/src/lib/` |
| 3 | `feature/api-foundation` | feat(api): express app, config, error handling and response envelope | `server/src/app.ts`, `server.ts`, `config/`, `utils/`, `middleware/errorHandler.ts`, `middleware/validate.ts`, `middleware/rateLimit.ts` |
| 4 | `feature/epic1-auth` | feat(auth): registration, login, JWT sessions and profile | `services/auth.service.ts`, `controllers/auth.controller.ts`, `routes/auth.routes.ts`, `middleware/auth.ts`, `validators/auth.schemas.ts`, `tests/api/auth.test.ts` |
| 5 | `feature/epic1-prompts` | feat(prompts): prompt CRUD, validation and template upload | `services/prompt.service.ts`, `validation.service.ts`, `upload.service.ts`, `middleware/upload.ts`, prompt routes/controller, `tests/unit/validation.test.ts` |
| 6 | `feature/epic2-scanners` | feat(scanner): injection, jailbreak, leakage, consistency and token scanners | `server/src/scanners/`, `tests/unit/scanners.test.ts` |
| 7 | `feature/epic3-scoring` | feat(scoring): weighted security score and analysis pipeline | `config/scoring.ts`, `services/scoring.service.ts`, `services/analysis.service.ts`, `models/`, analysis routes/controller |
| 8 | `feature/epic4-recommendations` | feat(insights): recommendation engine, dashboard and history APIs | `services/recommendation.service.ts`, `dashboard.service.ts`, `report.service.ts`, `tests/unit/scoring.test.ts` |
| 9 | `feature/epic5-pdf` | feat(reports): server-side PDF report generation | `services/pdf.service.ts`, `tests/api/analysis.test.ts` |
| 10 | `feature/epic6-versions` | feat(versions): version history and comparison | `services/comparison.service.ts`, version routes, `tests/api/prompts.test.ts` |
| 11 | `feature/ai-providers` | feat(ai): optional OpenAI/Gemini providers with local fallback | `services/ai/` |
| 12 | `feature/seed` | chore(seed): demo account and sample analyses | `server/prisma/seed.ts`, `server/src/data/` |
| 13 | `feature/ui-foundation` | feat(ui): design system, layouts, auth context and routing | `client/` config files, `src/main.tsx`, `App.tsx`, `index.css`, `components/ui`, `navigation`, `brand`, `layouts`, `context`, `hooks`, `services`, `types`, `utils` |
| 14 | `feature/ui-auth-landing` | feat(ui): landing, login and register pages | `pages/LandingPage.tsx`, `LoginPage.tsx`, `RegisterPage.tsx` |
| 15 | `feature/ui-analysis` | feat(ui): editor, upload, progress and result pages | `components/prompt`, `components/analysis`, `pages/NewAnalysisPage.tsx`, `UploadPage.tsx`, `AnalysisProgressPage.tsx`, `AnalysisResultPage.tsx` |
| 16 | `feature/ui-insights` | feat(ui): dashboard, report, recommendations and history | `pages/DashboardPage.tsx`, `VulnerabilityReportPage.tsx`, `RecommendationsPage.tsx`, `HistoryPage.tsx` |
| 17 | `feature/ui-versions` | feat(ui): prompts, versions, comparison, PDF preview and settings | `components/versions`, `pages/PromptsPage.tsx`, `PromptVersionsPage.tsx`, `VersionComparisonPage.tsx`, `PdfPreviewPage.tsx`, `SettingsPage.tsx`, `NotFoundPage.tsx` |
| 18 | `test/frontend-and-smoke` | test: frontend tests and end-to-end smoke test | `client/src/test`, `tests/` |
| 19 | `docs/readme` | docs: README and technical documentation | `README.md`, `docs/` |

Commit message style: [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
