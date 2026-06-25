# NASA Project Website

Static GitHub Pages site for the Europa radar workbook and dirty-ice sensitivity results.

The hosted site files are in `docs/`. The page includes exported v19 workbook results, the v30 workbook graph set, downloadable workbook artifacts, and browser-side sensitivity controls.

Important caveat: the v30 live controls are an interactive sensitivity model for testing assumptions. They are not an independent rerun of the Excel workbook or a NASA mission processor.

## Local Run

No install step is required. The site is static HTML, CSS, and JavaScript.

```powershell
python -m http.server 8765 --bind 127.0.0.1 --directory docs
```

Then open `http://127.0.0.1:8765/`.

## Build

There is no build pipeline. The deployable output is `docs/index.html` plus the relative assets in `docs/`.

Before publishing, run JavaScript syntax checks if Node is available:

```powershell
node --check docs/app.js
node --check docs/model.js
```

## GitHub Pages Deploy

GitHub Pages serves the static site from the `gh-pages` branch. The `main` branch keeps the source copy in `docs/`.

Deployment checklist:

1. Commit the changed `docs/` files on `main`.
2. Copy the contents of `docs/` to the root of the `gh-pages` branch.
3. Push both `main` and `gh-pages`.
4. Verify `https://tylerlee102.github.io/NASA-project/`.

Keep paths relative, such as `styles.css`, `data/v19-results.js`, and `assets/v19.xlsx`, so the project works under the GitHub Pages subpath.
