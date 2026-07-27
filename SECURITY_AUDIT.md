# TimeMaster Security Audit

**Verdict:** Application workspace data (clients, projects, timesheets, hours) is **not sent to Vercel or any cloud API by the app**. Vercel only hosts and serves a static HTML/JS shell. Persistence is browser-local (IndexedDB + File System Access / downloads). The main leak risks are **shared devices/browser profiles**, **user-chosen OneDrive sync**, and **exported files** — not server-side data exfiltration.

Live site checked: `https://time.fergohamish.com` (200, CSP live, no `/api` routes).

---

## 1. Architecture (what the app actually is)

TimeMaster is a **static, local-first SPA**:

- Runtime deps: React + ReactDOM only
- Build: Vite single-file HTML (`vite-plugin-singlefile`)
- Deploy: Vercel static hosting (`vercel.json` → `dist/`)
- **No backend, no auth, no database, no API routes**
- Live probes: `/` → 200 HTML; `/api`, `/api/hello`, `/robots.txt` → 404

The app shell is public. User data never lives on Vercel storage.

---

## 2. Absolute priority: does work data go to Vercel / cloud?

### Application path: **No**

| Mechanism | Present? | Effect |
|---|---|---|
| `fetch` / XHR / WebSocket / EventSource / `sendBeacon` in app code | **No** | Nothing to POST timesheet JSON |
| Analytics / Sentry / gtag / Vercel Speed Insights | **No** | No third-party telemetry SDKs |
| CSP `connect-src 'none'` (live) | **Yes** | Browser blocks outbound app network connections |
| Server APIs that accept uploads | **No** | Nothing to receive JSON/CSV |
| IndexedDB / File System Access | Local only | Never transmitted by the app |

JSON/CSV open, save, import, export, delete, and edit all stay in:

1. React memory
2. Browser IndexedDB (`ResourcingTrackerDB`)
3. A local file the user attaches (or a downloaded Blob)

### What Vercel *does* see (platform, not app data)

On every page load Vercel/CDN still observes normal HTTP request metadata:

- IP address / geo hints
- User-Agent
- URL path (`/`, favicon)
- Response headers / cache (`X-Vercel-Id`, `Age`, etc.)

That is **not** client/project/timesheet content. It is unavoidable for serving any public static site.

### User-chosen cloud sync (outside the app)

If the user attaches `TimeMaster.json` inside a **OneDrive-synced folder**, the **OneDrive desktop client** (Microsoft) syncs that file. TimeMaster does not call OneDrive APIs; the README’s design is explicit about that. Same for Dropbox/iCloud/Google Drive folders.

**Bottom line:** Zero timesheet payload to Vercel via app networking. Cloud sync only happens if the user puts the file in a synced folder themselves.

---

## 3. Complete data-handling map

### 3.1 Data model (what’s stored)

Workspace JSON roughly:

    {
      schemaVersion, exportedAt,
      projects: [{
        id, name, client, code, status, color, isBillable,
        resourcedHours, monthlyResourcedHours, weeklyOverrides, monthlyOverrides,
        entries: { weekKey: { dayIndex: hours } },
        tasks, taskEntries, taskRows, frontloads,
        hiddenWeeks, visibleOnwardsFrom, hiddenOnwardsFrom, archived,
        createdAt, ...
      }],
      settings: { visibleDays, leaveWeeks, capacityByDay, theme }
    }

Sensitive/business content is in **project names, client names, codes, task names, hours, leave**. There are no email/phone/employee-name fields, but client/project strings are still confidential work data.

### 3.2 Read / open JSON

`backupService.openBackup()` / `readHandle()`:

1. `showOpenFilePicker` (Chromium) or `<input type="file">` fallback
2. `file.text()` → `JSON.parse` → `migrateBackup()` in memory
3. Result attached in React state; never uploaded

### 3.3 Write / save / autosave JSON

`writeHandle()`:

1. Request `readwrite` permission on the FileSystemHandle
2. Compare expected revision (name/lastModified/size/content hash) to detect external changes
3. `createWritable()` → write `JSON.stringify(payload)` locally
4. Return new revision metadata

Autosave (~800ms debounce) only when a file is attached. Conflict → stop writing (`EXTERNAL_FILE_CHANGED`), do not overwrite.

### 3.4 Create new file / Save As

`showSaveFilePicker` → local write, or download Blob `TimeMaster.json` if File System Access unavailable.

