# TimeMaster

TimeMaster is a static, local-first resourcing and timesheet planner. It runs entirely in the browser and keeps a browser-local recovery copy in IndexedDB.

## OneDrive file workflow

In a recent Chrome or Edge browser:

1. Open **File**.
2. Choose an existing JSON file inside a folder synced by the OneDrive desktop client, or create a new `TimeMaster.json` there.
3. TimeMaster automatically saves edits back to the chosen local file. **Save now** and **Refresh from file** are also available.

TimeMaster does not connect to OneDrive, Vercel APIs, or any other data service. The OneDrive desktop client is solely responsible for syncing the file. If OneDrive produces a conflict copy, keep both copies, compare them, and choose the newest complete JSON file after reviewing the contents.

## Development

```sh
npm install
npm run dev
```

## Desktop application

Run TimeMaster in Electron:

```sh
npm run desktop
```

Build the Windows installer and portable executable into `release/`:

```sh
npm run desktop:dist
```

The desktop build remains local-first and offline. Use **File** in TimeMaster to
open or save the JSON workspace; Electron's Chromium renderer provides the same
file workflow as the browser app.

Validation:

```sh
npm test
npm run lint
npm run build
```

The production build is a dependency-free static HTML artifact. Vercel serves it with a restrictive Content Security Policy, including `connect-src 'none'`, so the deployed app cannot send application data over HTTP, WebSocket, EventSource, or beacon connections.
