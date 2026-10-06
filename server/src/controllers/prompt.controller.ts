import { waitUntil } from '@vercel/functions';
import type { Request, Response } from 'express';
import { getAuthUser } from '../middleware/auth.js';
import { getAnalysisDetail, startAnalysis } from '../services/analysis.service.js';
import { compareVersions } from '../services/comparison.service.js';
import {
  createPrompt,
  createVersion,
  deletePrompt,
  getPromptDetail,
  getVersion,
  listPrompts,
  listVersions,
  updatePrompt,
} from '../services/prompt.service.js';
import { parseUploadedPrompt } from '../services/upload.service.js';
import { quickScanHighlights, validatePromptContent } from '../services/validation.service.js';
import { AppError } from '../utils/AppError.js';
import { sendSuccess } from '../utils/apiResponse.js';
import type { AnalyzeBody, CompareQuery, ListPromptsQuery } from '../validators/prompt.schemas.js';

function promptId(req: Request): string {
  const id = req.params.id;
  if (typeof id !== 'string' || !id) throw AppError.badRequest('INVALID_ID', 'A prompt id is required.');
  return id;
}

export async function list(req: Request, res: Response) {
  sendSuccess(res, await listPrompts(getAuthUser(req).id, res.locals.query as ListPromptsQuery));
}

export async function create(req: Request, res: Response) {
  sendSuccess(res, await createPrompt(getAuthUser(req).id, req.body), 'Prompt saved as version 1.', 201);
}

export async function get(req: Request, res: Response) {
  sendSuccess(res, await getPromptDetail(getAuthUser(req).id, promptId(req)));
}

export async function update(req: Request, res: Response) {
  sendSuccess(res, await updatePrompt(getAuthUser(req).id, promptId(req), req.body), 'Prompt updated.');
}

export async function remove(req: Request, res: Response) {
  await deletePrompt(getAuthUser(req).id, promptId(req));
  sendSuccess(res, null, 'Prompt deleted.');
}

/** Stateless validation used by the editor while typing. */
export function validateContent(req: Request, res: Response) {
  const { content } = req.body as { content: string };
  const validation = validatePromptContent(content);
  const tooLarge = validation.errors.some((e) => e.code === 'PROMPT_TOO_LARGE');
  sendSuccess(res, { ...validation, highlights: tooLarge ? [] : quickScanHighlights(content) });
}

export async function validateStored(req: Request, res: Response) {
  const detail = await getPromptDetail(getAuthUser(req).id, promptId(req));
  const versionId = (req.body as { versionId?: unknown } | undefined)?.versionId;
  const version = typeof versionId === 'string' ? detail.versions.find((v) => v.id === versionId) : detail.versions[0];
  if (!version) throw AppError.notFound('VERSION_NOT_FOUND', 'Prompt version not found.');
  sendSuccess(res, { versionId: version.id, versionNumber: version.versionNumber, ...validatePromptContent(version.content) });
}

export function upload(req: Request, res: Response) {
  if (!req.file) throw AppError.badRequest('NO_FILE', 'Choose a .txt, .md or .json file to upload.');
  sendSuccess(res, parseUploadedPrompt(req.file), 'File processed. Review the extracted prompt before saving.');
}

/** Starts an analysis. Responds 202 immediately, or 201 with the full result when ?wait=true. */
export async function analyze(req: Request, res: Response) {
  const userId = getAuthUser(req).id;
  const body = req.body as AnalyzeBody;
  const started = await startAnalysis(userId, promptId(req), { versionId: body.versionId, mode: body.mode });
  if (req.query.wait === 'true') {
    await started.completion;
    sendSuccess(res, await getAnalysisDetail(userId, started.analysisId), 'Analysis complete.', 201);
    return;
  }
  // On Vercel, keep the function alive until the background scan finishes (no-op elsewhere).
  waitUntil(started.completion);
  sendSuccess(res, { analysisId: started.analysisId, status: started.status }, 'Analysis started.', 202);
}

export async function versions(req: Request, res: Response) {
  sendSuccess(res, await listVersions(getAuthUser(req).id, promptId(req)));
}

export async function createNewVersion(req: Request, res: Response) {
  sendSuccess(res, await createVersion(getAuthUser(req).id, promptId(req), req.body), 'New version saved.', 201);
}

export async function getOneVersion(req: Request, res: Response) {
  const versionNumber = Number(req.params.versionNumber);
  if (!Number.isInteger(versionNumber) || versionNumber < 1) {
    throw AppError.badRequest('INVALID_VERSION', 'Version number must be a positive integer.');
  }
  sendSuccess(res, await getVersion(getAuthUser(req).id, promptId(req), versionNumber));
}

export async function compare(req: Request, res: Response) {
  const query = res.locals.query as CompareQuery;
  sendSuccess(res, await compareVersions(getAuthUser(req).id, promptId(req), query.from, query.to));
}
