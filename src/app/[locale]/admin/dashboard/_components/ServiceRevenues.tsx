import { Calendar, Car, Scissors, Package, type LucideIcon } from 'lucide-react';
import { formatMAD } from '@/lib/utils';
import type { DashboardLabels } from '../_lib/labels';

interface ServiceCard {
  label: string;
  amount: number;
  delta: number;
  hadActivityLastMonth: boolean;
  icon: LucideIcon;
  bgFrom: string;
  bgTo: string;
  border: string;
  textTitle: string;
  textValue: string;
  textHelp: string;
  textIcon: string;
}

interface Props {
  labels: DashboardLabels;
  monthlyBoardingRevenue: number;
  monthlyTaxiRevenue: number;
  monthlyGroomingRevenue: number;
  monthlyCroquettesRevenue: number;
  boardingDelta: number;
  taxiDelta: number;
  groomingDelta: number;
  croquettesDelta: number;
  hadBoardingLastMonth: boolean;
  hadTaxiLastMonth: boolean;
  hadGroomingLastMonth: boolean;
  hadCroquettesLastMonth: boolean;
}

/**
 * Row 2 — four service revenue cards (boarding / taxi / grooming / croquettes).
 * Each card uses a service-specific gradient background. Delta % is shown
 * only when the service had activity last month (avoids meaningless +∞).
 */
export function ServiceRevenues(props: Props) {
  const { labels: l } = props;

  const cards: ServiceCard[] = [
    {
      label: l.pension,
      amount: props.monthlyBoardingRevenue,
      delta: props.boardingDelta,
      hadActivityLastMonth: props.hadBoardingLastMonth,
      icon: Calendar,
      bgFrom: 'from-[#FBF5E0]',
      bgTo: 'to-[#FDF8EC]',
      border: 'border-[#E2C048]/30',
      textTitle: 'text-gold-700',
      textValue: 'text-gold-800',
      textHelp: 'text-gold-600',
      textIcon: 'text-gold-500',
    },
    {
      label: l.taxi,
      amount: props.monthlyTaxiRevenue,
      delta: props.taxiDelta,
      hadActivityLastMonth: props.hadTaxiLastMonth,
      icon: Car,
      bgFrom: 'from-[#EBF4FF]',
      bgTo: 'to-[#F0F7FF]',
      border: 'border-blue-200/50',
      textTitle: 'text-blue-700',
      textValue: 'text-blue-800',
      textHelp: 'text-blue-600',
      textIcon: 'text-blue-500',
    },
    {
      label: l.grooming,
      amount: props.monthlyGroomingRevenue,
      delta: props.groomingDelta,
      hadActivityLastMonth: props.hadGroomingLastMonth,
      icon: Scissors,
      bgFrom: 'from-[#F3EEFF]',
      bgTo: 'to-[#F7F2FF]',
      border: 'border-purple-200/50',
      textTitle: 'text-purple-700',
      textValue: 'text-purple-800',
      textHelp: 'text-purple-600',
      textIcon: 'text-purple-500',
    },
    {
      label: l.croquettes,
      amount: props.monthlyCroquettesRevenue,
      delta: props.croquettesDelta,
      hadActivityLastMonth: props.hadCroquettesLastMonth,
      icon: Package,
      bgFrom: 'from-[#FEF3E2]',
      bgTo: 'to-[#FFF8EE]',
      border: 'border-orange-200/50',
      textTitle: 'text-orange-700',
      textValue: 'text-orange-800',
      textHelp: 'text-orange-600',
      textIcon: 'text-orange-500',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <div
            key={c.label}
            className={`bg-gradient-to-br ${c.bgFrom} ${c.bgTo} rounded-xl border ${c.border} p-4 shadow-card`}
          >
            <div className="flex items-center justify-between mb-2">
              <span
                className={`text-xs font-medium ${c.textTitle} uppercase tracking-wide`}
              >
                {c.label}
              </span>
              <Icon className={`h-4 w-4 ${c.textIcon}`} />
            </div>
            <div className={`text-2xl font-bold ${c.textValue}`}>{formatMAD(c.amount)}</div>
            <div className={`text-xs ${c.textHelp} mt-1 flex items-center gap-1.5`}>
              {l.thisMth}
              {c.hadActivityLastMonth && (
                <span
                  className={c.delta >= 0 ? 'text-green-600' : 'text-red-400'}
                >
                  {c.delta > 0 ? '+' : ''}
                  {c.delta}%
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
