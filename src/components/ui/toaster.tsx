'use client';

import { useToast } from '@/hooks/use-toast';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Toaster() {
  const { toasts, dismissToast } = useToast();

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'flex items-start gap-3 rounded-lg border p-4 shadow-gold-lg bg-white animate-fade-in',
            toast.variant === 'destructive' && 'border-red-200 bg-red-50',
            toast.variant === 'success' && 'border-green-200 bg-green-50',
            !toast.variant && 'border-[#F0D98A]/50'
          )}
        >
          <div className="flex-shrink-0 mt-0.5">
            {toast.variant === 'destructive' && <AlertCircle className="h-4 w-4 text-red-600" />}
            {toast.variant === 'success' && <CheckCircle className="h-4 w-4 text-green-600" />}
            {(!toast.variant) && <Info className="h-4 w-4 text-gold-500" />}
          </div>
          <div className="flex-1 min-w-0">
            {toast.title && (
              <p className={cn(
                'text-sm font-semibold',
                toast.variant === 'destructive' ? 'text-red-800' : 'text-charcoal'
              )}>
                {toast.title}
              </p>
            )}
            {toast.description && (
              <p className={cn(
                'text-sm mt-0.5',
                toast.variant === 'destructive' ? 'text-red-700' : 'text-muted-foreground'
              )}>
                {toast.description}
              </p>
            )}
          </div>
          <button
            onClick={() => dismissToast(toast.id)}
            className="flex-shrink-0 rounded-sm opacity-70 hover:opacity-100 focus:outline-none"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
