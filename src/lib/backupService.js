import { SCHEMA_VERSION, migrateBackup } from './utils.js';

// The attached file is a plain copy of the workspace. The browser copy
// (IndexedDB) is the working copy and is always saved; writing the file
// replaces its whole content. Syncing it (for example with OneDrive) is the
// operating system's job, so TimeMaster treats it as an ordinary local file.

export const backupPayload = (projects, settings) => ({
  schemaVersion: SCHEMA_VERSION,
  exportedAt: new Date().toISOString(),
  projects,
  settings,
});

export const workspaceSignature = (data) =>
  JSON.stringify({
    schemaVersion: data?.schemaVersion ?? SCHEMA_VERSION,
    projects: data?.projects ?? [],
    settings: data?.settings ?? {},
  });

export const supportsFileSystemAccess = () =>
  typeof window !== 'undefined' &&
  typeof window.showOpenFilePicker === 'function' &&
  typeof window.showSaveFilePicker === 'function';

// Saves a Blob through a temporary download link. The link is attached to the
// page while it is clicked (older Firefox ignores detached links) and the
// object URL outlives the click long enough for slower browsers to read it.
export function downloadBlob(blob, name) {
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = name;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 30000);
}

export function downloadBackup(data, name = 'TimeMaster-backup.json') {
  downloadBlob(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    name,
  );
}

export const FILE_UNRESPONSIVE_CODE = 'FILE_HANDLE_UNRESPONSIVE';
export const FILE_TIMEOUT_MS = 10000;
// A permission prompt waits on the person, so it gets longer than file I/O.
export const PERMISSION_TIMEOUT_MS = 60000;

export class FileUnresponsiveError extends Error {
  constructor(name) {
    super(
      `The browser stopped responding while reaching ${name || 'the attached file'}. Choose Reattach and save in File and pick the file again; your changes in this tab are kept.`,
    );
    this.name = 'FileUnresponsiveError';
    this.code = FILE_UNRESPONSIVE_CODE;
  }
}

// A file handle can stall forever (for example when the browser loses track
// of the file), so every call is time-boxed.
export function withTimeout(promise, ms, name) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new FileUnresponsiveError(name)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

export async function readHandle(handle, timeoutMs = FILE_TIMEOUT_MS) {
  const file = await withTimeout(handle.getFile(), timeoutMs, handle.name);
  const text = await withTimeout(file.text(), timeoutMs, handle.name);
  return {
    handle,
    data: migrateBackup(JSON.parse(text)),
    name: file.name,
    lastModified: file.lastModified,
  };
}

export async function openBackup() {
  if (supportsFileSystemAccess()) {
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      types: [
        {
          description: 'TimeMaster JSON',
          accept: { 'application/json': ['.json'] },
        },
      ],
    });
    return readHandle(handle);
  }

  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    // Safari only opens pickers for inputs that are part of the page.
    document.body.appendChild(input);
    input.oncancel = () => {
      input.remove();
      reject(new DOMException('No file was chosen.', 'AbortError'));
    };
    input.onchange = async () => {
      input.remove();
      try {
        const file = input.files[0];
        if (!file) throw new DOMException('No file was chosen.', 'AbortError');
        const text = await file.text();
        resolve({
          handle: null,
          data: migrateBackup(JSON.parse(text)),
          name: file.name,
          lastModified: file.lastModified,
        });
      } catch (error) {
        reject(error);
      }
    };
    input.click();
  });
}

export async function chooseNewBackupHandle(suggestedName = 'TimeMaster.json') {
  if (!supportsFileSystemAccess()) return null;
  return window.showSaveFilePicker({
    suggestedName,
    types: [
      {
        description: 'TimeMaster JSON',
        accept: { 'application/json': ['.json'] },
      },
    ],
  });
}

export const FILE_PERMISSION_CODE = 'FILE_PERMISSION_REQUIRED';

export class FilePermissionError extends Error {
  constructor(name) {
    super(
      `TimeMaster needs your permission to keep saving ${name || 'the attached file'}. Choose Save now in File to allow it.`,
    );
    this.name = 'FilePermissionError';
    this.code = FILE_PERMISSION_CODE;
  }
}

// Writes the whole workspace to an attached file handle.
// `interactive` must only be true while handling a click: browsers refuse (or
// silently ignore) permission prompts without a user gesture, so an autosave
// reports FilePermissionError instead of asking.
export async function writeHandle(
  handle,
  data,
  {
    timeoutMs = FILE_TIMEOUT_MS,
    permissionTimeoutMs = PERMISSION_TIMEOUT_MS,
    interactive = true,
  } = {},
) {
  const step = (promise, ms = timeoutMs) => withTimeout(promise, ms, handle.name);
  const permission = { mode: 'readwrite' };
  if (
    typeof handle.queryPermission === 'function' &&
    (await step(handle.queryPermission(permission))) !== 'granted'
  ) {
    if (!interactive || typeof handle.requestPermission !== 'function')
      throw new FilePermissionError(handle.name);
    if (
      (await step(handle.requestPermission(permission), permissionTimeoutMs)) !==
      'granted'
    )
      throw new Error('Permission to write the TimeMaster file was not granted.');
  }

  const writable = await step(handle.createWritable());
  try {
    await step(
      Promise.resolve()
        .then(() => writable.write(JSON.stringify(data, null, 2)))
        .then(() => writable.close()),
      timeoutMs * 2,
    );
  } catch (error) {
    // Leave the file as it was rather than half-written.
    Promise.resolve()
      .then(() => writable.abort?.())
      .catch(() => {});
    throw error;
  }
  return new Date();
}
