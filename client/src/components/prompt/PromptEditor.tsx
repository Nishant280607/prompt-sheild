import { useMemo, useRef, type ReactNode } from 'react';
import type { Highlight, Severity } from '../../types/api';
import { cn } from '../../utils/cn';

const MARK_STYLES: Record<Severity | 'placeholder', string> = {
  CRITICAL: 'bg-rose-500/30 shadow-[inset_0_-2px_0_#fb7185]',
  HIGH: 'bg-orange-500/25 shadow-[inset_0_-2px_0_#fb923c]',
  MEDIUM: 'bg-amber-400/20 shadow-[inset_0_-2px_0_#fbbf24]',
  LOW: 'bg-blue-400/20 shadow-[inset_0_-2px_0_#60a5fa]',
  INFO: 'bg-slate-400/15',
  placeholder: 'bg-cyan-400/15 shadow-[inset_0_-1px_0_#22d3ee]',
};

interface Range {
  start: number;
  end: number;
  style: keyof typeof MARK_STYLES;
}

function renderLine(line: string, lineStart: number, ranges: Range[]): ReactNode[] {
  const lineEnd = lineStart + line.length;
  const relevant = ranges.filter((r) => r.start < lineEnd && r.end > lineStart);
  if (relevant.length === 0) return [line];
  const parts: ReactNode[] = [];
  let cursor = lineStart;
  for (const range of relevant) {
    const from = Math.max(range.start, cursor, lineStart);
    const to = Math.min(range.end, lineEnd);
    if (to <= from) continue;
    if (from > cursor) parts.push(line.slice(cursor - lineStart, from - lineStart));
    parts.push(
      <mark key={`${from}-${to}`} className={cn('rounded-[3px] text-transparent', MARK_STYLES[range.style])}>
        {line.slice(from - lineStart, to - lineStart)}
      </mark>,
    );
    cursor = to;
  }
  if (cursor < lineEnd) parts.push(line.slice(cursor - lineStart));
  return parts;
}

/**
 * Developer-style prompt editor: line numbers plus highlighting of suspicious text.
 * A transparent textarea sits on top of a mirrored "backdrop" that renders the highlights.
 */
export function PromptEditor({
  id,
  value,
  onChange,
  highlights = [],
  highlightsFor,
  invalid = false,
  describedBy,
  placeholder = 'Paste or write the system prompt you want to analyse...',
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  highlights?: Highlight[];
  /** Content the highlights were computed for - stale highlights are hidden while typing. */
  highlightsFor?: string;
  invalid?: boolean;
  describedBy?: string;
  placeholder?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lines = value.split('\n');

  const ranges = useMemo<Range[]>(() => {
    const result: Range[] = [];
    if (highlightsFor === value) {
      for (const h of highlights) result.push({ start: h.start, end: h.end, style: h.severity });
    }
    for (const match of value.matchAll(/\{\{\s*[\w.-]+\s*\}\}/g)) {
      result.push({ start: match.index, end: match.index + match[0].length, style: 'placeholder' });
    }
    return result.sort((a, b) => a.start - b.start);
  }, [highlights, highlightsFor, value]);

  let offset = 0;
  const rendered = lines.map((line, index) => {
    const start = offset;
    offset += line.length + 1;
    return (
      <div key={index} className="flex">
        <span className="w-12 shrink-0 pr-3 text-right text-slate-600 select-none">{index + 1}</span>
        <span className="min-w-0 flex-1 pr-4 break-words whitespace-pre-wrap text-transparent">
          {renderLine(line, start, ranges)}
          {'\u200B'}
        </span>
      </div>
    );
  });

  return (
    <div
      className={cn(
        'relative max-h-[34rem] min-h-[18rem] overflow-y-auto rounded-xl border bg-ink-900/80 font-mono text-[13px] leading-6 transition focus-within:ring-2',
        invalid ? 'border-rose-400/50 focus-within:ring-rose-400/20' : 'border-white/10 focus-within:border-accent/50 focus-within:ring-accent/15',
      )}
      onClick={() => textareaRef.current?.focus()}
    >
      <div className="relative min-h-[18rem] py-3">
        <div aria-hidden="true" className="pointer-events-none">
          {rendered}
        </div>
        <textarea
          ref={textareaRef}
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          placeholder={placeholder}
          className="absolute inset-y-0 right-0 left-12 resize-none overflow-hidden bg-transparent py-3 pr-4 break-words whitespace-pre-wrap text-slate-100 caret-accent outline-none placeholder:text-slate-600"
        />
      </div>
    </div>
  );
}
