import { Grade, GRADE_BENEFITS, getNextGradeInfo, getGradeLabel } from '@/lib/loyalty';
import { Medal, Star, Award, Crown, Check } from 'lucide-react';
import { formatMAD } from '@/lib/utils';

interface MemberCardProps {
  clientName: string;
  petName: string | null;     // primary pet name, or null if no pets
  petCount: number;
  grade: Grade;
  totalStays: number;
  totalSpentMAD: number;
  locale: string;
}

const GRADE_STYLES: Record<Grade, {
  bg: string;
  border: string;
  titleColor: string;
  textColor: string;
  badgeBg: string;
  badgeText: string;
  progressBg: string;
  progressFill: string;
  icon: React.ElementType;
}> = {
  BRONZE: {
    bg: 'bg-gradient-to-br from-[#FFF8F0] to-[#F5E6D3]',
    border: 'border-[#C9956B]/30',
    titleColor: 'text-[#8B5E3C]',
    textColor: 'text-[#6B4226]',
    badgeBg: 'bg-[#C9956B]',
    badgeText: 'text-white',
    progressBg: 'bg-[#C9956B]/20',
    progressFill: 'from-[#C9956B] to-[#A0704A]',
    icon: Medal,
  },
  SILVER: {
    bg: 'bg-gradient-to-br from-[#F8F8FA] to-[#E8E8F0]',
    border: 'border-[#9E9EC0]/30',
    titleColor: 'text-[#4A4A6A]',
    textColor: 'text-[#3A3A5A]',
    badgeBg: 'bg-[#9E9EC0]',
    badgeText: 'text-white',
    progressBg: 'bg-[#9E9EC0]/20',
    progressFill: 'from-[#9E9EC0] to-[#7070A0]',
    icon: Star,
  },
  GOLD: {
    bg: 'bg-gradient-to-br from-[#FFFBF0] to-[#FDF0CC]',
    border: 'border-[#D4AF37]/30',
    titleColor: 'text-[#8B6914]',
    textColor: 'text-[#6B4F10]',
    badgeBg: 'bg-gradient-to-r from-[#D4AF37] to-[#B8960C]',
    badgeText: 'text-white',
    progressBg: 'bg-[#D4AF37]/20',
    progressFill: 'from-[#D4AF37] to-[#B8960C]',
    icon: Award,
  },
  PLATINUM: {
    bg: 'bg-gradient-to-br from-[#1C1C2E] to-[#2D2D44]',
    border: 'border-[#D4AF37]/40',
    titleColor: 'text-[#D4AF37]',
    textColor: 'text-[#E8E0CC]',
    badgeBg: 'bg-gradient-to-r from-[#D4AF37] to-[#F0D060]',
    badgeText: 'text-[#1C1C2E]',
    progressBg: 'bg-white/10',
    progressFill: 'from-[#D4AF37] to-[#F0D060]',
    icon: Crown,
  },
};

const GRADE_LABEL: Record<Grade, Record<string, string>> = {
  BRONZE: { fr: 'Bronze', en: 'Bronze' },
  SILVER: { fr: 'Argent', en: 'Silver' },
  GOLD:   { fr: 'Or', en: 'Gold' },
  PLATINUM: { fr: 'Platine', en: 'Platinum' },
};

