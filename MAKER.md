# Vale Maker — Phase 1 prototype

iPhone-first game maker. Phase 1 proves the runtime: a bundled Phaser game runs
in a local, sandboxed player with touch controls, and projects are saved on the
device and reopen offline. AI generation comes in Phase 2.

## Layout

| Path | What |
| --- | --- |
| `app/` | Web app: project library + game player. Runs as-is in Safari / Home Screen, and is bundled into the iOS app. |
| `app/js/player.js` | Builds the game document and runs it in a sandboxed iframe. |
| `app/js/projects.js` | Project schema, template loading, validation. |
| `app/js/storage.js` | Storage: native bridge on iOS, IndexedDB in browsers. |
| `app/templates/space-shooter/` | The bundled known-good game template. |
| `app/vendor/` | Phaser 3.90.0 (MIT), bundled so games run offline. |
| `ios/` | Native shell: SwiftUI + WKWebView, serves `app/` from the bundle. |
| `scripts/smoke-test.mjs` | Headless end-to-end test of the web build. |

## Run

**Web (any browser):** serve `app/` over HTTP, e.g. `cd app && python3 -m http.server`,
then open `http://localhost:8000`. On iPhone: open the hosted URL in Safari →
Share → Add to Home Screen. Works offline after the first load.

**iOS app (needs a Mac with Xcode 16+):**

```sh
brew install xcodegen
cd ios && xcodegen generate && open ValeMaker.xcodeproj
```

Set your signing team and a unique bundle ID, then run on a device. Projects are
stored as folders in the app's Documents, visible in Files › On My iPhone › Vale Maker.

**Test:** `npm install --no-save playwright && npx playwright install chromium && node scripts/smoke-test.mjs`

## Project format (schemaVersion 1)

```
manifest.json   { schemaVersion, name, template, engine, entry, files[], assets[], orientation, createdAt, updatedAt }
src/*.js        game source (entry runs last)
assets/*        images/audio, loaded via Vale.asset(name)
save.json       data the game stored via Vale.save(obj); read back as Vale.saveData
```

In IndexedDB the same data is one record; on iOS it is one folder per project.

## Sandbox

Game code runs in an `<iframe sandbox="allow-scripts">` (opaque origin) with a CSP
that blocks all network access. It cannot read app storage, the native bridge, or
any secrets. Its only channel out is `postMessage`, limited to `error`, `log`,
`ready`, and `save` (≤ 64 KB JSON). The native `store` bridge only answers the
top-level frame.
