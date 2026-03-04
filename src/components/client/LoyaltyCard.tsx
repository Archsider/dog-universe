import { LoyaltyBadge } from '@/components/shared/LoyaltyBadge';
import { GRADE_BENEFITS, GRADE_THRESHOLDS, getNextGrade, getProgressToNext, normalizeGrade } from '@/lib/loyalty';
import type { Grade } from '@/lib/loyalty';
import { CheckCircle2, Moon, Star } from 'lucide-react';

interface LoyaltyCardProps {
  grade: string;
  nights24m: number;
  points24m: number;
  locale: string;
}

const GRADE_EMOJI: Record<Grade, string> = {
  MEMBER:   '🐾',
  SILVER:   '🥈',
  GOLD:     '🥇',
  PLATINUM: '💎',
};

export function LoyaltyCard({ grade: rawGrade, nights24m, points24m, locale }: LoyaltyCardProps) {
  const isFr = locale !== 'en';
  const grade = normalizeGrade(rawGrade);
  const next = getNextGrade(grade);
  const progress = getProgressToNext(nights24m, points24m, grade);
  const benefits = GRADE_BENEFITS[grade];
  const nextThreshold = next ? GRADE_THRESHOLDS[next] : null;

  const t = isFr
    ? {
        title: 'Programme fidélité',
        since: 'sur 24 mois glissants',
        nights: 'nuits',
        points: 'points',
        progressTo: 'Progression vers',
        nightsLeft: 'nuits restantes',
        pointsLeft: 'points restants',
        benefits: 'Vos avantages',
        noBenefits: 'Atteignez le niveau Silver pour débloquer vos premiers avantages.',
        platinum: 'Vous êtes au niveau maximum.',
      }
    : {
        title: 'Loyalty Program',
        since: 'over 24 rolling months',
        nights: 'nights',
        points: 'points',
        progressTo: 'Progress toward',
        nightsLeft: 'nights remaining',
        pointsLeft: 'points remaining',
        benefits: 'Your benefits',
        noBenefits: 'Reach Silver to unlock your first benefits.',
        platinum: 'You have reached the highest tier.',
      };

  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-charcoal to-charcoal/90 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[#C9A84C]/80 text-xs uppercase tracking-widest font-medium mb-1">{t.title}</p>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{GRADE_EMOJI[grade]}</span>
              <LoyaltyBadge grade={grade} locale={locale} size="lg" />
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-4">
              <div className="text-center">
                <p className="text-white font-bold text-xl">{nights24m}</p>
                <p className="text-white/50 text-xs">{t.nights}</p>
              </div>
              <div className="w-px h-8 bg-white/20" />
              <div className="text-center">
                <p className="text-[#C9A84C] font-bold text-sm">{points24m} pts</p>
                <p className="text-white/50 text-xs">{t.points}</p>
              </div>
            </div>
            <p className="text-white/30 text-xs mt-1">{t.since}</p>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Progress bar */}
        {next && nextThreshold ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500">
                {t.progressTo} <span className="font-semibold text-charcoal">{GRADE_EMOJI[next]} {next}</span>
              </p>
              <span className="text-xs font-bold text-gold-600">{progress.percent}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-gold-400 to-gold-600 rounded-full transition-all duration-500"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <div className="flex gap-3 mt-2">
              {progress.nightsNeeded > 0 && (
                <p className="text-xs text-gray-400 flex items-center gap-1">
                  <Moon className="h-3 w-3" />
                  <span className="font-medium text-charcoal">{progress.nightsNeeded}</span> {t.nightsLeft}
                </p>
              )}
              {progress.nightsNeeded > 0 && progress.pointsNeeded > 0 && (
                <span className="text-xs text-gray-300">{isFr ? 'ou' : 'or'}</span>
              )}
              {progress.pointsNeeded > 0 && (
                <p className="text-xs text-gray-400 flex items-center gap-1">
                  <Star className="h-3 w-3" />
                  <span className="font-medium text-charcoal">{progress.pointsNeeded}</span> {t.pointsLeft}
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-indigo-600 font-medium flex items-center gap-1.5">
            <span>💎</span> {t.platinum}
          </p>
        )}

        {/* Benefits */}
        <div>
          <p className="text-xs font-semibold text-charcoal uppercase tracking-wide mb-2.5">{t.benefits}</p>
          {benefits.length === 0 ? (
            <p className="text-xs text-gray-400 italic">{t.noBenefits}</p>
          ) : (
            <ul className="space-y-1.5">
              {benefits.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-charcoal">
                  <CheckCircle2 className="h-4 w-4 text-gold-500 flex-shrink-0 mt-0.5" />
                  {isFr ? b.textFr : b.textEn}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
