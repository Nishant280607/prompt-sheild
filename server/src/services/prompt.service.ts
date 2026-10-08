import { PROMPT_LIMITS, type PromptCategory, type VersionSource } from '../config/constants.js';
import { containsText, prisma } from '../lib/prisma.js';
import { analysisSummaryInclude, toAnalysisSummary } from '../models/analysis.model.js';
import { maskSensitiveText } from '../scanners/patterns/leakage.patterns.js';
import { AppError } from '../utils/AppError.js';
import { normalizeLineEndings } from '../utils/text.js';
import { getTextStats } from '../utils/tokens.js';
import { validatePromptContent } from './validation.service.js';

export interface CreatePromptInput {
  title: string;
  category: PromptCategory;
  description?: string | null | undefined;
  content: string;
  source?: VersionSource | undefined;
}

/** Validate content and throw a structured 422 error when it cannot be saved. */
export function assertValidContent(content: string) {
  const validation = validatePromptContent(content);
  if (!validation.valid) {
    throw AppError.unprocessable('PROMPT_INVALID', validation.errors[0]?.message ?? 'The prompt is not valid.', validation);
  }
  return validation;
}

export async function findOwnedPrompt(userId: string, promptId: string) {
  const prompt = await prisma.prompt.findFirst({ where: { id: promptId, userId } });
  if (!prompt) throw AppError.notFound('PROMPT_NOT_FOUND', 'Prompt not found.');
  return prompt;
}

const latestAnalysisInclude = {
  where: { status: 'COMPLETED' },
  orderBy: { createdAt: 'desc' as const },
  take: 1,
  include: analysisSummaryInclude,
};

export async function listPrompts(userId: string, query: { search?: string | undefined; category?: string | undefined }) {
  const prompts = await prisma.prompt.findMany({
    where: {
      userId,
      ...(query.search ? { title: containsText(query.search) } : {}),
      ...(query.category ? { category: query.category } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      versions: { orderBy: { versionNumber: 'desc' }, include: { analyses: latestAnalysisInclude } },
    },
  });

  return prompts.map((prompt) => {
    const latestVersion = prompt.versions[0];
    const latestAnalysis = prompt.versions
      .flatMap((version) => version.analyses)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    return {
      id: prompt.id,
      title: prompt.title,
      category: prompt.category,
      description: prompt.description,
      createdAt: prompt.createdAt.toISOString(),
      updatedAt: prompt.updatedAt.toISOString(),
      versionCount: prompt.versions.length,
      latestVersion: latestVersion
        ? {
            id: latestVersion.id,
            versionNumber: latestVersion.versionNumber,
            createdAt: latestVersion.createdAt.toISOString(),
            stats: getTextStats(latestVersion.content),
          }
        : null,
      latestAnalysis: latestAnalysis ? toAnalysisSummary(latestAnalysis) : null,
    };
  });
}

export async function createPrompt(userId: string, input: CreatePromptInput) {
  const content = normalizeLineEndings(input.content);
  assertValidContent(content);
  const prompt = await prisma.prompt.create({
    data: {
      userId,
      title: input.title,
      category: input.category,
      description: input.description ?? null,
      versions: { create: { versionNumber: 1, content, source: input.source ?? 'EDITOR', changeNote: 'Initial version' } },
    },
    include: { versions: true },
  });
  return getPromptDetail(userId, prompt.id);
}

export async function getPromptDetail(userId: string, promptId: string) {
  const prompt = await prisma.prompt.findFirst({
    where: { id: promptId, userId },
    include: {
      versions: {
        orderBy: { versionNumber: 'desc' },
        include: { analyses: { orderBy: { createdAt: 'desc' }, include: analysisSummaryInclude } },
      },
    },
  });
  if (!prompt) throw AppError.notFound('PROMPT_NOT_FOUND', 'Prompt not found.');

  return {
    id: prompt.id,
    title: prompt.title,
    category: prompt.category,
    description: prompt.description,
    createdAt: prompt.createdAt.toISOString(),
    updatedAt: prompt.updatedAt.toISOString(),
    versions: prompt.versions.map((version) => ({
      id: version.id,
      versionNumber: version.versionNumber,
      changeNote: version.changeNote,
      source: version.source,
      createdAt: version.createdAt.toISOString(),
      // The owner can edit the original text; masked text is used for display.
      content: version.content,
      maskedContent: maskSensitiveText(version.content),
      stats: getTextStats(version.content),
      analyses: version.analyses.map(toAnalysisSummary),
      latestAnalysis: version.analyses.find((a) => a.status === 'COMPLETED')
        ? toAnalysisSummary(version.analyses.find((a) => a.status === 'COMPLETED')!)
        : null,
    })),
  };
}

export async function updatePrompt(
  userId: string,
  promptId: string,
  input: { title?: string | undefined; category?: PromptCategory | undefined; description?: string | null | undefined },
) {
  await findOwnedPrompt(userId, promptId);
  await prisma.prompt.update({
    where: { id: promptId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    },
  });
  return getPromptDetail(userId, promptId);
}

export async function deletePrompt(userId: string, promptId: string) {
  await findOwnedPrompt(userId, promptId);
  await prisma.prompt.delete({ where: { id: promptId } });
}

export async function createVersion(
  userId: string,
  promptId: string,
  input: { content: string; changeNote?: string | null | undefined; source?: VersionSource | undefined },
) {
  await findOwnedPrompt(userId, promptId);
  const content = normalizeLineEndings(input.content);
  assertValidContent(content);

  const latest = await prisma.promptVersion.findFirst({ where: { promptId }, orderBy: { versionNumber: 'desc' } });
  if (latest && latest.content.trim() === content.trim()) {
    throw AppError.conflict('NO_CHANGES', 'The content is identical to the latest version. Edit the prompt before saving a new version.');
  }
  const version = await prisma.$transaction(async (tx) => {
    const created = await tx.promptVersion.create({
      data: {
        promptId,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        content,
        changeNote: input.changeNote?.slice(0, PROMPT_LIMITS.changeNoteMax) || null,
        source: input.source ?? 'EDITOR',
      },
    });
    await tx.prompt.update({ where: { id: promptId }, data: { updatedAt: new Date() } });
    return created;
  });
  return {
    id: version.id,
    promptId,
    versionNumber: version.versionNumber,
    changeNote: version.changeNote,
    createdAt: version.createdAt.toISOString(),
    stats: getTextStats(version.content),
  };
}

export async function listVersions(userId: string, promptId: string) {
  const detail = await getPromptDetail(userId, promptId);
  return detail.versions.map(({ content: _content, ...version }) => version);
}

export async function getVersion(userId: string, promptId: string, versionNumber: number) {
  const detail = await getPromptDetail(userId, promptId);
  const version = detail.versions.find((v) => v.versionNumber === versionNumber);
  if (!version) throw AppError.notFound('VERSION_NOT_FOUND', `Version ${versionNumber} does not exist.`);
  return { prompt: { id: detail.id, title: detail.title, category: detail.category }, ...version };
}
