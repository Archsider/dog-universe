import { Grade, GRADE_BENEFITS, getNextGradeInfo, getGradeLabel } from '@/lib/loyalty';
import { Medal, Star, Award, Crown } from 'lucide-react';
import { formatMAD } from '@/lib/utils';
import { MemberQRCode } from './MemberQRCode';
import { BenefitClaimButton } from './BenefitClaimButton';

interface Claim {
  benefitKey: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

interface MemberCardProps {
  clientId: string;
  clientName: string;
  pets: { name: string; species: string }[];
  grade: Grade;
  totalStays: number;
  totalSpentMAD: number;
  locale: string;
  claims: Claim[];
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
  shimmer: string;
}> = {
  BRONZE: {
    bg: 'bg-gradient-to-br from-[#FFF8F0] via-[#FAF0E4] to-[#F0DFC8]',
    border: 'border-[#C9956B]/40',
    titleColor: 'text-[#8B5E3C]',
    textColor: 'text-[#6B4226]',
    badgeBg: 'bg-gradient-to-r from-[#C9956B] to-[#A07050]',
    badgeText: 'text-white',
    progressBg: 'bg-[#C9956B]/20',
    progressFill: 'from-[#C9956B] to-[#A0704A]',
    icon: Medal,
    shimmer: 'from-transparent via-[#C9956B]/10 to-transparent',
  },
  SILVER: {
    bg: 'bg-gradient-to-br from-[#F8F8FA] via-[#EDEDF5] to-[#DCDCEC]',
    border: 'border-[#9E9EC0]/40',
    titleColor: 'text-[#4A4A6A]',
    textColor: 'text-[#3A3A5A]',
    badgeBg: 'bg-gradient-to-r from-[#9E9EC0] to-[#7070A0]',
    badgeText: 'text-white',
    progressBg: 'bg-[#9E9EC0]/20',
    progressFill: 'from-[#9E9EC0] to-[#7070A0]',
    icon: Star,
    shimmer: 'from-transparent via-[#9E9EC0]/10 to-transparent',
  },
  GOLD: {
    bg: 'bg-gradient-to-br from-[#FFFBF0] via-[#FDF4D0] to-[#F8E8A0]',
    border: 'border-[#D4AF37]/50',
    titleColor: 'text-[#8B6914]',
    textColor: 'text-[#6B4F10]',
    badgeBg: 'bg-gradient-to-r from-[#D4AF37] via-[#F0D060] to-[#B8960C]',
    badgeText: 'text-white',
    progressBg: 'bg-[#D4AF37]/20',
    progressFill: 'from-[#D4AF37] to-[#B8960C]',
    icon: Award,
    shimmer: 'from-transparent via-[#D4AF37]/15 to-transparent',
  },
  PLATINUM: {
    bg: 'bg-gradient-to-br from-[#141428] via-[#1C1C2E] to-[#252540]',
    border: 'border-[#D4AF37]/50',
    titleColor: 'text-[#D4AF37]',
    textColor: 'text-[#E8E0CC]',
    badgeBg: 'bg-gradient-to-r from-[#D4AF37] via-[#F0D060] to-[#D4AF37]',
    badgeText: 'text-[#1C1C2E]',
    progressBg: 'bg-white/10',
    progressFill: 'from-[#D4AF37] to-[#F0D060]',
    icon: Crown,
    shimmer: 'from-transparent via-[#D4AF37]/8 to-transparent',
  },
};

const GRADE_LABEL: Record<Grade, Record<string, string>> = {
  BRONZE: { fr: 'Bronze', en: 'Bronze' },
  SILVER: { fr: 'Argent', en: 'Silver' },
  GOLD:   { fr: 'Or', en: 'Gold' },
  PLATINUM: { fr: 'Platine', en: 'Platinum' },
};

export function MemberCard({
  clientId, clientName, pets, grade, totalStays, totalSpentMAD, locale, claims,
}: MemberCardProps) {
  const fr = locale === 'fr';
  const style = GRADE_STYLES[grade];
  const Icon = style.icon;
  const nextInfo = getNextGradeInfo(totalStays, grade);
  const benefits = GRADE_BENEFITS[grade];
  const isPlatinum = grade === 'PLATINUM';

  // Build pet display line: "Max · Luna (2 chiens)" or "Max (chat)"
  const petLine = (() => {
    if (pets.length === 0) return null;
    const dogs = pets.filter((p) => p.species === 'DOG');
    const cats = pets.filter((p) => p.species === 'CAT');
    const parts: string[] = [];
    if (dogs.length > 0) {
      parts.push(`${dogs.map((d) => d.name).join(' · ')} (${dogs.length > 1 ? (fr ? `${dogs.length} chiens` : `${dogs.length} dogs`) : (fr ? 'chien' : 'dog')})`);
    }
    if (cats.length > 0) {
      parts.push(`${cats.map((c) => c.name).join(' · ')} (${cats.length > 1 ? (fr ? `${cats.length} chats` : `${cats.length} cats`) : (fr ? 'chat' : 'cat')})`);
    }
    return parts.join(' — ');
  })();

  const automaticBenefits = benefits.filter((b) => !b.claimable);
  const claimableBenefits = benefits.filter((b) => b.claimable);

  const claimMap = new Map(claims.map((c) => [c.benefitKey, c]));

  const divider = isPlatinum ? 'border-white/10' : 'border-black/6';

  return (
    <div className={`relative rounded-2xl border-2 ${style.bg} ${style.border} shadow-2xl overflow-hidden`}
      style={{ boxShadow: isPlatinum ? '0 20px 60px rgba(212,175,55,0.15), 0 4px 20px rgba(0,0,0,0.4)' : undefined }}>

      {/* Shimmer diagonal stripe */}
      <div className={`absolute inset-0 bg-gradient-to-r ${style.shimmer} opacity-60 pointer-events-none`}
        style={{ backgroundSize: '200% 100%' }} />

      {/* Dot grid texture */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.04) 1px, transparent 1px)', backgroundSize: '18px 18px' }} />

      <div className="relative p-6 sm:p-8">
        {/* Top row: brand + QR */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className={`text-[10px] font-bold uppercase tracking-[0.3em] mb-1 ${isPlatinum ? 'text-[#D4AF37]/60' : style.textColor + '/40'}`}>
              Dog Universe
            </p>
            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest ${style.badgeBg} ${style.badgeText} shadow-sm`}>
              <Icon className="h-3 w-3" />
              {GRADE_LABEL[grade][locale]}
            </div>
          </div>

          {/* QR code — right corner */}
          <div className={`flex-shrink-0 p-1.5 rounded-lg ${isPlatinum ? 'bg-white/5' : 'bg-white/60'} backdrop-blur-sm`}>
            <MemberQRCode clientId={clientId} grade={grade} size={64} />
          </div>
        </div>

        {/* Client name + pets */}
        <div className="mb-5">
          <p className={`text-[10px] uppercase tracking-widest mb-0.5 font-semibold ${isPlatinum ? 'text-[#D4AF37]/50' : style.textColor + '/40'}`}>
            {fr ? 'Membre' : 'Member'}
          </p>
          <h2 className={`text-2xl font-serif font-bold ${style.titleColor}`}>{clientName}</h2>
          {petLine && (
            <p className={`text-sm mt-1 ${isPlatinum ? 'text-[#E8E0CC]/50' : style.textColor + '/50'}`}>
              {petLine}
            </p>
          )}
        </div>

        {/* Stats */}
        <div className={`flex gap-8 pt-4 border-t ${divider}`}>
          <div>
            <p className={`text-3xl font-serif font-bold ${style.titleColor}`}>{totalStays}</p>
            <p className={`text-[11px] mt-0.5 uppercase tracking-wide ${isPlatinum ? 'text-[#E8E0CC]/40' : style.textColor + '/40'}`}>
              {fr ? 'séjours' : 'stays'}
            </p>
          </div>
          <div>
            <p className={`text-3xl font-serif font-bold ${style.titleColor}`}>{formatMAD(totalSpentMAD)}</p>
            <p className={`text-[11px] mt-0.5 uppercase tracking-wide ${isPlatinum ? 'text-[#E8E0CC]/40' : style.textColor + '/40'}`}>
              {fr ? 'dépensés' : 'spent'}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        {nextInfo.nextGrade ? (
          <div className="mt-4">
            <div className={`w-full rounded-full h-1.5 ${style.progressBg}`}>
              <div
                className={`h-1.5 rounded-full bg-gradient-to-r ${style.progressFill} transition-all`}
                style={{ width: `${nextInfo.progressPercent}%` }}
              />
            </div>
            <p className={`text-[11px] mt-1.5 ${isPlatinum ? 'text-[#E8E0CC]/40' : style.textColor + '/40'}`}>
              {fr
                ? `${nextInfo.staysToNext} séjour${nextInfo.staysToNext > 1 ? 's' : ''} pour atteindre ${getGradeLabel(nextInfo.nextGrade, 'fr')}`
                : `${nextInfo.staysToNext} stay${nextInfo.staysToNext > 1 ? 's' : ''} to reach ${getGradeLabel(nextInfo.nextGrade, 'en')}`}
            </p>
          </div>
        ) : (
          <p className={`text-xs mt-4 font-semibold uppercase tracking-wide ${style.titleColor}`}>
            {fr ? '✦ Niveau maximum atteint' : '✦ Maximum level reached'}
          </p>
        )}

        {/* Benefits section */}
        {benefits.length > 0 && (
          <div className={`mt-5 pt-4 border-t ${divider} space-y-4`}>
            {/* Automatic perks */}
            {automaticBenefits.length > 0 && (
              <div>
                <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${isPlatinum ? 'text-[#D4AF37]/50' : style.textColor + '/40'}`}>
                  {fr ? 'Avantages automatiques' : 'Automatic perks'}
                </p>
                <ul className="space-y-1.5">
                  {automaticBenefits.map((b) => (
                    <li key={b.key} className={`flex items-center gap-2 text-xs ${isPlatinum ? 'text-[#E8E0CC]/70' : style.textColor + '/70'}`}>
                      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 bg-gradient-to-r ${style.progressFill}`} />
                      {fr ? b.labelFr : b.labelEn}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Claimable benefits */}
            {claimableBenefits.length > 0 && (
              <div>
                <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${isPlatinum ? 'text-[#D4AF37]/50' : style.textColor + '/40'}`}>
                  {fr ? 'Avantages à réclamer' : 'Benefits to claim'}
                </p>
                <ul className="space-y-2">
                  {claimableBenefits.map((b) => (
                    <li key={b.key}>
                      <BenefitClaimButton
                        benefitKey={b.key}
                        labelFr={b.labelFr}
                        labelEn={b.labelEn}
                        locale={locale}
                        existingClaim={claimMap.get(b.key) as Claim | undefined}
                        isPlatinum={isPlatinum}
                        titleColor={style.titleColor}
                        textColor={style.textColor}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
