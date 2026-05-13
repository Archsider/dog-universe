import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

/**
 * StockBadge — three visual tiers driven by quantity:
 *   - 0       : red "Rupture"
 *   - 1..5    : amber "Stock faible (n)"
 *   - 6+      : green "n"
 *
 * Threshold (5) is intentional — products with custom `lowStockThreshold`
 * keep this generic badge AND get a separate "low" pill in the table row.
 */
export function StockBadge({ stock }: { stock: number }) {
  if (stock === 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
        <XCircle className="h-3 w-3" /> Rupture
      </span>
    );
  }
  if (stock <= 5) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">
        <AlertTriangle className="h-3 w-3" /> Stock faible ({stock})
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
      <CheckCircle className="h-3 w-3" /> {stock}
    </span>
  );
}