export function MemberCard({
  clientName, petName, petCount, grade, totalStays, totalSpentMAD, locale,
}: MemberCardProps) {
  const fr = locale === 'fr';
  const style = GRADE_STYLES[grade];
  const Icon = style.icon;
  const nextInfo = getNextGradeInfo(totalStays);
  const benefits = GRADE_BENEFITS[grade];

  const petDisplay = petCount === 0
    ? null
    : petCount === 1
      ? petName
      : (fr ? `Famille de ${petCount} animaux` : `Family of ${petCount} pets`);

  const isPlatinum = grade === 'PLATINUM';

  return (
    <div className={`relative rounded-2xl border ${style.bg} ${style.border} shadow-lg overflow-hidden`}>
      {/* Subtle pattern overlay */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

      <div className="relative p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          {/* Left: identity */}
          <div className="min-w-0">
            {/* Logo / brand */}
            <p className={`text-xs font-semibold uppercase tracking-[0.2em] mb-4 ${isPlatinum ? 'text-[#D4AF37]/70' : style.textColor + '/50'}`}>
              Dog Universe
            </p>

            {/* Grade badge */}
            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide mb-4 ${style.badgeBg} ${style.badgeText}`}>
              <Icon className="h-3 w-3" />
              {GRADE_LABEL[grade][locale]} Member
            </div>

            {/* Client name */}
            <h2 className={`text-xl font-serif font-bold truncate ${style.titleColor}`}>
              {clientName}
            </h2>
            {petDisplay && (
              <p className={`text-sm mt-0.5 ${isPlatinum ? 'text-[#E8E0CC]/60' : style.textColor + '/60'}`}>
                {petDisplay}
              </p>
            )}
          </div>

          {/* Right: icon */}
          <div className={`flex-shrink-0 h-16 w-16 rounded-full flex items-center justify-center ${style.badgeBg}`}>
            <Icon className={`h-8 w-8 ${style.badgeText}`} />
          </div>
        </div>

        {/* Stats */}
        <div className={`flex gap-6 mt-6 pt-4 border-t ${isPlatinum ? 'border-white/10' : 'border-black/5'}`}>
          <div>
            <p className={`text-2xl font-serif font-bold ${style.titleColor}`}>{totalStays}</p>
            <p className={`text-xs mt-0.5 ${isPlatinum ? 'text-[#E8E0CC]/50' : style.textColor + '/50'}`}>
              {fr ? 'séjours' : 'stays'}
            </p>
          </div>
          <div>
            <p className={`text-2xl font-serif font-bold ${style.titleColor}`}>{formatMAD(totalSpentMAD)}</p>
            <p className={`text-xs mt-0.5 ${isPlatinum ? 'text-[#E8E0CC]/50' : style.textColor + '/50'}`}>
              {fr ? 'dépensés' : 'spent'}
            </p>
          </div>
        </div>

        {/* Progress to next grade */}
        {nextInfo.nextGrade ? (
          <div className="mt-5">
            <div className={`w-full rounded-full h-1.5 ${style.progressBg}`}>
              <div
                className={`h-1.5 rounded-full bg-gradient-to-r ${style.progressFill} transition-all`}
                style={{ width: `${nextInfo.progressPercent}%` }}
              />
            </div>
            <p className={`text-xs mt-1.5 ${isPlatinum ? 'text-[#E8E0CC]/50' : style.textColor + '/50'}`}>
              {fr
                ? `${nextInfo.staysToNext} séjour${nextInfo.staysToNext > 1 ? 's' : ''} pour atteindre ${getGradeLabel(nextInfo.nextGrade, 'fr')}`
                : `${nextInfo.staysToNext} stay${nextInfo.staysToNext > 1 ? 's' : ''} to reach ${getGradeLabel(nextInfo.nextGrade, 'en')}`
              }
            </p>
          </div>
        ) : (
          <p className={`text-xs mt-5 font-medium ${style.titleColor}`}>
            {fr ? 'Niveau maximum atteint' : 'Maximum level reached'}
          </p>
        )}

        {/* Benefits */}
        {benefits.length > 0 && (
          <div className={`mt-5 pt-4 border-t ${isPlatinum ? 'border-white/10' : 'border-black/5'}`}>
            <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${isPlatinum ? 'text-[#D4AF37]/70' : style.textColor + '/50'}`}>
              {fr ? 'Avantages actifs' : 'Active benefits'}
            </p>
            <ul className="space-y-1">
              {benefits.map((b, i) => (
                <li key={i} className={`flex items-center gap-2 text-xs ${isPlatinum ? 'text-[#E8E0CC]/80' : style.textColor + '/80'}`}>
                  <Check className={`h-3 w-3 flex-shrink-0 ${style.titleColor}`} />
                  {fr ? b.labelFr : b.labelEn}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
