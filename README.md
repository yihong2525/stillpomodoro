# Still

A quieter way to get things done. A minimalist Pomodoro PWA in plain HTML, CSS and JavaScript, with no build step and no dependencies.

## Files
- `index.html`: the whole app (timer engine, Focus, Statistics, Settings)
- `manifest.webmanifest`, `icons/`: home-screen install
- `sw.js`: service worker that caches the app for offline use (bump `VERSION` after editing files)
- `engine.test.js`: timer logic tests. Run with `node engine.test.js index.html`

## Hosting (for install, offline and notifications)
Any static HTTPS host works. With GitHub Pages: create a repository, upload these files to the root, then Settings > Pages > Deploy from branch (main, root). Open the resulting `https://yihong2525.github.io/stillpomodoro/` on your phone and use Add to Home Screen (Safari share menu on iPhone, browser menu on Android).

## Data
Everything is stored in this browser's localStorage under `still.v1.*`. Statistics are computed from the completed focus session history, grouped by local date.
