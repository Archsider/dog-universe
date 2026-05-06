/**
 * sw-driver.js — Service Worker dédié au tracking GPS chauffeur.
 *
 * Distinct du sw.js PWA général : ce SW intercepte uniquement les POST
 * `/api/admin/taxi-trips/*/tracking` avec action: 'location' et les met
 * en file d'attente IndexedDB si le réseau est down. Replay automatique
 * sur événement 'online' ou via background sync.
 *
 * Scope : `/admin/reservations/` (enregistré uniquement par TaxiTrackingButton).
 */

const DB_NAME = 'taxi-driver-queue';
const STORE = 'pending';
const DB_VERSION = 1;
const MAX_QUEUE = 1000;
const BATCH_SIZE = 50;

// ───────── IndexedDB helpers ─────────
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('timestamp', 'timestamp');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

async function enqueue(entry) {
  const db = await openDb();
  // FIFO eviction si on dépasse MAX_QUEUE
  const countReq = tx(db, 'readonly').count();
  await new Promise((res, rej) => { countReq.onsuccess = res; countReq.onerror = () => rej(countReq.error); });
  if (countReq.result >= MAX_QUEUE) {
    // Supprime la plus vieille (par index timestamp)
    const store = tx(db, 'readwrite');
    const idx = store.index('timestamp');
    const cursorReq = idx.openCursor();
    await new Promise((res) => {
      cursorReq.onsuccess = () => {
        const cur = cursorReq.result;
        if (cur) { cur.delete(); res(); } else res();
      };
      cursorReq.onerror = () => res();
    });
  }
  const store = tx(db, 'readwrite');
  return new Promise((res, rej) => {
    const r = store.add(entry);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function getQueueSize() {
  try {
    const db = await openDb();
    const countReq = tx(db, 'readonly').count();
    return new Promise((res) => {
      countReq.onsuccess = () => res(countReq.result);
      countReq.onerror = () => res(0);
    });
  } catch {
    return 0;
  }
}

async function getBatch(limit) {
  const db = await openDb();
  const store = tx(db, 'readonly');
  const idx = store.index('timestamp');
  return new Promise((res) => {
    const out = [];
    const cursorReq = idx.openCursor();
    cursorReq.onsuccess = () => {
      const cur = cursorReq.result;
      if (cur && out.length < limit) {
        out.push({ id: cur.primaryKey, ...cur.value });
        cur.continue();
      } else {
        res(out);
      }
    };
    cursorReq.onerror = () => res(out);
  });
}

async function deleteEntry(id) {
  const db = await openDb();
  const store = tx(db, 'readwrite');
  return new Promise((res) => {
    const r = store.delete(id);
    r.onsuccess = () => res();
    r.onerror = () => res();
  });
}

// ───────── Fetch interception ─────────
function isLocationRequest(url, method) {
  if (method !== 'POST') return false;
  return /\/api\/admin\/taxi-trips\/[^/]+\/tracking$/.test(url.pathname);
}

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!isLocationRequest(url, event.request.method)) return;

  event.respondWith((async () => {
    let bodyText = '';
    let parsed = null;
    try {
      bodyText = await event.request.clone().text();
      parsed = JSON.parse(bodyText);
    } catch {
      return fetch(event.request);
    }
    // Seules les requêtes action:'location' sont buffered ; start/stop passent direct.
    if (!parsed || parsed.action !== 'location') {
      return fetch(event.request);
    }

    // Si on est offline → enqueue direct
    if (!self.navigator.onLine) {
      try {
        await enqueue({ url: url.toString(), body: bodyText, timestamp: Date.now() });
        notifyClients({ type: 'QUEUE_UPDATED', size: await getQueueSize() });
      } catch { /* silent */ }
      return new Response(JSON.stringify({ ok: true, queued: true }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Online : tenter le fetch, fallback queue si réseau échoue
    try {
      const res = await fetch(event.request.clone());
      // Re-tenter le drain en arrière-plan si succès
      event.waitUntil(drainQueue());
      return res;
    } catch {
      try {
        await enqueue({ url: url.toString(), body: bodyText, timestamp: Date.now() });
        notifyClients({ type: 'QUEUE_UPDATED', size: await getQueueSize() });
      } catch { /* silent */ }
      return new Response(JSON.stringify({ ok: true, queued: true }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  })());
});

// ───────── Queue drain ─────────
async function drainQueue() {
  if (!self.navigator.onLine) return;
  let batch;
  try {
    batch = await getBatch(BATCH_SIZE);
  } catch {
    return;
  }
  if (!batch.length) return;

  for (const entry of batch) {
    try {
      const res = await fetch(entry.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: entry.body,
      });
      // 2xx → delete. 4xx/5xx non-réseau → delete aussi (position trop vieille de toute façon).
      // L'erreur réseau remonte en exception → on garde l'entrée pour retry plus tard.
      await deleteEntry(entry.id);
      if (!res.ok) {
        console.warn('[sw-driver] drained with non-ok status', res.status);
      }
    } catch {
      // Erreur réseau : on stoppe le drain, on retry au prochain online.
      break;
    }
  }
  notifyClients({ type: 'QUEUE_UPDATED', size: await getQueueSize() });
}

self.addEventListener('online', () => {
  self.registration.sync?.register('taxi-position-sync').catch(() => {});
  drainQueue();
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'taxi-position-sync') {
    event.waitUntil(drainQueue());
  }
});

// ───────── Message channel ─────────
function notifyClients(msg) {
  self.clients.matchAll().then((all) => {
    for (const c of all) c.postMessage(msg);
  });
}

self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'GET_QUEUE_SIZE') {
    getQueueSize().then((size) => {
      if (event.ports[0]) {
        event.ports[0].postMessage({ type: 'QUEUE_SIZE', size });
      } else {
        event.source?.postMessage({ type: 'QUEUE_SIZE', size });
      }
    });
  }
  if (event.data.type === 'DRAIN_NOW') {
    drainQueue();
  }
});
