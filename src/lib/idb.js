const DB_NAME = 'ResourcingTrackerDB';
const DB_VERSION = 1;
const STORE_NAME = 'SessionStore';
const SESSION_KEY = 'currentSession';

function getDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

function putRecord(db, value, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

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
  try {
    return await writeSessionRecord(
      (record) => putRecord(db, record, SESSION_KEY),
      { fileHandle, weekKey, data, fileRevision, savedSignature },
    );
  } finally {
    db.close();
  }
}

export async function loadSessionFromIdb() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(SESSION_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

export async function clearSessionFromIdb() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(SESSION_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}
