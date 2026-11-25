// The browser-copy store must settle every write (a quota abort used to
// leave it pending forever) and recover from a closed connection.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

let fake;
function installFakeIndexedDb() {
  fake = { opens: 0, outcome: 'complete', stored: new Map(), dbs: [] };
  globalThis.indexedDB = {
    open() {
      fake.opens += 1;
      const request = {};
      setTimeout(() => {
        const db = {
          objectStoreNames: { contains: () => fake.opens > 1 },
          createObjectStore: () => {},
          close: vi.fn(),
          transaction() {
            const tx = { error: null };
            const store = {
              put: (value, key) => fake.stored.set(key, value),
              delete: (key) => fake.stored.delete(key),
              get: (key) => {
                const get = {};
                setTimeout(() => {
                  get.result = fake.stored.get(key);
                  get.onsuccess?.();
                });
                return get;
              },
            };
            tx.objectStore = () => store;
            setTimeout(() => {
              if (fake.outcome === 'abort') {
                tx.error = new DOMException('Quota exceeded', 'QuotaExceededError');
                tx.onabort?.();
              } else tx.oncomplete?.();
            }, 1);
            return tx;
          },
        };
        fake.dbs.push(db);
        request.result = db;
        request.onupgradeneeded?.({ target: { result: db } });
        request.onsuccess?.();
      });
      return request;
    },
  };
}

beforeEach(() => {
  vi.resetModules();
  installFakeIndexedDb();
});
afterEach(() => {
  delete globalThis.indexedDB;
});

test('a write aborted by the browser (quota) rejects instead of hanging', async () => {
  const { saveSessionToIdb } = await import('../src/lib/idb.js');
  fake.outcome = 'abort';
  await expect(
    saveSessionToIdb({ fileHandle: null, weekKey: '2026-07-13', data: { projects: [] } }),
  ).rejects.toMatchObject({ name: 'QuotaExceededError' });
  // Space freed: the next write goes through on the same connection.
  fake.outcome = 'complete';
  await saveSessionToIdb({ fileHandle: null, weekKey: '2026-07-13', data: { projects: [1] } });
  expect(fake.stored.get('currentSession').data).toEqual({ projects: [1] });
  expect(fake.opens).toBe(1);
});

test('reuses one connection and reopens after another tab upgrades it', async () => {
  const { saveSessionToIdb, loadSessionFromIdb } = await import(
    '../src/lib/idb.js'
  );
  await saveSessionToIdb({ fileHandle: null, weekKey: '2026-07-13', data: { projects: [] } });
  await saveSessionToIdb({ fileHandle: null, weekKey: '2026-07-20', data: { projects: [] } });
  expect(fake.opens).toBe(1);
  fake.dbs[0].onversionchange();
  expect(fake.dbs[0].close).toHaveBeenCalled();
  expect((await loadSessionFromIdb()).weekKey).toBe('2026-07-20');
  expect(fake.opens).toBe(2);
});
