import { zodResolver } from '@hookform/resolvers/zod';
import { Lock, Play, Save, Sparkles, Trash, WandSparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import { PromptEditor } from '../components/prompt/PromptEditor';
import { PromptStats, ValidationPanel } from '../components/prompt/ValidationPanel';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, Eyebrow } from '../components/ui/Card';
import { Field, inputClasses } from '../components/ui/FormField';
import { ErrorState, LoadingState } from '../components/ui/States';
import { useToast } from '../context/ToastContext';
import { useDebouncedValue, useDocumentTitle } from '../hooks/useAsync';
import { promptService, type AnalysisModeChoice } from '../services/promptService';
import type { PromptDetail, SamplePrompt, ValidationResult } from '../types/api';
import { cn } from '../utils/cn';
import { formatCategory, PROMPT_CATEGORIES } from '../utils/format';
import { getErrorMessage } from '../utils/helpers';

const metaSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters.').max(120, 'Title must be at most 120 characters.'),
  category: z.string().min(1),
  description: z.string().max(500, 'Description must be at most 500 characters.'),
});
type Meta = z.infer<typeof metaSchema>;

interface Prefill {
  title?: string;
  category?: string;
  description?: string | null;
  content?: string;
  source?: 'EDITOR' | 'UPLOAD';
}

