import { cn } from '@/lib/utils';
import { Crown, Star, Award, Medal } from 'lucide-react';

interface LoyaltyBadgeProps {
  grade: string;
  locale?: string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

const gradeConfig = {
  BRONZE: {
    fr: 'Bronze',
    en: 'Bronze',
    className: 'text-amber-800 bg-amber-50 border-amber-300',
    Icon: Medal,
  },
  SILVER: {
    fr: 'Argent',
    en: 'Silver',
    className: 'text-slate-700 bg-slate-100 border-slate-300',
    Icon: Star,
  },
  GOLD: {
    fr: 'Or',
    en: 'Gold',
    className: 'text-yellow-800 bg-yellow-50 border-yellow-400',
    Icon: Award,
  },
  PLATINUM: {
    fr: 'Platine',
    en: 'Platinum',
    className: 'text-indigo-800 bg-indigo-50 border-indigo-400',
    Icon: Crown,
  },
};

const sizeClasses = {
  sm: 'text-xs px-2 py-0.5 gap-1',
  md: 'text-sm px-2.5 py-1 gap-1.5',
  lg: 'text-base px-3 py-1.5 gap-2',
};

const iconSizes = { sm: 'h-3 w-3', md: 'h-3.5 w-3.5', lg: 'h-4 w-4' };

export function LoyaltyBadge({
  grade,
  locale = 'fr',
  size = 'md',
  showIcon = true,
}: LoyaltyBadgeProps) {
  const config = gradeConfig[grade as keyof typeof gradeConfig] ?? gradeConfig.BRONZE;
  const label = locale === 'en' ? config.en : config.fr;
  const { Icon } = config;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-semibold',
        config.className,
        sizeClasses[size]
      )}
    >
      {showIcon && <Icon className={iconSizes[size]} />}
      {label}
    </span>
  );
}
