import { Download, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../components/ui/Button';
import { Card, Eyebrow } from '../components/ui/Card';
import { ErrorState, LoadingState } from '../components/ui/States';
import { useDocumentTitle } from '../hooks/useAsync';
import { analysisService } from '../services/analysisService';
import { downloadBlob, getErrorMessage } from '../utils/helpers';

export default function PdfPreviewPage() {
  const { id = '' } = useParams();
  useDocumentTitle('PDF report');
  const [file, setFile] = useState<{ blob: Blob; filename: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let url: string | null = null;
    let active = true;
    setError(null);
    setFile(null);
    analysisService
      .pdf(id, 'inline')
      .then(({ blob, filename }) => {
        if (!active) return;
        url = URL.createObjectURL(blob);
        setFile({ blob, filename, url });
      })
      .catch((pdfError: unknown) => active && setError(getErrorMessage(pdfError, 'The PDF report could not be generated.')));
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, attempt]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Epic 5 · Reporting</Eyebrow>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">PDF Report Preview</h1>
          <p className="mt-1 text-sm text-slate-400">
            Generated on the server with PDFKit ·{' '}
            <Link to={`/analyses/${id}`} className="text-accent hover:underline">back to results</Link>
          </p>
        </div>
        {file && (
          <div className="flex gap-2">
            <a href={file.url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 text-sm text-slate-100 hover:bg-white/[0.1]">
              <ExternalLink className="h-4 w-4" aria-hidden="true" /> Open in new tab
            </a>
            <Button icon={<Download className="h-4 w-4" />} onClick={() => downloadBlob(file.blob, file.filename)}>
              Download PDF
            </Button>
          </div>
        )}
      </div>

      {error && <ErrorState title="PDF generation failed" message={error} onRetry={() => setAttempt((a) => a + 1)} />}
      {!error && !file && <LoadingState label="Generating PDF report" />}
      {file && (
        <Card className="overflow-hidden p-2">
          <iframe src={file.url} title="PDF report preview" className="h-[78vh] w-full rounded-xl bg-white" />
          <p className="px-3 py-2 text-xs text-slate-500">If the preview is empty on your device, use "Download PDF" instead.</p>
        </Card>
      )}
    </div>
  );
}
