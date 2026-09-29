import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { SeverityCounts } from '../../types/api';
import { formatDate } from '../../utils/format';
import { SEVERITY_ORDER, SEVERITY_TONES } from '../../utils/risk';

const AXIS = { fill: '#64748b', fontSize: 11 };
const GRID = 'rgba(148,163,184,0.08)';
const TOOLTIP = {
  contentStyle: { background: '#0d121e', border: '1px solid rgba(148,163,184,0.18)', borderRadius: 12, fontSize: 12, color: '#e2e8f0' },
  labelStyle: { color: '#94a3b8' },
  itemStyle: { color: '#e2e8f0' },
};

export function ScoreTrendChart({ data }: { data: Array<{ date: string; score: number; label: string }> }) {
  const points = data.map((point) => ({ ...point, day: formatDate(point.date) }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={points} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="day" tick={AXIS} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis domain={[0, 100]} tick={AXIS} tickLine={false} axisLine={false} />
        <Tooltip {...TOOLTIP} formatter={(value) => [`${String(value)} / 100`, 'Score']} labelFormatter={(_, payload) => String(payload?.[0]?.payload?.label ?? '')} />
        <Area type="monotone" dataKey="score" stroke="#22d3ee" strokeWidth={2} fill="url(#trendFill)" dot={{ r: 2.5, fill: '#22d3ee' }} activeDot={{ r: 5 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export interface RadarSeries {
  key: string;
  name: string;
  color: string;
}

export function CategoryRadarChart({
  data,
  series = [{ key: 'score', name: 'Score', color: '#22d3ee' }],
  height = 260,
}: {
  data: Array<Record<string, string | number | null>>;
  series?: RadarSeries[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke="rgba(148,163,184,0.15)" />
        <PolarAngleAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        {series.map((s) => (
          <Radar key={s.key} name={s.name} dataKey={s.key} stroke={s.color} fill={s.color} fillOpacity={0.18} strokeWidth={2} />
        ))}
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />}
        <Tooltip {...TOOLTIP} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

export function ActivityChart({ data }: { data: Array<{ date: string; count: number }> }) {
  const points = data.map((point) => ({ ...point, day: new Date(point.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={points} margin={{ top: 10, right: 8, left: -24, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="day" tick={AXIS} tickLine={false} axisLine={false} interval={1} />
        <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
        <Tooltip {...TOOLTIP} cursor={{ fill: 'rgba(148,163,184,0.06)' }} formatter={(value) => [String(value), 'Analyses']} />
        <Bar dataKey="count" radius={[6, 6, 0, 0]} fill="#818cf8" maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SeverityChart({ counts }: { counts: SeverityCounts }) {
  const data = SEVERITY_ORDER.filter((s) => s !== 'INFO').map((severity) => ({
    severity: SEVERITY_TONES[severity].label,
    count: counts[severity],
    color: SEVERITY_TONES[severity].hex,
  }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="severity" tick={{ fill: '#cbd5e1', fontSize: 12 }} tickLine={false} axisLine={false} width={64} />
        <Tooltip {...TOOLTIP} cursor={{ fill: 'rgba(148,163,184,0.06)' }} formatter={(value) => [String(value), 'Findings']} />
        <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={20}>
          {data.map((entry) => (
            <Cell key={entry.severity} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