### 3.5 Export JSON / CSV

`downloadBackup` / `downloadTimesheetCsv`:

- `Blob` + `URL.createObjectURL` + `<a download>`
- Local download only; object URL revoked after ~500ms

CSV columns: Date, Day, Project, Client, Code, Task, Hours — full timesheet dump to the user’s disk.

### 3.6 Import CSV

`ImportModal` + `FileReader.readAsText` + `parseCSV` entirely in-browser. Parsed projects merge into in-memory state, then follow the normal IDB/file save path. File contents never leave the browser via the app.

### 3.7 Delete / hide / archive

- Hide week / onwards: updates project visibility fields in memory → saved like any edit
- Permanent delete: removes project from the projects array
- Task line remove: drops that week’s task hours/rows
- **No server delete.** Clearing UI state does not wipe disk JSON until the next successful local save. `clearSessionFromIdb()` exists in code but is **not wired into the UI** — there is no “clear browser recovery copy” / logout control.

### 3.8 IndexedDB recovery copy (important)

DB: `ResourcingTrackerDB` → store `SessionStore` → key `currentSession`

Stored object:

- Full workspace `data` (all projects/settings/entries)
- `fileHandle` (browser File System Access handle, when granted)
- `weekKey`, `fileRevision`, `savedSignature`

On load, App restores this session automatically. Scope is **per origin + per browser profile**. This is the highest-impact local residual-data store.

### 3.9 Delete of uploaded/attached files

The app does **not** delete the user’s JSON from disk. “Delete project” only edits the in-memory/workspace document. Removing the file itself is a user/OS/OneDrive action.

---

## 4. Identifiable information & fingerprinting

### In the workspace (user-entered / business PII-adjacent)

- Client names, project names, project codes
- Task/phase names
- Daily/weekly hour logs (work pattern fingerprint)
- Leave days
- Created timestamps, theme, capacity settings
- Sample data names if used: “Contoso Pty Ltd”, “Northwind”, etc.

No dedicated personal identity fields (email, staff name, payroll ID). Still: a filled file is a detailed commercial timesheet.

### App-side fingerprinting / identifiers

| Signal | Purpose | Sent off-device? |
|---|---|---|
| `showOpenFilePicker` / `showSaveFilePicker` check | Gate non-Chromium browsers | No (local) |
| `crypto.randomUUID()` project IDs | Local IDs | No |
| File revision hash (FNV-style over file text) + size/mtime | Conflict detection | No |
| `en-AU` date formatting | Display | No |
| Theme `system` / light / dark | UI | No |
| Canvas / Audio / WebRTC / battery / cookies | Not used | — |

### Platform / network fingerprinting (page load only)

Anyone hitting the URL gives Vercel standard request metadata (IP, UA, TLS, region — live edge seen as `iad1`). CSP/Referrer-Policy reduce cross-site leakage; they don’t hide the fact that the IP requested the static shell.

App does not implement its own tracking cookies or localStorage analytics. IndexedDB is functional storage, not marketing fingerprinting.

---

## 5. What a random visitor gets at `time.fergohamish.com`

Anyone worldwide can open it (AU geo middleware was **removed**; currently no auth, no IP allowlist).

They get:

1. Static TimeMaster UI (“Local-first resourcing and timesheet planning.”)
2. Empty workspace **or** whatever is already in *their* browser’s IndexedDB for this origin
3. Ability to create projects, import CSV, attach a local JSON, export
4. Full client-side source in the bundled HTML (logic is visible; that’s expected for a static SPA)
5. On non-Chromium: message that TimeMaster requires Chromium-based browsers

They do **not** get:

- Anyone else’s timesheet
- Any server-stored projects
- Access to another visitor’s IndexedDB or files

