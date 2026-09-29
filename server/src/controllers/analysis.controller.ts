import type { Request, Response } from 'express';
import { getAuthUser } from '../middleware/auth.js';
import {
  deleteAnalysis,
  getAnalysisDetail,
  getAnalysisStatus,
  listAnalyses,
} from '../services/analysis.service.js';
import { generateReportPdf } from '../services/pdf.service.js';
import { buildReport } from '../services/report.service.js';
import { AppError } from '../utils/AppError.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { logger } from '../utils/logger.js';
import type { ListAnalysesQuery } from '../validators/prompt.schemas.js';

function analysisId(req: Request): string {
  const id = req.params.id;
  if (typeof id !== 'string' || !id) throw AppError.badRequest('INVALID_ID', 'An analysis id is required.');
  return id;
}

export async function list(req: Request, res: Response) {
  sendSuccess(res, await listAnalyses(getAuthUser(req).id, res.locals.query as ListAnalysesQuery));
}

export async function get(req: Request, res: Response) {
  sendSuccess(res, await getAnalysisDetail(getAuthUser(req).id, analysisId(req)));
}

/** Lightweight endpoint polled by the progress page. */
export async function status(req: Request, res: Response) {
  sendSuccess(res, await getAnalysisStatus(getAuthUser(req).id, analysisId(req)));
}

export async function report(req: Request, res: Response) {
  sendSuccess(res, await buildReport(getAuthUser(req).id, analysisId(req)));
}

export async function pdf(req: Request, res: Response) {
  const data = await buildReport(getAuthUser(req).id, analysisId(req));
  let file: Buffer;
  try {
    file = await generateReportPdf(data);
  } catch (error) {
    logger.error('PDF generation failed', error);
    throw new AppError(500, 'PDF_GENERATION_FAILED', 'The PDF report could not be generated. Please try again.');
  }
  const slug = data.prompt.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'prompt';
  const disposition = req.query.disposition === 'inline' ? 'inline' : 'attachment';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${disposition}; filename="prompt-shield-${slug}-v${data.prompt.versionNumber}.pdf"`);
  res.setHeader('Content-Length', String(file.length));
  res.setHeader('Cache-Control', 'no-store');
  res.send(file);
}

export async function remove(req: Request, res: Response) {
  await deleteAnalysis(getAuthUser(req).id, analysisId(req));
  sendSuccess(res, null, 'Analysis deleted.');
}
