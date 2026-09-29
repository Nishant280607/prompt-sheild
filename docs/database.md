# Database design

SQLite accessed through **Prisma ORM 7** (`server/prisma/schema.prisma`) using the `@prisma/adapter-better-sqlite3` driver adapter. Migrations live in `server/prisma/migrations` and are applied with `npm run db:deploy`.

## Entity relationships
```
User 1 ── * Prompt 1 ── * PromptVersion 1 ── * Analysis 1 ── * AnalysisCategoryResult 1 ── * Finding
                                                     └──── * Recommendation
```
All foreign keys use `ON DELETE CASCADE`: deleting a user removes their prompts, versions and analyses.

## Models
| Model | Key fields | Notes |
| --- | --- | --- |
| **User** | id, name, email (unique), passwordHash, tokenVersion, createdAt, updatedAt | bcrypt hash only; `tokenVersion` revokes sessions after a password change |
| **Prompt** | id, userId, title, description, category, timestamps | Logical prompt; content lives in versions |
| **PromptVersion** | id, promptId, versionNumber, content, changeNote, source, createdAt | Immutable; `@@unique([promptId, versionNumber])` |
| **Analysis** | id, promptVersionId, status, mode, provider, currentStage, stageLog (JSON), overallScore, riskLevel, errorMessage, startedAt, completedAt, durationMs | One scan run of one version |
| **AnalysisCategoryResult** | id, analysisId, category, score, riskLevel, detected, weight, explanation, details (JSON), durationMs | One row per scanner; `@@unique([analysisId, category])` |
| **Finding** | id, categoryResultId, ruleId, title, severity, evidence (masked), explanation, line, column, startOffset, endOffset, source | Evidence is always masked before it is stored |
| **Recommendation** | id, analysisId, code, category, priority, title, description, actions (JSON), relatedRuleIds (JSON) | `@@unique([analysisId, code])` |

## Design notes
- **Normalisation:** findings reference their category result (not the analysis directly), and analyses reference versions; the owning user is always reached through relations, so no user ID is duplicated.
- **Deliberate snapshots:** `weight` and recommendation text are stored with each analysis so historical reports stay reproducible if the scoring configuration or catalogue changes.
- **Enumerations** are stored as strings (validated with Zod in the API) because SQLite has no native enum type.
- **JSON columns** (`stageLog`, `details`, `actions`, `relatedRuleIds`) are stored as TEXT and parsed defensively.
- **Indexes:** `Prompt(userId, updatedAt)`, `Analysis(promptVersionId)`, `Analysis(status)`, `Analysis(createdAt)`, `Finding(categoryResultId)`, `Finding(severity)`.
- **Relative paths:** `DATABASE_URL="file:./dev.db"` is resolved from `server/` by both the Prisma CLI (`prisma.config.ts`) and the application, so both always use `server/dev.db`.

## Changing the schema
```bash
# edit server/prisma/schema.prisma, then:
npm run db:migrate -- --name describe_your_change   # creates + applies a migration, regenerates the client
```
Commit the generated folder in `prisma/migrations`.
