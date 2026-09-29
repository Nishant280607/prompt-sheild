import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Logo } from '../components/brand/Logo';

const HIGHLIGHTS = [
  'Prompt injection & jailbreak detection',
  'Secret and personal-data leakage checks',
  'Consistency simulation and token cost estimates',
  'Versioning, comparisons and PDF reports',
];

/** Split layout for the login and registration pages. */
export default function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="noise relative grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden border-r border-white/[0.06] lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="grid-backdrop absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" aria-hidden="true" />
        <div className="absolute top-1/3 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" aria-hidden="true" />
        <Link to="/" className="relative">
          <Logo />
        </Link>
        <div className="relative max-w-md">
          <p className="text-xs font-semibold tracking-[0.25em] text-accent uppercase">AI security command center</p>
          <h2 className="mt-4 text-4xl leading-tight font-semibold">
            Scan every prompt <span className="text-gradient">before it ships.</span>
          </h2>
          <ul className="mt-8 space-y-3">
            {HIGHLIGHTS.map((item) => (
              <li key={item} className="flex items-center gap-3 text-sm text-slate-300">
                <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_#22d3ee]" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-slate-600">Runs fully offline in Local Analysis Mode.</p>
      </section>
      <section className="relative flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm animate-fade-up">
          <Link to="/" className="mb-10 inline-block lg:hidden">
            <Logo />
          </Link>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="mt-1.5 text-sm text-slate-400">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </section>
    </div>
  );
}
