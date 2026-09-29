import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
  /** Hide this column in the stacked mobile layout. */
  hideOnMobile?: boolean;
}

/** Table on desktop, stacked cards on mobile. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  onRowClick,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption?: string;
  onRowClick?: (row: T) => void;
}) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="border-b border-white/[0.08] text-[11px] tracking-[0.14em] text-slate-500 uppercase">
              {columns.map((column) => (
                <th key={column.key} scope="col" className={cn('px-4 py-3 font-medium', column.className)}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn('border-b border-white/[0.04] transition hover:bg-white/[0.03]', onRowClick && 'cursor-pointer')}
              >
                {columns.map((column) => (
                  <td key={column.key} className={cn('px-4 py-3.5 align-middle', column.className)}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-3 md:hidden">
        {rows.map((row) => (
          <li key={rowKey(row)} className="glass rounded-xl p-4">
            {columns
              .filter((column) => !column.hideOnMobile)
              .map((column) => (
                <div key={column.key} className="flex items-center justify-between gap-4 py-1.5">
                  <span className="text-[11px] tracking-wider text-slate-500 uppercase">{column.header}</span>
                  <span className="min-w-0 text-right text-sm">{column.render(row)}</span>
                </div>
              ))}
          </li>
        ))}
      </ul>
    </>
  );
}
