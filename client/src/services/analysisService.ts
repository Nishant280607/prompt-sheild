import type {
  AnalysisDetail,
  AnalysisStatusResponse,
  AnalysisSummary,
  ApiSuccess,
  DashboardSummary,
  Paginated,
  RecommendationsOverview,
  SystemStatus,
  VulnerabilityReport,
} from '../types/api';
import { api, unwrap } from './api';

export interface HistoryQuery {
  search?: string;
  status?: string;
  riskLevel?: string;
  promptId?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export const analysisService = {
  list: (params: HistoryQuery) => unwrap(api.get<ApiSuccess<Paginated<AnalysisSummary>>>('/analyses', { params })),
  get: (id: string) => unwrap(api.get<ApiSuccess<AnalysisDetail>>(`/analyses/${id}`)),
  status: (id: string) => unwrap(api.get<ApiSuccess<AnalysisStatusResponse>>(`/analyses/${id}/status`)),
  report: (id: string) => unwrap(api.get<ApiSuccess<VulnerabilityReport>>(`/analyses/${id}/report`)),
  /** Downloads the server-generated PDF as a Blob (the auth header cannot be sent by a plain link). */
  pdf: async (id: string, disposition: 'inline' | 'attachment' = 'attachment') => {
    const response = await api.get<Blob>(`/analyses/${id}/pdf`, { params: { disposition }, responseType: 'blob' });
    const header = String(response.headers['content-disposition'] ?? '');
    const filename = /filename="([^"]+)"/.exec(header)?.[1] ?? `prompt-shield-report-${id}.pdf`;
    return { blob: response.data, filename };
  },
  remove: (id: string) => api.delete(`/analyses/${id}`),
};

export const dashboardService = {
  summary: () => unwrap(api.get<ApiSuccess<DashboardSummary>>('/dashboard/summary')),
  recommendations: () => unwrap(api.get<ApiSuccess<RecommendationsOverview>>('/recommendations')),
  systemStatus: () => unwrap(api.get<ApiSuccess<SystemStatus>>('/system/status')),
};
