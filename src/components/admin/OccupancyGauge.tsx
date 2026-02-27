'use client';

interface OccupancyGaugeProps {
  current: number;
  capacity: number;
  locale: string;
}

export default function OccupancyGauge({ current, capacity, locale }: OccupancyGaugeProps) {
  const labels = {
    fr: { label: 'Occupation actuelle', places: 'places occupées', of: 'sur' },
    en: { label: 'Current occupancy', places: 'occupied', of: 'of' },
  };
  const l = labels[locale as keyof typeof labels] || labels.fr;

  const percentage = capacity > 0 ? Math.min(100, Math.round((current / capacity) * 100)) : 0;
  const color = percentage >= 90 ? '#EF4444' : percentage >= 70 ? '#F59E0B' : '#C9A84C';

  const radius = 60;
  const circumference = Math.PI * radius; // Half circle
  const strokeDashoffset = circumference * (1 - percentage / 100);

  return (
    <div className="flex flex-col items-center">
      <svg width="160" height="100" viewBox="0 0 160 100">
        {/* Background arc */}
        <path
          d={`M 10 90 A ${radius} ${radius} 0 0 1 150 90`}
          fill="none"
          stroke="#F0EDD8"
          strokeWidth="16"
          strokeLinecap="round"
        />
        {/* Filled arc */}
        <path
          d={`M 10 90 A ${radius} ${radius} 0 0 1 150 90`}
          fill="none"
          stroke={color}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
        <text x="80" y="80" textAnchor="middle" fontSize="22" fontWeight="bold" fill="#2C2C2C">{percentage}%</text>
      </svg>
      <p className="text-sm text-gray-500 mt-1">{l.label}</p>
      <p className="text-xs text-gray-400">{current} {l.of} {capacity} {l.places}</p>
    </div>
  );
}
