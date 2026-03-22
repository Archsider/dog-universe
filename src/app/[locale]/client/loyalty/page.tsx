import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { GRADE_BENEFITS, Grade, getNextGradeInfo } from '@/lib/loyalty';
import { CheckCircle2, XCircle, Clock, Star, Gift, Zap, TrendingUp } from 'lucide-react';
import LoyaltyClaimButton from './LoyaltyClaimButton';

type Params = { locale: string };

const GRADE_LABELS: Record<Grade, { fr: string; en: string; color: string; bg: string; border: string }> = {
  BRONZE:   { fr: 'Bronze',   en: 'Bronze',   color: 'text-amber-700',  bg: 'bg-amber-50',   border: 'border-amber-200' },
  SILVER:   { fr: 'Argent',   en: 'Silver',   color: 'text-slate-600',  bg: 'bg-slate-50',   border: 'border-slate-200' },
  GOLD:     { fr: 'Or',       en: 'Gold',     color: 'text-yellow-700', bg: 'bg-yellow-50',  border: 'border-yellow-200' },
  PLATINUM: { fr: 'Platine',  en: 'Platinum', color: 'text-purple-700', bg: 'bg-purple-50',  border: 'border-purple-200' },
};

export default async function LoyaltyPage({ params }: { params: Promise<Params> }) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/auth/login`);

  const [loyaltyGrade, allClaims, totalStays] = await Promise.all([
    prisma.loyaltyGrade.findUnique({ where: { clientId: session.user.id } }),
    prisma.loyaltyBenefitClaim.findMany({
      where: { clientId: session.user.id },
      orderBy: { claimedAt: 'desc' },
    }),
    prisma.booking.count({
      where: { clientId: session.user.id, status: 'COMPLETED', serviceType: 'BOARDING' },
    }),
  ]);

  const grade = (loyaltyGrade?.grade ?? 'BRONZE') as Grade;
  const benefits = GRADE_BENEFITS[grade];
  const gradeInfo = GRADE_LABELS[grade];
  const nextGrade = getNextGradeInfo(totalStays, grade);

  const isFr = locale === 'fr';

  // Map claim status by benefitKey (most recent)
  const claimByKey = new Map(allClaims.map((c) => [c.benefitKey, c]));

  const labels = {
    fr: {
      title: 'Mes avantages fidélité',
      subtitle: 'Consultez et réclamez les avantages liés à votre grade.',
      grade: 'Votre grade',
      automatic: 'Avantages automatiques',
      automaticDesc: 'Ces avantages s\'appliquent automatiquement, sans démarche de votre part.',
      claimable: 'Avantages à activer',
      claimableDesc: 'Cliquez sur "Activer" pour soumettre une demande — notre équipe la traitera sous 48h.',
      noBenefits: 'Aucun avantage disponible pour le grade Bronze. Continuez vos séjours pour progresser !',
      nextGradeLabel: 'Progression vers',
      staysToNext: (n: number) => `encore ${n} séjour${n > 1 ? 's' : ''} pour atteindre`,
      maxGrade: 'Vous avez atteint le grade maximum.',
      history: 'Historique des demandes',
      noHistory: 'Aucune demande effectuée.',
      statusLabels: { PENDING: 'En attente', APPROVED: 'Accordé', REJECTED: 'Refusé' },
      reason: 'Motif de refus',
      claimedOn: 'Demandé le',
    },
    en: {
      title: 'My loyalty benefits',
      subtitle: 'View and claim the benefits linked to your grade.',
      grade: 'Your grade',
      automatic: 'Automatic benefits',
      automaticDesc: 'These benefits apply automatically — no action needed.',
      claimable: 'Benefits to activate',
      claimableDesc: 'Click "Activate" to submit a request — our team will process it within 48 hours.',
      noBenefits: 'No benefits available for the Bronze grade. Keep booking to progress!',
      nextGradeLabel: 'Progress toward',
      staysToNext: (n: number) => `${n} more stay${n > 1 ? 's' : ''} to reach`,
      maxGrade: 'You have reached the maximum grade.',
      history: 'Claim history',
      noHistory: 'No requests submitted yet.',
      statusLabels: { PENDING: 'Pending', APPROVED: 'Granted', REJECTED: 'Rejected' },
      reason: 'Rejection reason',
      claimedOn: 'Requested on',
    },
  };
  const l = labels[isFr ? 'fr' : 'en'];

  const automaticBenefits = benefits.filter((b) => !b.claimable);
  const claimableBenefits = benefits.filter((b) => b.claimable);

  const formatDate = (d: Date) =>
    new Intl.DateTimeFormat(isFr ? 'fr-MA' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d));

  const statusConfig = {
    PENDING:  { icon: Clock,        color: 'text-amber-600',  bg: 'bg-amber-50',  label: l.statusLabels.PENDING },
    APPROVED: { icon: CheckCircle2, color: 'text-green-600',  bg: 'bg-green-50',  label: l.statusLabels.APPROVED },
    REJECTED: { icon: XCircle,      color: 'text-red-500',    bg: 'bg-red-50',    label: l.statusLabels.REJECTED },
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-serif font-bold text-charcoal">{l.title}</h1>
        <p className="text-charcoal/60 mt-1">{l.subtitle}</p>
      </div>

      {/* Grade badge */}
      <div className={`flex items-center gap-4 p-5 rounded-xl border ${gradeInfo.border} ${gradeInfo.bg}`}>
        <div className={`w-12 h-12 rounded-full flex items-center justify-center bg-white border ${gradeInfo.border}`}>
          <Star className={`h-6 w-6 ${gradeInfo.color}`} />
        </div>
        <div>
          <p className="text-xs text-charcoal/50 uppercase tracking-wide font-medium">{l.grade}</p>
          <p className={`text-xl font-serif font-bold ${gradeInfo.color}`}>{isFr ? gradeInfo.fr : gradeInfo.en}</p>
        </div>
      </div>

      {/* Progress bar toward next grade */}
      {nextGrade.nextGrade ? (
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-gold-500" />
            <span className="text-sm font-medium text-charcoal">
              {l.staysToNext(nextGrade.staysToNext)}{' '}
              <span className={GRADE_LABELS[nextGrade.nextGrade].color + ' font-semibold'}>
                {isFr ? GRADE_LABELS[nextGrade.nextGrade].fr : GRADE_LABELS[nextGrade.nextGrade].en}
              </span>
            </span>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${gradeInfo.color.replace('text-', 'bg-')}`}
              style={{ width: `${nextGrade.progressPercent}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-charcoal/40 mt-1.5">
            <span>{nextGrade.currentStays} séjour{nextGrade.currentStays > 1 ? 's' : ''}</span>
            <span>{nextGrade.currentStays + nextGrade.staysToNext}</span>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-4 text-center">
          <p className="text-sm text-charcoal/60">{l.maxGrade}</p>
        </div>
      )}

      {benefits.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-8 text-center">
          <Gift className="h-10 w-10 text-charcoal/20 mx-auto mb-3" />
          <p className="text-charcoal/60 text-sm">{l.noBenefits}</p>
        </div>
      ) : (
        <>
          {/* Automatic benefits */}
          {automaticBenefits.length > 0 && (
            <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="h-4 w-4 text-gold-500" />
                <h2 className="text-base font-serif font-semibold text-charcoal">{l.automatic}</h2>
              </div>
              <p className="text-xs text-charcoal/50 mb-4">{l.automaticDesc}</p>
              <ul className="space-y-2">
                {automaticBenefits.map((b) => (
                  <li key={b.key} className="flex items-center gap-3 p-3 rounded-lg bg-[#FAF6F0]">
                    <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                    <span className="text-sm text-charcoal">{isFr ? b.labelFr : b.labelEn}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Claimable benefits */}
          {claimableBenefits.length > 0 && (
            <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card">
              <div className="flex items-center gap-2 mb-1">
                <Gift className="h-4 w-4 text-gold-500" />
                <h2 className="text-base font-serif font-semibold text-charcoal">{l.claimable}</h2>
              </div>
              <p className="text-xs text-charcoal/50 mb-4">{l.claimableDesc}</p>
              <ul className="space-y-3">
                {claimableBenefits.map((b) => {
                  const claim = claimByKey.get(b.key);
                  const status = claim?.status as 'PENDING' | 'APPROVED' | 'REJECTED' | undefined;
                  const cfg = status ? statusConfig[status] : null;
                  const StatusIcon = cfg?.icon;

                  return (
                    <li key={b.key} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-[#F0D98A]/30 hover:bg-[#FAF6F0] transition-colors">
                      <span className="text-sm text-charcoal font-medium">{isFr ? b.labelFr : b.labelEn}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {cfg && StatusIcon ? (
                          <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.color}`}>
                            <StatusIcon className="h-3.5 w-3.5" />
                            {cfg.label}
                          </span>
                        ) : (
                          <LoyaltyClaimButton benefitKey={b.key} locale={locale} />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}

      {/* Claim history */}
      {allClaims.length > 0 && (
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card">
          <h2 className="text-base font-serif font-semibold text-charcoal mb-4">{l.history}</h2>
          <div className="space-y-3">
            {allClaims.map((claim) => {
              const cfg = statusConfig[claim.status as 'PENDING' | 'APPROVED' | 'REJECTED'];
              const StatusIcon = cfg.icon;
              return (
                <div key={claim.id} className={`p-4 rounded-lg border ${cfg.bg}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-charcoal">
                        {isFr ? claim.benefitLabelFr : claim.benefitLabelEn}
                      </p>
                      <p className="text-xs text-charcoal/50 mt-0.5">
                        {l.claimedOn} {formatDate(claim.claimedAt)}
                      </p>
                      {claim.status === 'REJECTED' && claim.rejectionReason && (
                        <p className="text-xs text-red-600 mt-1.5">
                          <span className="font-medium">{l.reason} :</span> {claim.rejectionReason}
                        </p>
                      )}
                    </div>
                    <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${cfg.bg} ${cfg.color}`}>
                      <StatusIcon className="h-3.5 w-3.5" />
                      {cfg.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
