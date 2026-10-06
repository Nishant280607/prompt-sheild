import { performance } from 'node:perf_hooks';
import { PAGINATION } from '../config/constants.js';
import { CATEGORY_WEIGHTS } from '../config/scoring.js';
import { prisma } from '../lib/prisma.js';
import {
  analysisDetailInclude,
  analysisSummaryInclude,
  toAnalysisDetail,
  toAnalysisSummary,
} from '../models/analysis.model.js';
import { runSecurityScan } from '../scanners/SecurityScanner.js';
import type { StageEvent } from '../types/analysis.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { parseJson } from '../utils/json.js';
import type { AIProvider } from './ai/AIProvider.js';
import { resolveProvider, type RequestedMode } from './ai/aiService.js';
import { validatePromptContent } from './validation.service.js';

const ownedAnalysisWhere = (userId: string, id: string) => ({ id, promptVersion: { prompt: { userId } } });

export interface StartedAnalysis {
  analysisId: string;
  status: string;
  /** Resolves when the background pipeline has finished (success or failure). */
  completion: Promise<void>;
}

/**
 * Validate the version, create an Analysis record and start the pipeline in the background.
 * The client follows progress through GET /api/analyses/:id/status.
 */
export async function startAnalysis(
  userId: string,
  promptId: string,
  options: { versionId?: string | undefined; mode?: RequestedMode | undefined } = {},
): Promise<StartedAnalysis> {
  const prompt = await prisma.prompt.findFirst({ where: { id: promptId, userId }, select: { id: true } });
  if (!prompt) throw AppError.notFound('PROMPT_NOT_FOUND', 'Prompt not found.');

  const version = options.versionId
    ? await prisma.promptVersion.findFirst({ where: { id: options.versionId, promptId } })
    : await prisma.promptVersion.findFirst({ where: { promptId }, orderBy: { versionNumber: 'desc' } });
  if (!version) throw AppError.notFound('VERSION_NOT_FOUND', 'Prompt version not found.');

  const validation = validatePromptContent(version.content);
  if (!validation.valid) {
    throw AppError.unprocessable('PROMPT_INVALID', 'The prompt failed validation. Fix the errors before running an analysis.', validation);
  }

  const running = await prisma.analysis.findFirst({
    where: { promptVersionId: version.id, status: { in: ['PENDING', 'RUNNING'] } },
  });
  if (running) return { analysisId: running.id, status: running.status, completion: Promise.resolve() };

  const provider = resolveProvider(options.mode ?? 'auto');
  const analysis = await prisma.analysis.create({
    data: {
      promptVersionId: version.id,
      status: 'RUNNING',
      mode: provider.isExternal ? 'AI_ENHANCED' : 'LOCAL',
      provider: provider.name,
      currentStage: 'INITIALIZING',
      startedAt: new Date(),
    },
  });

  return { analysisId: analysis.id, status: 'RUNNING', completion: executeAnalysis(analysis.id, version.content, provider) };
}

/** Run the scanners, record each stage and persist the results. Never throws. */
export async function executeAnalysis(analysisId: string, content: string, provider: AIProvider): Promise<void> {
  const stages: StageEvent[] = [];
  const started = performance.now();
  const saveProgress = (currentStage: string) =>
    prisma.analysis.update({ where: { id: analysisId }, data: { currentStage, stageLog: JSON.stringify(stages) } });

  try {
    const scan = await runSecurityScan(content, provider, {
      onStageStart: async (stage, label) => {
        stages.push({ stage, label, status: 'running', startedAt: new Date().toISOString() });
        await saveProgress(stage);
      },
      onStageComplete: async (stage, summary, durationMs) => {
        const event = stages.findLast((s) => s.stage === stage);
        if (event) Object.assign(event, { status: 'completed', completedAt: new Date().toISOString(), durationMs, summary });
        await saveProgress(stage);
      },
    });

    const finishedAt = new Date();
    stages.push({
      stage: 'COMPLETE',
      label: 'Analysis complete',
      status: 'completed',
      startedAt: finishedAt.toISOString(),
      completedAt: finishedAt.toISOString(),
      durationMs: 0,
      summary: `Security score ${scan.overall.score}/100 (${scan.overall.rating})`,
    });

    await prisma.$transaction(async (tx) => {
      for (const result of scan.results) {
        await tx.analysisCategoryResult.create({
          data: {
            analysisId,
            category: result.category,
            score: result.score,
            riskLevel: result.riskLevel,
            detected: result.detected,
            weight: CATEGORY_WEIGHTS[result.category],
            explanation: result.explanation,
            details: JSON.stringify(result.details),
            durationMs: result.durationMs,
            findings: {
              create: result.findings.map((finding) => ({
                ruleId: finding.ruleId,
                title: finding.title,
                severity: finding.severity,
                evidence: finding.evidence,
                explanation: finding.explanation,
                line: finding.line ?? null,
                column: finding.column ?? null,
                startOffset: finding.startOffset ?? null,
                endOffset: finding.endOffset ?? null,
                source: finding.source,
              })),
            },
          },
        });
      }
      await tx.recommendation.createMany({
        data: scan.recommendations.map((rec) => ({
          analysisId,
          code: rec.code,
          category: rec.category,
          priority: rec.priority,
          title: rec.title,
          description: rec.description,
          actions: JSON.stringify(rec.actions),
          relatedRuleIds: JSON.stringify(rec.relatedRuleIds),
        })),
      });
      await tx.analysis.update({
        where: { id: analysisId },
        data: {
          status: 'COMPLETED',
          mode: scan.aiUsed ? 'AI_ENHANCED' : 'LOCAL',
          overallScore: scan.overall.score,
          riskLevel: scan.overall.riskLevel,
          currentStage: 'COMPLETE',
          stageLog: JSON.stringify(stages),
          completedAt: finishedAt,
          durationMs: Math.round(performance.now() - started),
          errorMessage: scan.aiErrors.length
            ? `The AI provider could not be reached, so local results were used (${scan.aiErrors[0]}).`
            : null,
        },
      });
    });
  } catch (error) {
    logger.error(`Analysis ${analysisId} failed`, error);
    const last = stages.at(-1);
    if (last?.status === 'running') last.status = 'failed';
    await prisma.analysis
      .update({
        where: { id: analysisId },
        data: {
          status: 'FAILED',
          errorMessage: 'The analysis could not be completed. Please try again.',
          stageLog: JSON.stringify(stages),
          completedAt: new Date(),
        },
      })
      .catch((updateError: unknown) => logger.error('Could not mark analysis as failed', updateError));
  }
}

