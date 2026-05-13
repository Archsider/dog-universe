import type { LucideIcon } from 'lucide-react';

interface Props {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  tone?: 'neutral' | 'success' | 'warn' | 'error';
}

const TONE_CLASSES: Record<NonNullable<Props['tone']>, string> = {
  neutral: 'text-charcoal/70',
  success: 'text-emerald-700',
  warn: 'text-amber-700',
  error: 'text-red-700',
};

/**
 * Small KPI card for the dashboard strip — icon + label + value + optional
 * subline. Tone drives the icon color (the rest of the card stays neutral
 * to keep the strip visually calm).
 */
export function KpiCard({ icon: Icon, label, value, sub, tone = 'neutral' }: Props) {
  return (
    <div className="rounded-xl border border-ivory-200 bg-white p-4 flex items-start gap-3">
      <div className={`${TONE_CLASSES[tone]} flex-shrink-0 mt-0.5`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wide text-charcoal/50 font-medium">
          {label}
        </p>
        <p className="text-lg font-semibold text-charcoal tabular-nums mt-0.5 truncate">
          {value}
        </p>
        {sub && <p className="text-xs text-charcoal/50 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}