/** New Prompt Analysis page. Also used at /prompts/:id/edit to create a new version. */
export default function NewAnalysisPage() {
  const { id: promptId } = useParams();
  const editing = Boolean(promptId);
  const location = useLocation();
  const prefill = (location.state as Prefill | null) ?? null;
  const navigate = useNavigate();
  const toast = useToast();
  useDocumentTitle(editing ? 'New version' : 'New analysis');

  const [content, setContent] = useState(prefill?.content ?? '');
  const [changeNote, setChangeNote] = useState('');
  const [mode, setMode] = useState<AnalysisModeChoice>('auto');
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [validatedFor, setValidatedFor] = useState('');
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState<'save' | 'analyze' | 'validate' | null>(null);
  const [samples, setSamples] = useState<SamplePrompt[]>([]);
  const [existing, setExisting] = useState<PromptDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const form = useForm<Meta>({
    resolver: zodResolver(metaSchema),
    defaultValues: { title: prefill?.title ?? '', category: prefill?.category ?? 'GENERAL', description: prefill?.description ?? '' },
  });
  const { errors } = form.formState;

  useEffect(() => {
    promptService.samples().then(setSamples).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!promptId) return;
    promptService
      .get(promptId)
      .then((prompt) => {
        setExisting(prompt);
        setContent(prompt.versions[0]?.content ?? '');
        form.reset({ title: prompt.title, category: prompt.category, description: prompt.description ?? '' });
      })
      .catch((error: unknown) => setLoadError(getErrorMessage(error)));
  }, [promptId, form]);

  // Live validation + pre-scan highlights while typing
  const debounced = useDebouncedValue(content, 450);
  useEffect(() => {
    if (!debounced.trim()) {
      setValidation(null);
      setValidatedFor('');
      return;
    }
    const controller = new AbortController();
    setChecking(true);
    promptService
      .validate(debounced, controller.signal)
      .then((result) => {
        setValidation(result);
        setValidatedFor(debounced);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => controller.abort();
  }, [debounced]);

  const validateNow = async (): Promise<ValidationResult | null> => {
    try {
      const result = await promptService.validate(content);
      setValidation(result);
      setValidatedFor(content);
      return result;
    } catch (error) {
      toast.error(getErrorMessage(error));
      return null;
    }
  };

  const onValidateClick = async () => {
    setBusy('validate');
    const result = await validateNow();
    setBusy(null);
    if (result?.valid) toast.success(`Prompt is valid${result.warnings.length ? ` (${result.warnings.length} warning${result.warnings.length > 1 ? 's' : ''})` : ''}.`);
    else if (result) toast.error(result.errors[0]?.message ?? 'The prompt is not valid.');
  };

  const submit = (analyze: boolean) =>
    form.handleSubmit(async (meta) => {
      const result = await validateNow();
      if (!result) return;
      if (!result.valid) {
        toast.error('Fix the validation errors before saving.');
        return;
      }
      setBusy(analyze ? 'analyze' : 'save');
      try {
        let targetId: string;
        let versionId: string | undefined;
        if (editing && existing) {
          const metaChanged =
            meta.title !== existing.title || meta.category !== existing.category || (meta.description || null) !== existing.description;
          if (metaChanged) await promptService.update(existing.id, { ...meta, description: meta.description || null });
          const unchanged = existing.versions[0]?.content.trim() === content.trim();
          if (!unchanged) {
            const version = await promptService.createVersion(existing.id, content, changeNote);
            versionId = version.id;
            toast.success(`Saved as version ${version.versionNumber}.`);
          } else if (!analyze) {
            toast.info(metaChanged ? 'Details updated. The content is unchanged, so no new version was created.' : 'Nothing changed.');
          }
          targetId = existing.id;
        } else {
          const created = await promptService.create({
            ...meta,
            description: meta.description || null,
            content,
            source: prefill?.source ?? 'EDITOR',
          });
          targetId = created.id;
          versionId = created.versions[0]?.id;
          toast.success('Prompt saved as version 1.');
        }
        if (analyze) {
          const started = await promptService.analyze(targetId, { versionId, mode });
          navigate(`/analyses/${started.analysisId}/progress`);
        } else {
          navigate(`/prompts/${targetId}`);
        }
      } catch (error) {
        toast.error(getErrorMessage(error));
      } finally {
        setBusy(null);
      }
    })();

  const loadSample = (sampleId: string) => {
    const sample = samples.find((s) => s.id === sampleId);
    if (!sample) return;
    setContent(sample.content);
    if (!editing) form.reset({ title: sample.title, category: sample.category, description: sample.description });
    toast.info(`Loaded sample: ${sample.title}`);
  };

  if (loadError) return <ErrorState message={loadError} />;
  if (editing && !existing) return <LoadingState label="Loading prompt" />;

  const invalid = validation !== null && !validation.valid && validatedFor === content;
  // The picker shows the sample that is currently in the editor, and resets once the text is edited.
  const activeSampleId = samples.find((sample) => sample.content === content)?.id ?? '';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>{editing ? `Prompt · currently v${existing?.versions[0]?.versionNumber}` : 'Epic 1 · Prompt management'}</Eyebrow>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{editing ? `New version of "${existing?.title}"` : 'New Prompt Analysis'}</h1>
          <p className="mt-1 text-sm text-slate-400">
            {editing ? 'Edit the prompt, save it as a new version and re-run the security scan.' : 'Write or paste a prompt. Suspicious text is highlighted as you type.'}
          </p>
        </div>
        {!editing && (
          <Link to="/analyze/upload" className="text-sm text-accent hover:underline">
            Upload a template instead
          </Link>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Prompt title" htmlFor="title" error={errors.title?.message} required>
              <input id="title" className={inputClasses} aria-invalid={!!errors.title} placeholder="e.g. Customer Support Assistant" {...form.register('title')} />
            </Field>
            <Field label="Category" htmlFor="category">
              <select id="category" className={inputClasses} {...form.register('category')}>
                {PROMPT_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {formatCategory(category)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Description" htmlFor="description" error={errors.description?.message} className="sm:col-span-2">
              <input id="description" className={inputClasses} placeholder="Optional: what is this prompt for?" {...form.register('description')} />
            </Field>
            {editing && (
              <Field label="Change note" htmlFor="changeNote" className="sm:col-span-2" hint="Describe what changed in this version.">
                <input id="changeNote" className={inputClasses} value={changeNote} onChange={(e) => setChangeNote(e.target.value)} maxLength={300} placeholder="e.g. Added delimiters around user input" />
              </Field>
            )}
          </Card>

          <Card className="p-5">
            <CardHeader title="Prompt content" subtitle="Line numbers, template placeholders and pre-scan highlights" />
            <div className="mt-4 flex items-center gap-2">
              <label htmlFor="sample" className="sr-only">
                Load a sample prompt
              </label>
              <select
                id="sample"
                className={cn(inputClasses, 'h-9 min-w-0 flex-1 py-0 text-xs sm:max-w-xs')}
                value={activeSampleId}
                onChange={(e) => loadSample(e.target.value)}
              >
                <option value="" disabled>
                  Load sample…
                </option>
                {samples.map((sample) => (
                  <option key={sample.id} value={sample.id}>
                    {sample.title}
                  </option>
                ))}
              </select>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                icon={<Trash className="h-3.5 w-3.5" />}
                onClick={() => setContent('')}
                disabled={!content}
                aria-label="Clear prompt"
              >
                Clear
              </Button>
            </div>
            <div className="mt-3">
              <label htmlFor="prompt-content" className="sr-only">
                Prompt content
              </label>
              <PromptEditor
                id="prompt-content"
                value={content}
                onChange={setContent}
                highlights={validation?.highlights}
                highlightsFor={validatedFor}
                invalid={invalid}
                describedBy="prompt-stats"
              />
            </div>
            <div id="prompt-stats" className="mt-3">
              <PromptStats content={content} />
            </div>
          </Card>
        </div>

        <aside className="space-y-6">
          <ValidationPanel validation={validation} checking={checking} highlights={validatedFor === content ? validation?.highlights : []} />

          <Card className="p-5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold">Analysis mode</p>
              <Link to="/settings#analysis-modes" className="text-xs text-accent hover:underline">
                What's the difference?
              </Link>
            </div>
            <div className="mt-3 grid gap-2" role="radiogroup" aria-label="Analysis mode">
              {[
                {
                  value: 'auto' as const,
                  title: 'Auto',
                  text: 'Adds an AI review when an OpenAI or Gemini key is set on the server; otherwise runs Local.',
                  icon: Sparkles,
                },
                { value: 'local' as const, title: 'Local only', text: 'Rule-based scanners only. The prompt never leaves the server.', icon: Lock },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={mode === option.value}
                  onClick={() => setMode(option.value)}
                  className={cn(
                    'flex gap-3 rounded-xl border p-3 text-left transition',
                    mode === option.value ? 'border-accent/50 bg-accent/[0.07]' : 'border-white/10 hover:border-white/20',
                  )}
                >
                  <option.icon className={cn('mt-0.5 h-4 w-4', mode === option.value ? 'text-accent' : 'text-slate-500')} aria-hidden="true" />
                  <span>
                    <span className="block text-sm font-medium text-slate-100">{option.title}</span>
                    <span className="text-xs text-slate-400">{option.text}</span>
                  </span>
                </button>
              ))}
            </div>
          </Card>

          <Card className="space-y-2.5 p-5">
            <Button variant="secondary" className="w-full" icon={<WandSparkles className="h-4 w-4" />} loading={busy === 'validate'} disabled={!content.trim() || busy !== null} onClick={onValidateClick}>
              Validate prompt
            </Button>
            <Button variant="outline" className="w-full" icon={<Save className="h-4 w-4" />} loading={busy === 'save'} disabled={!content.trim() || busy !== null} onClick={() => submit(false)}>
              {editing ? 'Save as new version' : 'Save prompt'}
            </Button>
            <Button className="w-full" size="lg" icon={<Play className="h-4 w-4" />} loading={busy === 'analyze'} disabled={!content.trim() || busy !== null} onClick={() => submit(true)}>
              {editing ? 'Save & analyze version' : 'Start security analysis'}
            </Button>
            <p className="text-center text-[11px] text-slate-500">Invalid prompts cannot be saved or analysed.</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
