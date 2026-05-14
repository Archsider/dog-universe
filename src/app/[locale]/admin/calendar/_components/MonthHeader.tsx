import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  monthName: string;
  year: number;
  onPrev: () => void;
  onNext: () => void;
}

/**
 * Calendar month header — prev/next navigation arrows around the
 * "Month YYYY" centred title. Pure controlled component; the parent
 * owns the navigation logic (router.push).
 */
export function MonthHeader({ monthName, year, onPrev, onNext }: Props) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-ivory-200">
      <button
        onClick={onPrev}
        className="p-2 rounded-lg hover:bg-ivory-50 text-charcoal/60 hover:text-charcoal transition-colors"
        aria-label="Previous month"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <h2 className="text-lg font-serif font-bold text-charcoal">
        {monthName} {year}
      </h2>
      <button
        onClick={onNext}
        className="p-2 rounded-lg hover:bg-ivory-50 text-charcoal/60 hover:text-charcoal transition-colors"
        aria-label="Next month"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}
