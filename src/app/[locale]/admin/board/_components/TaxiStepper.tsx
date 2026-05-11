'use client';

import { TAXI_STEP_SHORT } from '../_lib/kanban-config';

export function TaxiStepper({
  flow,
  currentStatus,
  locale,
}: {
  flow: string[];
  currentStatus: string;
  locale: string;
}) {
  const isFr = locale === 'fr';
  const currentIdx = Math.max(0, flow.indexOf(currentStatus));
  return (
    <div className="mt-2 flex items-stretch">
      {flow.map((step, i) => {
        const isActive = i <= currentIdx;
        const isFirst = i === 0;
        const isLast = i === flow.length - 1;
        const short = TAXI_STEP_SHORT[step];
        const label = short ? (isFr ? short.fr : short.en) : '';
        // Connecteurs : rendus systématiquement pour symétrie ; transparents aux extrémités.
        const leftConnectorClass = isFirst
          ? 'bg-transparent'
          : i <= currentIdx
            ? 'bg-[#C4974A]'
            : 'bg-[rgba(196,151,74,0.2)]';
        const rightConnectorClass = isLast
          ? 'bg-transparent'
          : i < currentIdx
            ? 'bg-[#C4974A]'
            : 'bg-[rgba(196,151,74,0.2)]';
        return (
          <div key={step} className="flex-1 flex flex-col items-center min-w-0">
            <div className="flex items-center justify-center w-full">
              <div className={`h-[2px] flex-1 mx-1 ${leftConnectorClass}`} />
              <div
                className={`flex items-center justify-center mx-auto rounded-full border-2 text-[10px] flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 transition-colors ${
                  isActive
                    ? 'bg-[#C4974A] border-[#C4974A] text-white font-bold'
                    : 'bg-white border-[rgba(196,151,74,0.35)] text-[#8A7E75]'
                }`}
              >
                {i + 1}
              </div>
              <div className={`h-[2px] flex-1 mx-1 ${rightConnectorClass}`} />
            </div>
            <span className="block w-full text-center text-[10px] mt-1 truncate text-[#8A7E75]">{label}</span>
          </div>
        );
      })}
    </div>
  );
}
