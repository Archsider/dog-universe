'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, RefreshCw, CheckCircle2, XCircle, Loader2, Mail, MessageSquare } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

type Counts = { waiting: number; active: number; completed: number; failed: number; delayed: number };
type QueueSection = Counts | { error: string };

interface DiagPayload {
  env: {
    email: { server: boolean; user: boolean; password: boolean; from: boolean };
    sms: { url: boolean; username: boolean; password: boolean; adminPhone: boolean };
    redis: { host: boolean; port: boolean; password: boolean; restUrl: boolean; restToken: boolean };
    auth: { totpKey: boolean; nextauthSecret: boolean; cronSecret: boolean };
    sentry: { dsn: boolean };
    storage: { supabaseUrl: boolean; supabaseServiceKey: boolean };
  } | null;
  queues: {
    bullmqConfigured: boolean;
    email: QueueSection;
    sms: QueueSection;
    dlq: QueueSection;
  };
  workerLastRun: string | null;
  lastSuccessfulSends: { email: string | null; sms: string | null };
  ts: string;
}

const POLL_MS = 10_000;

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-ivory-50 border border-ivory-200">
      <span className="text-sm text-charcoal">{label}</span>
      {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
    </div>
  );
}

function isCounts(s: QueueSection): s is Counts {
  return typeof (s as Counts).waiting === 'number';
}

function fmtRelative(iso: string | null, isFr: boolean): { text: string; color: string } {
  if (!iso) return { text: isFr ? 'Jamais' : 'Never', color: 'text-red-600' };
  const ago = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ago / 60_000);
  let color = 'text-emerald-600';
  if (min > 10) color = 'text-red-600';
  else if (min > 2) color = 'text-amber-600';
  const text = min < 1 ? (isFr ? 'à l\'instant' : 'just now') : isFr ? `il y a ${min} min` : `${min} min ago`;
  return { text, color };
}

