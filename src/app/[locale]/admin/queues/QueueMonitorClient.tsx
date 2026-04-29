'use client';

import { useState } from 'react';
import { toast } from '@/hooks/use-toast';
import { Loader2, RefreshCw, RotateCcw, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { QueueData } from './page';

interface Props {
  locale: string;
  queues: QueueData[];
  redisError: boolean;
}

const QUEUE_LABELS: Record<string, { fr: string; en: string }> = {
  email:       { fr: 'Emails',          en: 'Emails' },
  sms:         { fr: 'SMS',             en: 'SMS' },
  dlq:         { fr: 'Lettre morte',    en: 'Dead Letter Queue' },
};

function StatusBadge({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <div className={`flex flex-col items-center px-3 py-2 rounded-lg ${color}`}>
      <span className="text-xl font-bold">{count}</span>
      <span className="text-xs opacity-75">{label}</span>
    </div>
  );
}

function QueueCard({ queue, isFr, onRetry, retrying }: {
  queue: QueueData;
  isFr: boolean;
  onRetry: (queueName: string, jobId: string) => void;
  retrying: string | null;
}) {
  const label = QUEUE_LABELS[queue.name];
  const isDlq = queue.name === 'dlq';

  return (
    <div className={`bg-white rounded-xl border p-5 shadow-card space-y-4 ${isDlq && queue.counts.waiting > 0 ? 'border-red-200' : 'border-[#F0D98A]/40'}`}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-charcoal">
          {isFr ? label.fr : label.en}
        </h3>
        {isDlq && queue.counts.waiting > 0 && (
          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
            {queue.counts.waiting} {isFr ? 'job(s) mort(s)' : 'dead job(s)'}
          </span>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        <StatusBadge count={queue.counts.waiting ?? 0}   label={isFr ? 'En attente' : 'Waiting'}   color="bg-amber-50 text-amber-800" />
        <StatusBadge count={queue.counts.active ?? 0}    label={isFr ? 'Actif' : 'Active'}         color="bg-blue-50 text-blue-800" />
        <StatusBadge count={queue.counts.completed ?? 0} label={isFr ? 'Terminé' : 'Completed'}   color="bg-green-50 text-green-800" />
        <StatusBadge count={queue.counts.failed ?? 0}    label={isFr ? 'Échoué' : 'Failed'}       color="bg-red-50 text-red-800" />
        <StatusBadge count={queue.counts.delayed ?? 0}   label={isFr ? 'Différé' : 'Delayed'}     color="bg-purple-50 text-purple-800" />
      </div>

      {queue.recentFailed.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            {isFr ? 'Jobs échoués récents' : 'Recent failed jobs'}
          </p>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {queue.recentFailed.map((job) => (
              <div key={job.id} className="bg-red-50 rounded-lg p-3 text-xs space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5 min-w-0">
                    <p className="font-mono text-gray-500 truncate">#{job.id}</p>
                    <p className="text-red-700 truncate">{job.failedReason}</p>
                    <p className="text-gray-500">
                      {isFr ? 'Tentatives' : 'Attempts'}: {job.attemptsMade}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 h-7 text-xs border-red-200 text-red-700 hover:bg-red-100"
                    disabled={retrying === job.id}
                    onClick={() => onRetry(queue.name, job.id)}
                  >
                    {retrying === job.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3 w-3" />
                    )}
                    <span className="ml-1">{isFr ? 'Rejouer' : 'Retry'}</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {queue.recentCompleted.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            {isFr ? 'Terminés récemment' : 'Recently completed'}
          </p>
          {queue.recentCompleted.map((j) => (
            <div key={j.id} className="flex items-center gap-2 text-xs text-gray-500">
              <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
              <span className="font-mono truncate">#{j.id}</span>
              <span className="ml-auto shrink-0">
                {j.finishedOn ? new Date(j.finishedOn).toLocaleTimeString() : '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function QueueMonitorClient({ locale, queues, redisError }: Props) {
  const isFr = locale === 'fr';
  const [retrying, setRetrying] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const handleRetry = async (queueName: string, jobId: string) => {
    setRetrying(jobId);
    try {
      const res = await fetch('/api/admin/queues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queue: queueName, jobId }),
      });
      if (!res.ok) throw new Error('Failed');
      toast({ title: isFr ? 'Job remis en file' : 'Job re-queued', variant: 'success' });
      setTimeout(() => window.location.reload(), 500);
    } catch {
      toast({ title: isFr ? 'Erreur lors du rejeu' : 'Retry failed', variant: 'destructive' });
    } finally {
      setRetrying(null);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    window.location.reload();
  };

  if (redisError) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-3 mb-6">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <h1 className="text-xl font-semibold text-charcoal">
            {isFr ? 'File de traitement asynchrone' : 'Async Job Queues'}
          </h1>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">
          {isFr ? 'Impossible de se connecter à Redis. Vérifier les variables UPSTASH_REDIS_HOST / UPSTASH_REDIS_PASSWORD.' : 'Cannot connect to Redis. Check UPSTASH_REDIS_HOST / UPSTASH_REDIS_PASSWORD.'}
        </div>
      </div>
    );
  }

  const totalWaiting = queues.reduce((s, q) => s + (q.counts.waiting ?? 0), 0);
  const totalFailed  = queues.reduce((s, q) => s + (q.counts.failed ?? 0), 0);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-charcoal">
            {isFr ? 'File de traitement asynchrone' : 'Async Job Queues'}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {isFr ? 'Traitement via cron toutes les minutes' : 'Processed via cron every minute'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {totalWaiting > 0 && (
            <div className="flex items-center gap-1.5 text-sm text-amber-700 bg-amber-50 px-3 py-1.5 rounded-full">
              <Clock className="h-3.5 w-3.5" />
              {totalWaiting} {isFr ? 'en attente' : 'waiting'}
            </div>
          )}
          {totalFailed > 0 && (
            <div className="flex items-center gap-1.5 text-sm text-red-700 bg-red-50 px-3 py-1.5 rounded-full">
              <AlertCircle className="h-3.5 w-3.5" />
              {totalFailed} {isFr ? 'échoués' : 'failed'}
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="gap-1.5"
          >
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {isFr ? 'Actualiser' : 'Refresh'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {queues.map((q) => (
          <QueueCard
            key={q.name}
            queue={q}
            isFr={isFr}
            onRetry={handleRetry}
            retrying={retrying}
          />
        ))}
      </div>
    </div>
  );
}
