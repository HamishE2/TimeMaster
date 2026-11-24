import { SCHEMA_VERSION, migrateBackup } from './utils.js';

export const FILE_CHANGED_CODE = 'EXTERNAL_FILE_CHANGED';

const hashText = (text) => {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const revisionFor = (file, text) => ({
  name: file.name,
  lastModified: file.lastModified,
  size: file.size,
  contentHash: hashText(text),
});

export const revisionsMatch = (left, right) =>
  Boolean(
    left &&
    right &&
    left.lastModified === right.lastModified &&
    left.size === right.size &&
    left.contentHash === right.contentHash,
  );

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

export class ExternalFileChangedError extends Error {
  constructor() {
    super(
      'The attached file changed outside this tab. TimeMaster stopped before overwriting it. Refresh from file or save your work as a new copy.',
    );
    this.name = 'ExternalFileChangedError';
    this.code = FILE_CHANGED_CODE;
  }
}

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

// File handles restored from browser storage can stall forever (for example
// when the browser loses track of the file), so every call is time-boxed.
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
    revision: revisionFor(file, text),
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
          revision: revisionFor(file, text),
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

// The workspace signature of a file's text, or null when it is not JSON.
const textSignature = (text) => {
  try {
    return workspaceSignature(JSON.parse(text));
  } catch {
    return null;
  }
};

// Writes the workspace to an attached file handle.
// - `interactive` must only be true while handling a click: browsers refuse
//   (or silently ignore) permission prompts without a user gesture, so an
//   autosave reports FilePermissionError instead of asking.
// - `ownSignatures` lists workspace signatures this tab knows it wrote. When
//   the file's revision moved (a sync client touched it, or an earlier write
//   that timed out landed late) but its content is still one of ours, the
//   write goes ahead instead of reporting an external change.
export async function writeHandle(
  handle,
  data,
  expectedRevision = null,
  {
    timeoutMs = FILE_TIMEOUT_MS,
    permissionTimeoutMs = PERMISSION_TIMEOUT_MS,
    interactive = true,
    ownSignatures = [],
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

  if (expectedRevision) {
    const current = await step(handle.getFile());
    const currentText = await step(current.text());
    if (!revisionsMatch(expectedRevision, revisionFor(current, currentText))) {
      const signature = textSignature(currentText);
      if (
        !signature ||
        ![...ownSignatures, workspaceSignature(data)].includes(signature)
      )
        throw new ExternalFileChangedError();
    }
  }

  const writable = await step(handle.createWritable());
  try {
    await step(writable.write(JSON.stringify(data, null, 2)));
    await step(writable.close());
  } catch (error) {
    Promise.resolve()
      .then(() => writable.abort?.())
      .catch(() => {});
    throw error;
  }

  const saved = await step(handle.getFile());
  const savedText = await step(saved.text());
  return revisionFor(saved, savedText);
}
