"use client";

/**
 * §7/§8 offline queue: `/my-day` is used by field crews who lose signal —
 * basements, underground parking, industrial zones. Every mutating call from
 * that screen goes through here instead of a bare `fetch`: if the network is
 * up it behaves exactly like a direct call, and if it isn't, the request is
 * persisted in IndexedDB and retried automatically once connectivity (or the
 * next page load) comes back, instead of silently failing.
 *
 * Deliberately a plain IndexedDB wrapper, not a service worker — this app has
 * no service worker/PWA manifest yet, and a page-lifetime outbox that drains
 * on `online` + on mount covers the realistic case (a worker's phone regains
 * signal while the tab is still open, or they reopen the tab) without that
 * larger lift.
 */

const DB_NAME = "myday-offline-queue";
const STORE_NAME = "outbox";
const DB_VERSION = 1;

export type QueuedRequest = {
  /** Also the request's idempotency key where the endpoint supports one, so a queued-then-retried write is never double-applied. */
  id: string;
  url: string;
  method: "POST" | "PATCH";
  body: unknown;
  createdAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putItem(item: QueuedRequest): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function removeItem(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listQueue(): Promise<QueuedRequest[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result as QueuedRequest[]);
    req.onerror = () => reject(req.error);
  });
}

export async function queueLength(): Promise<number> {
  return (await listQueue()).length;
}

/**
 * Sends the JSON body now; if the network itself fails (offline, DNS, etc. —
 * `fetch` throwing, not a non-2xx response), the request is queued instead
 * and treated as accepted so the UI can proceed optimistically. A real HTTP
 * error (validation, 403, ...) is returned as-is — retrying that later would
 * never succeed, so it is never queued.
 */
export async function sendOrQueue(
  id: string,
  url: string,
  method: "POST" | "PATCH",
  body: unknown
): Promise<{ ok: boolean; queued: boolean; body: unknown }> {
  try {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => null);
    return { ok: res.ok, queued: false, body: json };
  } catch {
    await putItem({ id, url, method, body, createdAt: Date.now() });
    return { ok: true, queued: true, body: null };
  }
}

/**
 * Retries every queued request, oldest first. Stops at the first network
 * failure to preserve order for the next attempt.
 *
 * §MD-04 — a 4xx here can mean two different things: a plain validation
 * problem (drop silently, it was never going to succeed), or a genuine
 * conflict — the task this update targets was reassigned to someone else
 * while the device was offline (`task.resourceId` no longer matches what the
 * client believed, so the status route now 403s it — see
 * plans/tasks/[taskId]/status/route.ts). The second case must not vanish
 * silently: the worker queued a real update that was never applied, and
 * needs to know their task list changed under them.
 */
export async function drainQueue(): Promise<{ sent: number; remaining: number; conflicts: number }> {
  if (typeof navigator === "undefined" || !navigator.onLine) return { sent: 0, remaining: await queueLength(), conflicts: 0 };
  const items = (await listQueue()).sort((a, b) => a.createdAt - b.createdAt);
  let sent = 0;
  let conflicts = 0;
  for (const item of items) {
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.body),
      });
      if (res.status === 403) {
        // Reassigned/no-longer-yours — resending will never succeed, but
        // this is a real dropped update, not a validation no-op.
        await removeItem(item.id);
        conflicts++;
      } else if (res.ok || (res.status >= 400 && res.status < 500)) {
        // 2xx: delivered. Other 4xx: the server actively rejected it (e.g.
        // already superseded) — resending unchanged will not fix that either.
        await removeItem(item.id);
        sent++;
      } else {
        break;
      }
    } catch {
      break;
    }
  }
  return { sent, remaining: await queueLength(), conflicts };
}
