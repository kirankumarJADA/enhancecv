import type { ReactNode } from 'react';

export function Logo({ className = '', light = false }: { className?: string; light?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
        <svg viewBox="0 0 32 32" className="h-5 w-5" fill="currentColor" aria-hidden="true">
          <path d="M9 22.5 15.5 9h1.4L23.5 22.5h-2.6l-1.6-3.4h-6.6l-1.6 3.4H9zm4.7-5.5h4.6L16 11.6l-2.3 5.4z" />
        </svg>
      </span>
      <span className={`text-lg font-bold tracking-tight ${light ? 'text-white' : 'text-ink-900'}`}>
        Enhance<span className="text-brand-600">CV</span>
      </span>
    </span>
  );
}

export function ScoreRing({
  score,
  size = 96,
  label,
  tone,
}: {
  score: number;
  size?: number;
  label?: string;
  tone?: 'good' | 'mid' | 'low';
}) {
  const clamped = Math.max(0, Math.min(100, score));
  const t = tone || (clamped >= 75 ? 'good' : clamped >= 50 ? 'mid' : 'low');
  const stroke = t === 'good' ? '#059669' : t === 'mid' ? '#d97706' : '#dc2626';
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;
  return (
    <div className="inline-flex flex-col items-center" role="img" aria-label={`${label || 'Score'}: ${clamped} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef0f4" strokeWidth={8} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset .6s ease' }}
        />
        <text
          x="50%"
          y="50%"
          dominantBaseline="central"
          textAnchor="middle"
          className="rotate-90"
          style={{ transformOrigin: 'center', transformBox: 'fill-box', fontSize: size * 0.24, fontWeight: 700, fill: '#101828' }}
        >
          {clamped}
        </text>
      </svg>
      {label && <span className="mt-1 text-xs font-medium text-ink-500">{label}</span>}
    </div>
  );
}

export function ScoreBar({ label, score, hint }: { label: string; score: number; hint?: string }) {
  const color = score >= 75 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-sm font-medium text-ink-700">{label}</span>
        <span className="text-sm font-semibold text-ink-900">{score}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100" role="presentation">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, score)}%`, transition: 'width .5s ease' }} />
      </div>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  matched: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  partial: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  missing: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  unknown: 'bg-ink-100 text-ink-600 ring-1 ring-ink-200',
};

export function StatusChip({ status, children }: { status: string; children: ReactNode }) {
  return <span className={`chip ${STATUS_STYLES[status] || STATUS_STYLES.unknown}`}>{children}</span>;
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-label="Loading" role="status">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export function PageSpinner() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-ink-400">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-8 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6" aria-hidden="true">
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" strokeLinecap="round" />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-ink-900">{title}</h3>
      <p className="max-w-md text-sm text-ink-500">{body}</p>
      {action}
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink-900/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white p-6 shadow-lift">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
          <button className="btn-ghost" onClick={onClose} aria-label="Close dialog">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
