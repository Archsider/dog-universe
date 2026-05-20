'use client';

// Push Notification toggle — admin profile button to enable/disable Web Push.
//
// Flow :
//   1. Check status via /api/admin/push/status → public key + current count
//   2. On enable : Notification.requestPermission() → register('/sw.js') →
//      PushManager.subscribe() → POST /subscribe
//   3. On disable : unsubscribe() → POST /unsubscribe
//
// Fail-soft : if VAPID isn't configured (env missing), shows a friendly
// "feature not enabled by the system" pill instead of an action button.
//
// Source : Wave 6 #7 (deferred → landed 2026-05-20).

import { useEffect, useState } from 'react';
import { Bell, BellOff, CheckCircle2, Loader2 } from 'lucide-react';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

interface Props { locale: string }

export default function PushNotificationToggle({ locale }: Props) {
  const fr = locale === 'fr';
  const [status, setStatus] = useState<'loading' | 'unconfigured' | 'unsupported' | 'idle' | 'subscribed' | 'denied'>('loading');
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setStatus('unsupported');
      return;
    }
    void (async () => {
      try {
        const r = await fetch('/api/admin/push/status');
        const j = await r.json();
        if (!j.configured) {
          setStatus('unconfigured');
          return;
        }
        setPublicKey(j.publicKey);
        if (Notification.permission === 'denied') {
          setStatus('denied');
          return;
        }
        // Already subscribed in THIS browser ?
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        setStatus(sub ? 'subscribed' : 'idle');
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStatus('idle');
      }
    })();
  }, []);

  async function enablePush() {
    setBusy(true);
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setStatus(perm === 'denied' ? 'denied' : 'idle');
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      if (!publicKey) throw new Error('Missing VAPID public key');
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
      });
      const raw = sub.toJSON();
      const r = await fetch('/api/admin/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          endpoint: raw.endpoint,
          keys: { p256dh: raw.keys?.p256dh, auth: raw.keys?.auth },
          userAgent: navigator.userAgent.slice(0, 500),
        }),
      });
      if (!r.ok) throw new Error('Server refused subscription');
      setStatus('subscribed');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function disablePush() {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await fetch('/api/admin/push/unsubscribe', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        });
      }
      setStatus('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (status === 'loading') {
    return (
      <div className="rounded-xl border border-ivory-200 bg-white p-4 flex items-center gap-2 text-sm text-charcoal/40">
        <Loader2 className="h-4 w-4 animate-spin" />
        {fr ? 'Chargement…' : 'Loading…'}
      </div>
    );
  }

  if (status === 'unsupported') {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-charcoal/60">
        {fr
          ? 'Votre navigateur ne supporte pas les notifications push. Essayez Chrome/Safari récent.'
          : 'Your browser doesn\'t support push notifications. Try a recent Chrome/Safari.'}
      </div>
    );
  }

  if (status === 'unconfigured') {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <strong>{fr ? 'Push non configuré.' : 'Push not configured.'}</strong>
        {' '}
        {fr
          ? 'Définissez VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY sur Vercel pour activer.'
          : 'Set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY on Vercel to enable.'}
      </div>
    );
  }

  if (status === 'denied') {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <strong>{fr ? 'Notifications refusées.' : 'Notifications denied.'}</strong>
        {' '}
        {fr
          ? 'Autorisez-les depuis les paramètres du navigateur pour les réactiver.'
          : 'Allow them from browser settings to re-enable.'}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-ivory-200 bg-white p-4 flex items-center gap-3">
      {status === 'subscribed' ? (
        <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
      ) : (
        <Bell className="h-5 w-5 text-[#C4974A] shrink-0" />
      )}
      <div className="flex-1">
        <p className="text-sm font-semibold text-charcoal">
          {fr ? 'Notifications push' : 'Push notifications'}
        </p>
        <p className="text-xs text-charcoal/60 mt-0.5">
          {status === 'subscribed'
            ? (fr ? 'Actives sur ce navigateur. Vous serez notifié des actions importantes.' : 'Active on this browser. You\'ll be notified of key actions.')
            : (fr ? 'Activez pour recevoir les notifications même quand l\'app est fermée.' : 'Enable to get notified even when the app is closed.')}
        </p>
        {error && <p className="text-xs text-red-700 mt-1">⚠ {error}</p>}
      </div>
      {status === 'subscribed' ? (
        <button
          type="button"
          onClick={() => void disablePush()}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 hover:bg-gray-200 text-charcoal disabled:opacity-50 inline-flex items-center gap-1"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <BellOff className="h-3 w-3" />}
          {fr ? 'Désactiver' : 'Disable'}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void enablePush()}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#C4974A] hover:bg-[#9A7235] text-white disabled:opacity-50 inline-flex items-center gap-1"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bell className="h-3 w-3" />}
          {fr ? 'Activer' : 'Enable'}
        </button>
      )}
    </div>
  );
}
