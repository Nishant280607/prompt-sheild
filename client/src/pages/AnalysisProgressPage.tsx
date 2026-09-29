import { ArrowRight, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ScannerStatus, type DisplayStage } from '../components/analysis/ScannerStatus';
import { RiskBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, Eyebrow } from '../components/ui/Card';
import { ScoreRing } from '../components/ui/ScoreRing';
import { ErrorState } from '../components/ui/States';
import { useDocumentTitle } from '../hooks/useAsync';
import { analysisService } from '../services/analysisService';
import { promptService } from '../services/promptService';
import type { AnalysisStatusResponse, StageKey } from '../types/api';
import { formatDuration } from '../utils/format';
import { getErrorMessage } from '../utils/helpers';

const STAGES: Array<{ key: StageKey; label: string }> = [
  { key: 'INITIALIZING', label: 'Initializing scanner' },
  { key: 'INJECTION', label: 'Checking injection' },
  { key: 'JAILBREAK', label: 'Checking jailbreak' },
  { key: 'LEAKAGE', label: 'Checking leakage' },
  { key: 'CONSISTENCY', label: 'Checking consistency' },
  { key: 'TOKEN_COST', label: 'Analysing token cost' },
  { key: 'SCORING', label: 'Calculating security score' },
  { key: 'RECOMMENDATIONS', label: 'Generating recommendations' },
  { key: 'COMPLETE', label: 'Analysis complete' },
];
/** Minimum time each real stage stays visible, so fast local scans remain readable. */
const REVEAL_MS = 420;

export default function AnalysisProgressPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  useDocumentTitle('Analysing');
  const [status, setStatus] = useState<AnalysisStatusResponse | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  // Poll the backend for the real stage log
  useEffect(() => {
    let timer: number | undefined;
    let active = true;
    const poll = async () => {
      try {
        const next = await analysisService.status(id);
        if (!active) return;
        setStatus(next);
        if (next.status === 'RUNNING' || next.status === 'PENDING') timer = window.setTimeout(poll, 500);
      } catch (pollError) {
        if (active) setError(getErrorMessage(pollError));
      }
    };
    void poll();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [id]);

  const completedOnServer = status?.stages.filter((stage) => stage.status === 'completed').length ?? 0;

  // Reveal completed backend stages one at a time
  useEffect(() => {
    if (revealed >= completedOnServer) return;
    const timer = window.setTimeout(() => setRevealed((value) => value + 1), REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [revealed, completedOnServer]);

  const finished = status?.status === 'COMPLETED' && revealed >= STAGES.length;
  const failed = status?.status === 'FAILED';

  useEffect(() => {
    if (!finished) return;
    const timer = window.setTimeout(() => navigate(`/analyses/${id}`, { replace: true }), 2200);
    return () => window.clearTimeout(timer);
  }, [finished, id, navigate]);

  const stages: DisplayStage[] = useMemo(
    () =>
      STAGES.map((stage, index) => {
        const event = status?.stages.find((e) => e.stage === stage.key);
        if (index < revealed) return { ...stage, state: 'done', summary: event?.summary, durationMs: event?.durationMs };
        if (failed && event?.status === 'failed') return { ...stage, state: 'failed', summary: 'Stage failed' };
        if (index === revealed && !failed) return { ...stage, state: 'active' };
        return { ...stage, state: 'pending' };
      }),
    [status, revealed, failed],
  );

  const progress = Math.round((Math.min(revealed, STAGES.length) / STAGES.length) * 100);

  const retry = async () => {
    if (!status) return;
    setRetrying(true);
    try {
      const started = await promptService.analyze(status.prompt.id);
      navigate(`/analyses/${started.analysisId}/progress`, { replace: true });
      window.location.reload();
    } catch (retryError) {
      setError(getErrorMessage(retryError));
      setRetrying(false);
    }
  };

  if (error) return <ErrorState title="Could not follow the analysis" message={error} onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>Epic 2 · Security scanning engine</Eyebrow>
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{finished ? 'Analysis complete' : failed ? 'Analysis failed' : 'Scanning prompt…'}</h1>
        <p className="mt-1 text-sm text-slate-400">
          {status ? `${status.prompt.title} · version ${status.versionNumber} · ${status.mode === 'AI_ENHANCED' ? 'AI Enhanced' : 'Local Analysis Mode'}` : 'Connecting to the scanner…'}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Card className="flex flex-col items-center justify-center p-8">
          {finished && status?.overallScore !== null && status?.overallScore !== undefined ? (
            <div className="flex animate-fade-up flex-col items-center text-center">
              <ScoreRing score={status.overallScore} size={200} />
              <RiskBadge level={status.riskLevel} className="mt-4" />
              <p className="mt-3 text-sm text-slate-400">Opening the full results…</p>
              <Button className="mt-5" icon={<ArrowRight className="h-4 w-4" />} onClick={() => navigate(`/analyses/${id}`, { replace: true })}>
                View results now
              </Button>
            </div>
          ) : failed ? (
            <div className="text-center">
              <ErrorState message={status?.errorMessage ?? 'The analysis could not be completed.'} />
              <Button className="mt-4" icon={<RefreshCw className="h-4 w-4" />} loading={retrying} onClick={retry}>
                Retry analysis
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <div className="relative h-56 w-56" aria-hidden="true">
                <div className="absolute inset-0 rounded-full border border-accent/25" />
                <div className="absolute inset-7 rounded-full border border-accent/15" />
                <div className="absolute inset-14 rounded-full border border-accent/10" />
                <div className="absolute inset-0 animate-sweep rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,rgba(34,211,238,0.35)_70deg,transparent_72deg)]" />
                <div className="absolute inset-0 grid place-items-center">
                  <span className="font-display text-4xl font-semibold text-slate-50 tabular-nums">{progress}%</span>
                </div>
              </div>
              <p className="mt-6 font-mono text-xs tracking-[0.2em] text-accent uppercase" role="status" aria-live="polite">
                {stages.find((s) => s.state === 'active')?.label ?? 'Initializing'}
              </p>
            </div>
          )}
        </Card>

        <Card className="p-4 sm:p-5">
          <ScannerStatus stages={stages} />
        </Card>
      </div>

      <Card className="p-5">
        <p className="text-[11px] font-semibold tracking-[0.2em] text-slate-500 uppercase">Scanner log</p>
        <div className="mt-3 max-h-52 overflow-y-auto rounded-xl bg-black/40 p-4 font-mono text-[12px] leading-6">
          {stages
            .filter((stage) => stage.state === 'done')
            .map((stage) => (
              <p key={stage.key} className="text-slate-400">
                <span className="text-emerald-400">✓</span> <span className="text-slate-200">{stage.key.padEnd(15, ' ')}</span> {stage.summary}
                {stage.durationMs !== undefined && <span className="text-slate-600"> ({formatDuration(stage.durationMs)})</span>}
              </p>
            ))}
          {!finished && !failed && <p className="animate-pulse-soft text-accent">▌</p>}
        </div>
      </Card>
    </div>
  );
}