Hardening on the live response includes: CSP with `connect-src 'none'`, `X-Frame-Options: DENY`, `COOP: same-origin`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex…`, HSTS, Permissions-Policy disabling camera/mic/geo/etc. `Access-Control-Allow-Origin: *` appears on the static asset (Vercel/CDN behavior); it does not expose private timesheet data because none is server-hosted.

**Public surface = the empty app + your branding domain.** Not a multi-tenant data store.

---

## 6. Multiple people using it

There is **no multi-user product model** (no accounts, roles, or server isolation). “Multi-user” is entirely about shared computers and shared files.

| Scenario | What happens | Leak risk |
|---|---|---|
| Different people, different browsers/devices | Isolated empty/local workspaces | None between users via the app |
| Same browser profile, same machine | **Shared IndexedDB** — next person can see prior workspace on reload | **High** |
| Same PC, separate OS users / browser profiles | Isolated | Low |
| Same OneDrive `TimeMaster.json` | Concurrent edits → conflict copies / blocked overwrite | Integrity risk; confidentiality if folder is shared too broadly |
| Two tabs, same profile | Both autosave; file revision guard helps; IDB last-write-wins | Integrity / surprise data loss more than cross-user leak |
| Shared kiosk / borrowed laptop without clearing site data | Residual IDB + possibly re-granted file handle | **High** |

Practical rule: **one browser profile = one person’s confidential workspace.** There is no in-app “sign out / wipe recovery copy.”

---

## 7. Can data leak? (ranked)

### Does **not** leak via the app to Vercel

- Opening/saving/importing/exporting JSON or CSV
- Typing hours, clients, projects
- Autosave / IndexedDB cache
- CSP blocks connect-family APIs even if code tried

### Can leak (real residual / operational risks)

1. **Shared browser profile / uncleared IndexedDB** — full workspace recovery for the next user of that profile
2. **OneDrive (or any sync folder)** — Microsoft (or other sync provider) receives the JSON the user chose to place there
3. **Exported JSON/CSV left on disk, email, chat, USB**
4. **Wrong people given access to the synced folder / file**
5. **Browser extensions / malware / screen share / shoulder surfing**
6. **DevTools** on an unlocked session — data is in memory and IDB
7. **Conflict-copy mishandling** — stale or alternate copies lingering in OneDrive

### Lower / theoretical

- XSS would be serious (data is all client-side), but React text escaping + tight CSP help; there is no remote script host under current CSP
- `script-src 'unsafe-inline'` is required by the single-file build — weaker than hashes/nonces, but still no external script origins
- Dead/legacy modules (`useStore.js`, `StartupModal.jsx`, older components) are **not** on the live App path; ignore for runtime egress, tidy later for maintainability

---

## 8. JSON lifecycle (explicit)

| Action | Where data goes |
|---|---|
| Upload / choose JSON | Browser memory only |
| Parse / migrate / edit | Memory |
| Autosave / Save now | Attached local file (if any) |
| Browser recovery | IndexedDB on that device/profile |
| Refresh from file | Re-read local file → replace memory |
| Download backup / CSV | User Downloads (local Blob) |
| Import CSV | Memory → then IDB/file as above |
| Delete project in UI | Removed from memory/document; persisted on next local save |
| Close tab | Memory gone; IDB + disk file remain |
| Clear site data in browser | Wipes IDB; disk JSON untouched |
| Put file in OneDrive folder | Synced by OneDrive client, not by TimeMaster |

---

## 9. Controls that matter (what’s strong today)

- Local-first design with no application backend for data
- Live CSP `connect-src 'none'`
- No analytics / error-reporting SDKs shipping payloads
- External-change detection before overwrite
- `noindex` headers/meta
- Chromium File System Access gate for the primary workflow
- Tests asserting offline bundle + CSP connect-none

## 10. Gaps / recommendations (if you want harder guarantees)

1. **UI “Clear browser recovery copy”** that calls `clearSessionFromIdb()` (and ideally revokes file permission guidance)
2. **Shared-device warning** on first load when IDB already has a session
3. Revisit whether **public unauthenticated** hosting is intentional; optional access control (VPN, Basic Auth at edge, allowlist) protects the *shell*, not data-at-rest (data isn’t on the server anyway)
4. Remind users: **don’t put `TimeMaster.json` in a broadly shared sync folder** if Microsoft/other cloud presence is unacceptable
5. Prefer separate browser profiles per person on shared machines
6. Optional: CSP nonces/hashes instead of `'unsafe-inline'` if build pipeline allows

---

### Short answers to your core questions

- **Sent to Vercel?** Not the timesheet/client/work JSON. Only static asset request metadata.
- **Where does uploaded JSON go?** Memory → optional local file write → IndexedDB recovery. Nowhere else via the app.
- **Random visitor?** Empty (or their own IDB) functional app; cannot see others’ data.
- **Multiple people?** No server multi-tenancy; isolation is by browser profile and by who has the file. Shared profile = shared data.
- **Can data leak?** Not through Vercel APIs. Yes through shared browsers, exports, and user-chosen sync providers.
