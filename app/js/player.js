// Runs a project inside a sandboxed iframe.
//
// The iframe gets sandbox="allow-scripts" only (no allow-same-origin), so the
// game runs in an opaque origin: it cannot read the app's storage, cookies or
// DOM, and its CSP blocks all network access. The only channel back to the
// app is postMessage, handled below with a small whitelist of message kinds.

import { validateProject } from './projects.js';

const ENGINE_URL = 'vendor/phaser-3.90.0.min.js';
const MAX_SAVE_BYTES = 64 * 1024;

const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'media-src data: blob:',
  'connect-src data: blob:',
  'font-src data:'
].join('; ');

let engineSource;
async function loadEngine() {
  if (!engineSource) {
    const r = await fetch(ENGINE_URL);
    if (!r.ok) throw new Error('Game engine failed to load (' + r.status + ')');
    engineSource = await r.text();
  }
  return engineSource;
}

// Make text safe to place inside an inline <script> element.
function scriptSafe(code) {
  return code.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
}
function jsonSafe(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

// Runs inside the game frame before the engine and game code.
function hostShim() {
  const post = msg => parent.postMessage(Object.assign({ vale: 1 }, msg), '*');
  window.onerror = (message, source, line, col, err) => {
    post({ kind: 'error', message: String(message), line, col, stack: err && err.stack ? String(err.stack) : '' });
  };
  window.addEventListener('unhandledrejection', e => {
    const r = e.reason;
    post({ kind: 'error', message: 'Unhandled promise rejection: ' + (r && r.message ? r.message : String(r)), stack: r && r.stack ? String(r.stack) : '' });
  });
  for (const level of ['log', 'warn', 'error']) {
    const orig = console[level].bind(console);
    console[level] = (...args) => {
      orig(...args);
      try { post({ kind: 'log', level, text: args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ').slice(0, 2000) }); } catch (_) {}
    };
  }
  const boot = window.__VALE_BOOT__;
  delete window.__VALE_BOOT__;
  const urls = {};
  for (const name in boot.assets) urls[name] = 'data:' + boot.assets[name].type + ';base64,' + boot.assets[name].data;
  window.Vale = Object.freeze({
    saveData: boot.saveData,
    asset(name) {
      if (!(name in urls)) throw new Error('Unknown asset: ' + name);
      return urls[name];
    },
    save(data) { post({ kind: 'save', data: JSON.parse(JSON.stringify(data)) }); }
  });
}

export async function buildDocument(project) {
  validateProject(project);
  const engine = await loadEngine();
  const m = project.manifest;
  // Entry file runs last so helper files can define things it uses.
  const order = m.files.filter(f => f !== m.entry).concat(m.entry);
  const gameScripts = order.map(f =>
    '<script data-file="' + f + '">' + scriptSafe(project.files[f]) + '\n//# sourceURL=' + f + '\n</script>'
  ).join('\n');
  const boot = { assets: project.assets || {}, saveData: project.saveData || {} };
  return '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta http-equiv="Content-Security-Policy" content="' + CSP + '">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">' +
    '<style>html,body{margin:0;height:100%;background:#070a10;overflow:hidden;touch-action:none;' +
    '-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}#game{position:fixed;inset:0}</style>' +
    '</head><body><div id="game"></div>' +
    '<script>window.__VALE_BOOT__=' + jsonSafe(boot) + ';(' + hostShim.toString() + ')();</script>' +
    '<script>' + scriptSafe(engine) + '</script>' +
    gameScripts +
    '<script>parent.postMessage({vale:1,kind:"ready"},"*");</script>' +
    '</body></html>';
}

// Mounts the game in `container`. Returns { stop() }.
// handlers: onError(err), onSave(data), onLog(entry), onReady()
export async function launch(container, project, handlers) {
  const html = await buildDocument(project);
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.setAttribute('allow', 'autoplay; fullscreen');
  frame.className = 'game-frame';
  frame.title = project.manifest.name;

  function onMessage(e) {
    if (e.source !== frame.contentWindow || !e.data || e.data.vale !== 1) return;
    const msg = e.data;
    if (msg.kind === 'error') handlers.onError && handlers.onError(msg);
    else if (msg.kind === 'log') handlers.onLog && handlers.onLog(msg);
    else if (msg.kind === 'ready') handlers.onReady && handlers.onReady();
    else if (msg.kind === 'save') {
      const json = JSON.stringify(msg.data);
      if (json && json.length <= MAX_SAVE_BYTES) handlers.onSave && handlers.onSave(JSON.parse(json));
      else handlers.onError && handlers.onError({ message: 'Vale.save(): data must be JSON and under 64 KB' });
    }
  }
  window.addEventListener('message', onMessage);
  frame.srcdoc = html;
  container.appendChild(frame);
  frame.focus();

  return {
    stop() {
      window.removeEventListener('message', onMessage);
      frame.remove();
    }
  };
}