export async function getAnalysisDetail(userId: string, analysisId: string) {
  const row = await prisma.analysis.findFirst({ where: ownedAnalysisWhere(userId, analysisId), include: analysisDetailInclude });
  if (!row) throw AppError.notFound('ANALYSIS_NOT_FOUND', 'Analysis not found.');
  return toAnalysisDetail(row);
}

export async function getAnalysisStatus(userId: string, analysisId: string) {
  const row = await prisma.analysis.findFirst({
    where: ownedAnalysisWhere(userId, analysisId),
    select: {
      id: true,
      status: true,
      mode: true,
      provider: true,
      currentStage: true,
      stageLog: true,
      overallScore: true,
      riskLevel: true,
      errorMessage: true,
      promptVersion: { select: { versionNumber: true, prompt: { select: { id: true, title: true } } } },
    },
  });
  if (!row) throw AppError.notFound('ANALYSIS_NOT_FOUND', 'Analysis not found.');
  return {
    id: row.id,
    status: row.status,
    mode: row.mode,
    provider: row.provider,
    currentStage: row.currentStage,
    stages: parseJson<StageEvent[]>(row.stageLog, []),
    overallScore: row.overallScore,
    riskLevel: row.riskLevel,
    errorMessage: row.errorMessage,
    prompt: row.promptVersion.prompt,
    versionNumber: row.promptVersion.versionNumber,
  };
}

export interface AnalysisListQuery {
  search?: string | undefined;
  status?: string | undefined;
  riskLevel?: string | undefined;
  promptId?: string | undefined;
  sort?: 'newest' | 'oldest' | 'score_desc' | 'score_asc' | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export async function listAnalyses(userId: string, query: AnalysisListQuery) {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(PAGINATION.maxPageSize, Math.max(1, query.pageSize ?? PAGINATION.defaultPageSize));
  const where = {
    promptVersion: {
      prompt: {
        userId,
        ...(query.search ? { title: { contains: query.search } } : {}),
        ...(query.promptId ? { id: query.promptId } : {}),
      },
    },
    ...(query.status ? { status: query.status } : {}),
    ...(query.riskLevel ? { riskLevel: query.riskLevel } : {}),
  };
  const orderBy =
    query.sort === 'oldest'
      ? { createdAt: 'asc' as const }
      : query.sort === 'score_desc'
        ? { overallScore: 'desc' as const }
        : query.sort === 'score_asc'
          ? { overallScore: 'asc' as const }
          : { createdAt: 'desc' as const };

  const [total, rows] = await Promise.all([
    prisma.analysis.count({ where }),
    prisma.analysis.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, include: analysisSummaryInclude }),
  ]);
  return { items: rows.map(toAnalysisSummary), page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function deleteAnalysis(userId: string, analysisId: string) {
  const row = await prisma.analysis.findFirst({ where: ownedAnalysisWhere(userId, analysisId), select: { id: true } });
  if (!row) throw AppError.notFound('ANALYSIS_NOT_FOUND', 'Analysis not found.');
  await prisma.analysis.delete({ where: { id: analysisId } });
}

/**
 * Analyses interrupted by a server restart can never finish - mark them as failed on start-up.
 * With `staleBefore`, only runs whose last progress update is older than that date are failed.
 */
export async function recoverInterruptedAnalyses(staleBefore?: Date): Promise<number> {
  const result = await prisma.analysis.updateMany({
    where: { status: { in: ['PENDING', 'RUNNING'] }, ...(staleBefore ? { updatedAt: { lt: staleBefore } } : {}) },
    data: { status: 'FAILED', errorMessage: 'The analysis was interrupted by a server restart. Please run it again.' },
  });
  return result.count;
}
