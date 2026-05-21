import { CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { Backup, RestoreSummary } from '../_lib/types';

interface ConfirmProps {
  isFr: boolean;
  target: Backup | null;
  onCancel: () => void;
  onConfirm: () => void;
}

interface ResultProps {
  isFr: boolean;
  result: RestoreSummary | null;
  onClose: () => void;
}

/**
 * Confirmation dialog before launching the additive restore.
 * Body text spells out the additive semantics so the operator knows
 * existing rows are NEVER overwritten — fewer "did I just nuke prod?"
 * panics in support tickets.
 */
export function RestoreConfirmDialog({ isFr, target, onCancel, onConfirm }: ConfirmProps) {
  return (
    <AlertDialog open={!!target} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isFr
              ? `Restaurer la sauvegarde du ${target?.date} ?`
              : `Restore backup from ${target?.date}?`}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-relaxed">
            {isFr ? (
              <>
                Cette opération est <strong>additive</strong> : les enregistrements existants
                ne seront <strong>jamais écrasés</strong>. Seules les lignes manquantes seront
                réinsérées dans l&apos;ordre des dépendances FK.
                <br />
                <br />
                Si une ligne échoue, le système poursuit par insertion ligne-par-ligne et te
                rapporte le détail par table.
              </>
            ) : (
              <>
                This is <strong>additive only</strong>: existing records will{' '}
                <strong>never be overwritten</strong>. Only missing rows will be re-inserted
                in FK dependency order.
                <br />
                <br />
                If a row fails, the system falls back to per-row inserts and surfaces a
                per-table breakdown.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{isFr ? 'Annuler' : 'Cancel'}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-amber-600 hover:bg-amber-700">
            {isFr ? 'Restaurer' : 'Restore'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Result dialog with a 3-stat header (inserted / skipped / failed) and a
 * per-table breakdown table. Errors are collapsed in a `<details>` block
 * so the dialog stays compact when restoration was clean.
 */
export function RestoreResultDialog({ isFr, result, onClose }: ResultProps) {
  return (
    <AlertDialog open={!!result} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {result?.totals.failed === 0 ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            )}
            {isFr ? `Restauration ${result?.date}` : `Restore ${result?.date}`}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-sm space-y-3">
              {result && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-emerald-50 border border-emerald-200 py-2">
                      <p className="text-2xl font-semibold text-emerald-700 tabular-nums">
                        {result.totals.inserted}
                      </p>
                      <p className="text-xs text-emerald-700/80 mt-0.5">
                        {isFr ? 'insérées' : 'inserted'}
                      </p>
                    </div>
                    <div className="rounded-lg bg-ivory-50 border border-ivory-200 py-2">
                      <p className="text-2xl font-semibold text-charcoal/70 tabular-nums">
                        {result.totals.skipped}
                      </p>
                      <p className="text-xs text-charcoal/60 mt-0.5">
                        {isFr ? 'existaient déjà' : 'already existed'}
                      </p>
                    </div>
                    <div className="rounded-lg bg-red-50 border border-red-200 py-2">
                      <p className="text-2xl font-semibold text-red-700 tabular-nums">
                        {result.totals.failed}
                      </p>
                      <p className="text-xs text-red-700/80 mt-0.5">
                        {isFr ? 'échecs' : 'failures'}
                      </p>
                    </div>
                  </div>
                  <div className="border-t border-ivory-200 pt-3 max-h-64 overflow-auto">
                    <table className="w-full text-xs">
                      <thead className="text-charcoal/50">
                        <tr>
                          <th className="text-left py-1">Table</th>
                          <th className="text-right py-1">+</th>
                          <th className="text-right py-1">=</th>
                          <th className="text-right py-1">!</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(result.results).map(([table, r]) => (
                          <tr key={table} className="border-t border-ivory-100">
                            <td className="py-1.5 font-mono text-charcoal">{table}</td>
                            <td className="py-1.5 text-right text-emerald-700 tabular-nums">
                              {r.inserted}
                            </td>
                            <td className="py-1.5 text-right text-charcoal/50 tabular-nums">
                              {r.skipped}
                            </td>
                            <td
                              className={`py-1.5 text-right tabular-nums ${
                                r.failed > 0
                                  ? 'text-red-700 font-semibold'
                                  : 'text-charcoal/30'
                              }`}
                            >
                              {r.failed}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {result.errors && (
                    <details className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs">
                      <summary className="cursor-pointer font-medium text-red-800">
                        {isFr ? 'Détails des erreurs' : 'Error details'}
                      </summary>
                      <div className="mt-2 space-y-1 font-mono text-red-700">
                        {Object.entries(result.errors).map(([table, msg]) => (
                          <div key={table}>
                            <strong>{table}:</strong> {msg}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={onClose}>
            {isFr ? 'Fermer' : 'Close'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
