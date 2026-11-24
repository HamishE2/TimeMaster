const DB_NAME = 'ResourcingTrackerDB';
const DB_VERSION = 1;
const STORE_NAME = 'SessionStore';

// One shared connection: opening a new one for every autosave leaked
// connections and let writes race each other. Transactions on a single
// connection run in the order they are created, so the latest write wins.
let dbPromise = null;

function getDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      // Another tab upgrading the database, or the browser closing it, must
      // not leave us holding a dead connection.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

// Settles when the transaction commits, and rejects when it errors or aborts
// (a quota failure aborts without firing onerror, which used to leave the
// promise pending forever).
const settle = (tx, resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () =>
    reject(tx.error || new Error('The browser storage write was aborted.'));
};

// Chrome cannot store a file handle again once it loses track of the file
// ("DataError: Failed to write blobs"). The workspace must still be kept, so
// a failed write is retried without the handle.
export async function writeSessionRecord(put, record) {
  try {
    await put(record);
    return { handleStored: Boolean(record.fileHandle) };
  } catch (error) {
    if (!record.fileHandle) throw error;
    await put({ ...record, fileHandle: null });
    return { handleStored: false };
  }
}

export async function saveSessionToIdb(
  fileHandle,
  weekKey,
  data,
  fileRevision = null,
  savedSignature = null,
) {
  const db = await getDB();
  const put = (record) =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record, 'currentSession');
      settle(tx, resolve, reject);
    });
  return writeSessionRecord(put, {
    fileHandle,
    weekKey,
    data,
    fileRevision,
    savedSignature,
  });
}

export async function loadSessionFromIdb() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get('currentSession');
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function clearSessionFromIdb() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete('currentSession');
    settle(tx, resolve, reject);
  });
}
