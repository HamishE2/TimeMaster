# TimeMaster

TimeMaster is a static, local-first resourcing and timesheet planner. It runs entirely in the browser and keeps a browser-local recovery copy in IndexedDB.

## File workflow

In a recent Chrome or Edge browser:

1. Open **File**.
2. Choose an existing JSON file, or create a new `TimeMaster.json`.
3. TimeMaster automatically saves edits back to the chosen local file. **Save now** and **Refresh from file** are also available.

TimeMaster does not connect to any data service. It reads and writes only the local file you choose.

## Development

```sh
npm install
npm run dev
```

Validation:

```sh
npm test
npm run lint
npm run build
```

The production build is a single static HTML file (`dist/index.html`). GitHub Pages serves it from https://hamishe2.github.io/TimeMaster/ (deployed by `.github/workflows/pages.yml` on every push to `main`). The app makes no network requests for application data.
