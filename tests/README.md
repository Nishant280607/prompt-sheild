# Tests

| Suite | Location | Command | What it covers |
| --- | --- | --- | --- |
| Backend unit tests | `server/tests/unit` | `npm run test:server` | Injection, jailbreak, leakage, consistency and token scanners; scoring; recommendations; validation; upload parsing |
| Backend API tests | `server/tests/api` | `npm run test:server` | Auth (hashing, JWT expiry, revocation), prompt CRUD & ownership, versions, uploads, analysis pipeline, reports, PDF, comparison, dashboard |
| Frontend tests | `client/src/test` | `npm run test:client` | Token estimate parity, score bands, ScoreRing, badges, PromptEditor, login form validation |
| End-to-end smoke test | `tests/smoke/demo-flow.mjs` | `npm run test:smoke` | The complete demo flow against a **running** backend |

`npm test` runs the backend and frontend suites. API tests use a throwaway SQLite database (`server/test.db`) that is created from the Prisma migrations before the run and deleted afterwards, so they never touch `dev.db`.
