# REST API reference

Base URL: `http://localhost:5000/api`. Authenticated endpoints need `Authorization: Bearer <token>`.

## Response envelope
```json
{ "success": true, "data": { }, "message": "optional" }
{ "success": false, "error": { "code": "PROMPT_INVALID", "message": "The prompt is empty.", "details": { } } }
```

Common error codes: `VALIDATION_ERROR` (400), `UNAUTHORIZED` / `INVALID_TOKEN` / `TOKEN_EXPIRED` / `SESSION_REVOKED` / `INVALID_CREDENTIALS` (401), `*_NOT_FOUND` (404), `EMAIL_IN_USE` / `NO_CHANGES` / `ANALYSIS_NOT_COMPLETE` (409), `FILE_TOO_LARGE` / `PAYLOAD_TOO_LARGE` (413), `UNSUPPORTED_FILE_TYPE` (415), `PROMPT_INVALID` / `INVALID_JSON` / `EMPTY_FILE` / `NOT_ENOUGH_VERSIONS` (422), `RATE_LIMITED` (429), `PDF_GENERATION_FAILED` / `INTERNAL_ERROR` (500), `DATABASE_UNAVAILABLE` / `SERVER_NOT_READY` (503 – the API could not start or reach its database; the message says why).

## Authentication
| Method | Path | Body | Result |
| --- | --- | --- | --- |
| POST | `/auth/register` | `{ name, email, password }` | 201 `{ user, token, expiresAt }` |
| POST | `/auth/login` | `{ email, password }` | 200 `{ user, token, expiresAt }` |
| POST | `/auth/logout` | – | 200 (client discards the token) |
| GET | `/auth/me` | – | current user |
| PUT | `/auth/me` | `{ name }` | updated user |
| PUT | `/auth/password` | `{ currentPassword, newPassword }` | new session; older tokens revoked |
| DELETE | `/auth/me` | `{ password }` | deletes the account and all data |

Passwords: 8–128 characters with at least one letter and one number.

## Prompts and versions
| Method | Path | Notes |
| --- | --- | --- |
| GET | `/prompts?search=&category=` | Prompts with latest version and latest analysis summary |
| POST | `/prompts` | `{ title, category, description?, content, source? }` → prompt with v1. Invalid content → 422 `PROMPT_INVALID` with the validation result in `details` |
| POST | `/prompts/validate` | `{ content }` → `{ valid, errors[], warnings[], stats, placeholders[], highlights[] }` |
| POST | `/prompts/upload` | multipart field `file` (.txt/.md/.json, ≤256 KB) → extracted `{ title, category, description, content, format, file, validation }` (not saved) |
| GET | `/prompts/:id` | Prompt with all versions (owner gets raw `content` and `maskedContent`) |
| PUT | `/prompts/:id` | `{ title?, category?, description? }` |
| DELETE | `/prompts/:id` | Cascades to versions and analyses |
| POST | `/prompts/:id/validate` | `{ versionId? }` validates a stored version |
| POST | `/prompts/:id/analyze` | `{ versionId?, mode?: "auto" \| "local" }` → 202 `{ analysisId, status }`; `?wait=true` → 201 full analysis |
| GET | `/prompts/:id/versions` | Version list with analysis summaries |
| POST | `/prompts/:id/versions` | `{ content, changeNote? }` → 201; identical content → 409 `NO_CHANGES` |
| GET | `/prompts/:id/versions/:versionNumber` | Single version |
| GET | `/prompts/:id/compare?from=1&to=2` | `{ verdict, scoreDelta, summary, metrics[], tokens, diff { rows[], stats }, vulnerabilities { introduced, removed, persisting } }` |

Categories: `GENERAL, CUSTOMER_SUPPORT, CODING_ASSISTANT, CONTENT_GENERATION, DATA_EXTRACTION, AGENT_WORKFLOW, RAG_SYSTEM, OTHER`.

## Analyses and reports
| Method | Path | Notes |
| --- | --- | --- |
| GET | `/analyses?search=&status=&riskLevel=&promptId=&sort=&page=&pageSize=` | Paginated history (`sort`: newest, oldest, score_desc, score_asc) |
| GET | `/analyses/:id` | Full result: score, risk, stages, categories with findings, recommendations, masked prompt |
| GET | `/analyses/:id/status` | Lightweight progress: `status`, `currentStage`, `stages[]` |
| GET | `/analyses/:id/report` | Vulnerability report with executive summary, severity counts, projected score |
| GET | `/analyses/:id/pdf?disposition=inline\|attachment` | `application/pdf` |
| DELETE | `/analyses/:id` | Delete an analysis |

Stage keys in order: `INITIALIZING, INJECTION, JAILBREAK, LEAKAGE, CONSISTENCY, TOKEN_COST, SCORING, RECOMMENDATIONS, COMPLETE`.

## Dashboard and system
| Method | Path | Notes |
| --- | --- | --- |
| GET | `/dashboard/summary` | Posture score, category averages, vulnerability and recommendation counts, token usage, trend, activity, recent analyses, analysis mode |
| GET | `/recommendations` | Recommendations from the latest analysis of every prompt |
| GET | `/health` | `{ status, database, storage, sessions }` (public); `storage`/`sessions` are `persistent` or `temporary` |
| GET | `/health/live` | Liveness without the database: `{ status, startup, error? }` – on Vercel, shows whether start-up succeeded and at which step it failed (public) |
| GET | `/system/status` | Analysis mode, configured providers (booleans only), scanners, scoring weights (public) |
| GET | `/samples` | Demo prompts used by the editor |

## Example
```bash
TOKEN=$(curl -s -X POST localhost:5000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"demo@promptshield.local","password":"Demo@12345"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.token')
curl -s localhost:5000/api/dashboard/summary -H "Authorization: Bearer $TOKEN"
```
