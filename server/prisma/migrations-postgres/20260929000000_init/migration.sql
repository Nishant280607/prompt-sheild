-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prompt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptVersion" (
    "id" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "changeNote" TEXT,
    "source" TEXT NOT NULL DEFAULT 'EDITOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Analysis" (
    "id" TEXT NOT NULL,
    "promptVersionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "mode" TEXT NOT NULL DEFAULT 'LOCAL',
    "provider" TEXT NOT NULL DEFAULT 'local',
    "currentStage" TEXT,
    "stageLog" TEXT NOT NULL DEFAULT '[]',
    "overallScore" INTEGER,
    "riskLevel" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisCategoryResult" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "detected" BOOLEAN NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "explanation" TEXT NOT NULL,
    "details" TEXT NOT NULL DEFAULT '{}',
    "durationMs" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "AnalysisCategoryResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL,
    "categoryResultId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "line" INTEGER,
    "column" INTEGER,
    "startOffset" INTEGER,
    "endOffset" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'LOCAL',

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT,
    "priority" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "actions" TEXT NOT NULL DEFAULT '[]',
    "relatedRuleIds" TEXT NOT NULL DEFAULT '[]',

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Prompt_userId_updatedAt_idx" ON "Prompt"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PromptVersion_promptId_versionNumber_key" ON "PromptVersion"("promptId", "versionNumber");

-- CreateIndex
CREATE INDEX "Analysis_promptVersionId_idx" ON "Analysis"("promptVersionId");

-- CreateIndex
CREATE INDEX "Analysis_status_idx" ON "Analysis"("status");

-- CreateIndex
CREATE INDEX "Analysis_createdAt_idx" ON "Analysis"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisCategoryResult_analysisId_category_key" ON "AnalysisCategoryResult"("analysisId", "category");

-- CreateIndex
CREATE INDEX "Finding_categoryResultId_idx" ON "Finding"("categoryResultId");

-- CreateIndex
CREATE INDEX "Finding_severity_idx" ON "Finding"("severity");

-- CreateIndex
CREATE UNIQUE INDEX "Recommendation_analysisId_code_key" ON "Recommendation"("analysisId", "code");

-- AddForeignKey
ALTER TABLE "Prompt" ADD CONSTRAINT "Prompt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptVersion" ADD CONSTRAINT "PromptVersion_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "Prompt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Analysis" ADD CONSTRAINT "Analysis_promptVersionId_fkey" FOREIGN KEY ("promptVersionId") REFERENCES "PromptVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisCategoryResult" ADD CONSTRAINT "AnalysisCategoryResult_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_categoryResultId_fkey" FOREIGN KEY ("categoryResultId") REFERENCES "AnalysisCategoryResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
