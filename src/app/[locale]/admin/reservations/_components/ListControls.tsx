'use client';

export function KpiCard({
  label, value, active, onClick, accent, accentBg, isText,
}: {
  label: string;
  value: string | number;
  active?: boolean;
  onClick?: () => void;
  accent: string;
  accentBg: string;
  isText?: boolean;
}) {
  const clickable = !!onClick;
  const Tag = clickable ? 'button' : 'div';
  return (
    <Tag
      type={clickable ? 'button' : undefined}
      onClick={onClick}
      className={`text-left bg-white rounded-[12px] p-4 transition-all ${clickable ? 'hover:shadow-card-hover cursor-pointer' : ''}`}
      style={{
        border: `0.5px solid ${active ? accent : 'var(--color-border-tertiary, rgba(0,0,0,0.08))'}`,
        boxShadow: active ? `0 0 0 2px ${accentBg}` : undefined,
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
        <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: accent }}>
          {label}
        </span>
      </div>
      <div className={`font-bold text-charcoal ${isText ? 'text-xl' : 'text-2xl'}`}>{value}</div>
    </Tag>
  );
}

export function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-charcoal text-white'
          : 'bg-white border border-ivory-200 text-gray-600 hover:border-gold-300'
      }`}
    >
      {children}
    </button>
  );
}
