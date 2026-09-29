import type {
  ApiSuccess,
  ComparisonResult,
  PromptDetail,
  PromptSummary,
  SamplePrompt,
  UploadResult,
  ValidationResult,
} from '../types/api';
import { api, unwrap } from './api';

export interface PromptInput {
  title: string;
  category: string;
  description?: string | null;
  content: string;
  source?: 'EDITOR' | 'UPLOAD';
}

export type AnalysisModeChoice = 'auto' | 'local';

export const promptService = {
  list: (params: { search?: string; category?: string } = {}) =>
    unwrap(api.get<ApiSuccess<PromptSummary[]>>('/prompts', { params })),
  get: (id: string) => unwrap(api.get<ApiSuccess<PromptDetail>>(`/prompts/${id}`)),
  create: (input: PromptInput) => unwrap(api.post<ApiSuccess<PromptDetail>>('/prompts', input)),
  update: (id: string, input: Partial<Pick<PromptInput, 'title' | 'category' | 'description'>>) =>
    unwrap(api.put<ApiSuccess<PromptDetail>>(`/prompts/${id}`, input)),
  remove: (id: string) => api.delete(`/prompts/${id}`),
  validate: (content: string, signal?: AbortSignal) =>
    unwrap(api.post<ApiSuccess<ValidationResult>>('/prompts/validate', { content }, { signal })),
  upload: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return unwrap(api.post<ApiSuccess<UploadResult>>('/prompts/upload', form));
  },
  createVersion: (id: string, content: string, changeNote?: string) =>
    unwrap(
      api.post<ApiSuccess<{ id: string; versionNumber: number }>>(`/prompts/${id}/versions`, {
        content,
        changeNote: changeNote || null,
      }),
    ),
  analyze: (id: string, options: { versionId?: string; mode?: AnalysisModeChoice } = {}) =>
    unwrap(api.post<ApiSuccess<{ analysisId: string; status: string }>>(`/prompts/${id}/analyze`, options)),
  compare: (id: string, from?: number, to?: number) =>
    unwrap(api.get<ApiSuccess<ComparisonResult>>(`/prompts/${id}/compare`, { params: { from, to } })),
  samples: () => unwrap(api.get<ApiSuccess<SamplePrompt[]>>('/samples')),
};