export default function DiagnosticsClient({ locale, sessionEmail }: { locale: string; sessionEmail: string }) {
  const isFr = locale !== 'en';
  const [data, setData] = useState<DiagPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emailTo, setEmailTo] = useState(sessionEmail);
  const [smsTo, setSmsTo] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendingSms, setSendingSms] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/diagnostics', { cache: 'no-store' });
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        return;
      }
      const json: DiagPayload = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
    const start = () => {
      if (intervalRef.current) return;
      intervalRef.current = setInterval(() => void fetchData(), POLL_MS);
    };
    const stop = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    const onVis = () => {
      if (document.hidden) stop();
      else { void fetchData(); start(); }
    };
    start();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [fetchData]);

  const sendTestEmail = async () => {
    setSendingEmail(true);
    try {
      const res = await fetch('/api/admin/diagnostics/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: emailTo }),
      });
      const json = await res.json();
      if (json.ok) {
        toast({ title: isFr ? 'Email envoyé' : 'Email sent', description: emailTo });
      } else {
        toast({ title: isFr ? 'Échec envoi email' : 'Email failed', description: json.error ?? 'unknown', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: isFr ? 'Erreur réseau' : 'Network error', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSendingEmail(false);
      void fetchData();
    }
  };

  const sendTestSms = async () => {
    if (!smsTo) {
      toast({ title: isFr ? 'Numéro requis' : 'Phone required', variant: 'destructive' });
      return;
    }
    setSendingSms(true);
    try {
      const res = await fetch('/api/admin/diagnostics/test-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: smsTo }),
      });
      const json = await res.json();
      if (json.ok) {
        toast({ title: isFr ? 'SMS envoyé' : 'SMS sent', description: smsTo });
      } else {
        toast({ title: isFr ? 'Échec envoi SMS' : 'SMS failed', description: json.error ?? 'unknown', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: isFr ? 'Erreur réseau' : 'Network error', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSendingSms(false);
      void fetchData();
    }
  };

  const workerStatus = fmtRelative(data?.workerLastRun ?? null, isFr);
  const lastEmail = fmtRelative(data?.lastSuccessfulSends.email ?? null, isFr);
  const lastSms = fmtRelative(data?.lastSuccessfulSends.sms ?? null, isFr);

  const dlqCount = data && isCounts(data.queues.dlq) ? data.queues.dlq.waiting : 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 text-[#C4974A]" />
          <h1 className="text-2xl font-semibold text-charcoal">
            {isFr ? 'Diagnostique infrastructure' : 'Infrastructure diagnostics'}
          </h1>
        </div>
        <button
          onClick={() => void fetchData()}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-[#F0D98A]/40 hover:bg-ivory-50 text-sm text-charcoal"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {isFr ? 'Rafraîchir' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {/* Env vars card */}
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
          <h2 className="font-semibold text-charcoal mb-3">{isFr ? 'Variables d\'environnement' : 'Environment variables'}</h2>
          {!data?.env ? (
            <p className="text-sm text-gray-500">{isFr ? 'Indisponible' : 'Unavailable'}</p>
          ) : (
            <div className="space-y-3 text-sm">
              <div>
                <div className="font-medium text-xs uppercase tracking-wide text-gray-500 mb-1">Email</div>
                <div className="grid grid-cols-2 gap-2">
                  <Badge ok={data.env.email.server} label="EMAIL_SERVER_HOST" />
                  <Badge ok={data.env.email.user} label="EMAIL_SERVER_USER" />
                  <Badge ok={data.env.email.password} label="EMAIL_SERVER_PASSWORD" />
                  <Badge ok={data.env.email.from} label="EMAIL_FROM" />
                </div>
              </div>
              <div>
                <div className="font-medium text-xs uppercase tracking-wide text-gray-500 mb-1">SMS</div>
                <div className="grid grid-cols-2 gap-2">
                  <Badge ok={data.env.sms.url} label="SMS_GATEWAY_URL" />
                  <Badge ok={data.env.sms.username} label="SMS_GATEWAY_USERNAME" />
                  <Badge ok={data.env.sms.password} label="SMS_GATEWAY_PASSWORD" />
                  <Badge ok={data.env.sms.adminPhone} label="ADMIN_PHONE" />
                </div>
              </div>
              <div>
                <div className="font-medium text-xs uppercase tracking-wide text-gray-500 mb-1">Redis</div>
                <div className="grid grid-cols-2 gap-2">
                  <Badge ok={data.env.redis.host} label="UPSTASH_REDIS_HOST" />
                  <Badge ok={data.env.redis.port} label="UPSTASH_REDIS_PORT" />
                  <Badge ok={data.env.redis.password} label="UPSTASH_REDIS_PASSWORD" />
                  <Badge ok={data.env.redis.restUrl} label="UPSTASH_REDIS_REST_URL" />
                  <Badge ok={data.env.redis.restToken} label="UPSTASH_REDIS_REST_TOKEN" />
                </div>
              </div>
              <div>
                <div className="font-medium text-xs uppercase tracking-wide text-gray-500 mb-1">Auth & misc</div>
                <div className="grid grid-cols-2 gap-2">
                  <Badge ok={data.env.auth.totpKey} label="TOTP_ENCRYPTION_KEY" />
                  <Badge ok={data.env.auth.nextauthSecret} label="NEXTAUTH_SECRET" />
                  <Badge ok={data.env.auth.cronSecret} label="CRON_SECRET" />
                  <Badge ok={data.env.sentry.dsn} label="SENTRY_DSN" />
                  <Badge ok={data.env.storage.supabaseUrl} label="SUPABASE_URL" />
                  <Badge ok={data.env.storage.supabaseServiceKey} label="SUPABASE_SERVICE_ROLE_KEY" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Queues card */}
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
          <h2 className="font-semibold text-charcoal mb-3">{isFr ? 'Files BullMQ' : 'BullMQ Queues'}</h2>
          {!data ? (
            <p className="text-sm text-gray-500">{isFr ? 'Chargement…' : 'Loading…'}</p>
          ) : !data.queues.bullmqConfigured ? (
            <p className="text-sm text-amber-700">{isFr ? 'BullMQ non configuré (UPSTASH_REDIS_HOST manquant)' : 'BullMQ not configured (missing UPSTASH_REDIS_HOST)'}</p>
          ) : (
            <div className="space-y-2 text-sm">
              {(['email', 'sms', 'dlq'] as const).map((name) => {
                const q = data.queues[name];
                const isDlqRow = name === 'dlq';
                if (!isCounts(q)) {
                  return (
                    <div key={name} className="rounded-lg border border-red-200 bg-red-50 p-3">
                      <div className="font-medium text-red-700">{name}</div>
                      <div className="text-xs text-red-600">{q.error}</div>
                    </div>
                  );
                }
                const dlqDanger = isDlqRow && q.waiting > 10;
                return (
                  <div key={name} className={`rounded-lg border p-3 ${dlqDanger ? 'border-red-300 bg-red-50' : 'border-ivory-200 bg-ivory-50'}`}>
                    <div className={`font-medium mb-2 capitalize ${dlqDanger ? 'text-red-700' : 'text-charcoal'}`}>{name}</div>
                    <div className="grid grid-cols-5 gap-2 text-center text-xs">
                      <div><div className="font-bold">{q.waiting}</div><div className="opacity-60">{isFr ? 'attente' : 'waiting'}</div></div>
                      <div><div className="font-bold">{q.active}</div><div className="opacity-60">active</div></div>
                      <div><div className="font-bold">{q.delayed}</div><div className="opacity-60">{isFr ? 'différé' : 'delayed'}</div></div>
                      <div><div className="font-bold text-red-600">{q.failed}</div><div className="opacity-60">failed</div></div>
                      <div><div className="font-bold text-emerald-600">{q.completed}</div><div className="opacity-60">{isFr ? 'fini' : 'done'}</div></div>
                    </div>
                  </div>
                );
              })}
              {dlqCount > 10 && (
                <p className="text-xs text-red-600 mt-2">
                  {isFr ? `⚠️ DLQ profondeur ${dlqCount} > 10 — enquête requise` : `⚠️ DLQ depth ${dlqCount} > 10 — investigate`}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Worker card */}
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
          <h2 className="font-semibold text-charcoal mb-3">{isFr ? 'Worker cron' : 'Cron worker'}</h2>
          <div className="space-y-2">
            <div className="text-sm text-gray-500">{isFr ? 'Dernier run' : 'Last run'}</div>
            <div className={`text-2xl font-semibold ${workerStatus.color}`}>{workerStatus.text}</div>
            {data?.workerLastRun && (
              <div className="text-xs text-gray-400">{new Date(data.workerLastRun).toLocaleString(isFr ? 'fr-MA' : 'en-GB')}</div>
            )}
          </div>
        </div>

        {/* Last activity card */}
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
          <h2 className="font-semibold text-charcoal mb-3">{isFr ? 'Dernière activité' : 'Last activity'}</h2>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-[#C4974A]" /> Email</div>
              <span className={lastEmail.color}>{lastEmail.text}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-[#C4974A]" /> SMS</div>
              <span className={lastSms.color}>{lastSms.text}</span>
            </div>
            {data && (
              <div className="text-xs text-gray-400 pt-2 border-t border-ivory-200">
                {isFr ? 'Mise à jour' : 'Updated'}: {new Date(data.ts).toLocaleTimeString(isFr ? 'fr-MA' : 'en-GB')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Test send buttons */}
      <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card space-y-4">
        <h2 className="font-semibold text-charcoal">{isFr ? 'Tests live' : 'Live tests'}</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-charcoal">Email</label>
            <input
              type="email"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-ivory-200 text-sm"
              placeholder="email@exemple.com"
            />
            <button
              onClick={sendTestEmail}
              disabled={sendingEmail || !emailTo}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#C4974A] text-white hover:bg-[#A7803D] disabled:opacity-50 text-sm font-medium"
            >
              {sendingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              {isFr ? 'Envoyer email test' : 'Send test email'}
            </button>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-charcoal">SMS</label>
            <input
              type="tel"
              value={smsTo}
              onChange={(e) => setSmsTo(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-ivory-200 text-sm"
              placeholder="+212600000000"
            />
            <button
              onClick={sendTestSms}
              disabled={sendingSms || !smsTo}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#C4974A] text-white hover:bg-[#A7803D] disabled:opacity-50 text-sm font-medium"
            >
              {sendingSms ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
              {isFr ? 'Envoyer SMS test' : 'Send test SMS'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
