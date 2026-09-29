import { FileText, FileUp, Pencil, Play, RefreshCw } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router';
import { PromptStats, ValidationPanel } from '../components/prompt/ValidationPanel';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, Eyebrow } from '../components/ui/Card';
import { Field, inputClasses } from '../components/ui/FormField';
import { useToast } from '../context/ToastContext';
import { useDocumentTitle } from '../hooks/useAsync';
import { promptService } from '../services/promptService';
import type { UploadResult } from '../types/api';
import { cn } from '../utils/cn';
import { formatCategory, PROMPT_CATEGORIES } from '../utils/format';
import { getErrorMessage } from '../utils/helpers';

const ACCEPTED = ['.txt', '.md', '.markdown', '.json'];
const MAX_BYTES = 256 * 1024;

export default function UploadPage() {
  useDocumentTitle('Upload template');
  const navigate = useNavigate();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('GENERAL');
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!ACCEPTED.includes(extension)) {
      setError(`Unsupported file type "${extension}". Upload a .txt, .md or .json file.`);
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('The file is larger than the 256 KB limit.');
      return;
    }
    setUploading(true);
    try {
      const extracted = await promptService.upload(file);
      setResult(extracted);
      setTitle(extracted.title);
      setCategory(extracted.category);
    } catch (uploadError) {
      setError(getErrorMessage(uploadError));
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void handleFile(event.dataTransfer.files[0]);
  };

  const saveAndAnalyze = async () => {
    if (!result) return;
    setBusy(true);
    try {
      const created = await promptService.create({ title: title.trim(), category, description: result.description, content: result.content, source: 'UPLOAD' });
      const started = await promptService.analyze(created.id, { versionId: created.versions[0]?.id });
      navigate(`/analyses/${started.analysisId}/progress`);
    } catch (saveError) {
      toast.error(getErrorMessage(saveError));
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>Epic 1 · Prompt management</Eyebrow>
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Upload Prompt Template</h1>
        <p className="mt-1 text-sm text-slate-400">Files are read as plain text on the server - they are never executed.</p>
      </div>

      {!result && (
        <Card className="p-6">
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              'flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-16 text-center transition',
              dragging ? 'border-accent bg-accent/[0.06]' : 'border-white/10',
            )}
          >
            <FileUp className="h-10 w-10 text-accent" aria-hidden="true" />
            <p className="mt-4 text-base font-medium">Drag & drop a prompt template</p>
            <p className="mt-1 text-sm text-slate-400">.txt, .md or .json · up to 256 KB</p>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED.join(',')}
              className="sr-only"
              id="prompt-file"
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
            <Button className="mt-6" loading={uploading} onClick={() => inputRef.current?.click()} icon={<FileText className="h-4 w-4" />}>
              Choose file
            </Button>
          </div>
          {error && (
            <p role="alert" className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </p>
          )}
          <div className="mt-6 grid gap-3 text-xs text-slate-400 sm:grid-cols-3">
            <p><span className="font-semibold text-slate-200">.txt</span> - the whole file is the prompt.</p>
            <p><span className="font-semibold text-slate-200">.md</span> - optional front matter with title / category.</p>
            <p><span className="font-semibold text-slate-200">.json</span> - {'{"prompt": "..."}'} or OpenAI {'{"messages": [...]}'}.</p>
          </div>
        </Card>
      )}

      {result && (
        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <Card className="p-5">
            <CardHeader title="Extracted prompt" subtitle={`${result.file.name} · ${(result.file.size / 1024).toFixed(1)} KB · ${result.format.toUpperCase()}`} />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Title" htmlFor="upload-title" error={title.trim().length < 3 ? 'Title must be at least 3 characters.' : undefined}>
                <input id="upload-title" className={inputClasses} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
              </Field>
              <Field label="Category" htmlFor="upload-category">
                <select id="upload-category" className={inputClasses} value={category} onChange={(e) => setCategory(e.target.value)}>
                  {PROMPT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {formatCategory(c)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <pre className="mt-4 max-h-[26rem] overflow-auto rounded-xl border border-white/[0.07] bg-black/30 p-4 font-mono text-xs leading-6 whitespace-pre-wrap text-slate-300">
              {result.content || '(empty)'}
            </pre>
            <div className="mt-3">
              <PromptStats content={result.content} />
            </div>
          </Card>
          <aside className="space-y-6">
            <ValidationPanel validation={result.validation} checking={false} />
            <Card className="space-y-2.5 p-5">
              <Button className="w-full" size="lg" icon={<Play className="h-4 w-4" />} loading={busy} disabled={!result.validation.valid || title.trim().length < 3} onClick={saveAndAnalyze}>
                Save & analyze
              </Button>
              <Button
                variant="outline"
                className="w-full"
                icon={<Pencil className="h-4 w-4" />}
                onClick={() => navigate('/analyze', { state: { title, category, description: result.description, content: result.content, source: 'UPLOAD' } })}
              >
                Open in editor
              </Button>
              <Button variant="ghost" className="w-full" icon={<RefreshCw className="h-4 w-4" />} onClick={() => setResult(null)}>
                Choose another file
              </Button>
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}
