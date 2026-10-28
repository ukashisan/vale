// Project format (schemaVersion 1):
// {
//   id,
//   manifest: { schemaVersion, name, template, engine, entry, files[], assets[],
//               orientation, createdAt, updatedAt },
//   files:    { "<path>.js": "<source text>" },
//   assets:   { "<name>": { type: "<mime>", data: "<base64>" } },
//   saveData: { ...whatever the game stored via Vale.save() }
// }

export const SCHEMA_VERSION = 1;
export const TEMPLATES = [
  { id: 'space-shooter', name: 'Space Shooter', blurb: 'Top-down shooter. Drag to steer, auto-fire.' }
];

const PATH_RE = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,63}$/;
const ASSET_TYPES = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
                      webp: 'image/webp', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', json: 'application/json' };
const MAX_FILE_BYTES = 512 * 1024;
const MAX_ASSET_BYTES = 4 * 1024 * 1024;

function newId() {
  return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
}

function bytesToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function fetchOk(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('Could not load ' + url + ' (' + r.status + ')');
  return r;
}

export async function createFromTemplate(templateId, name) {
  const base = 'templates/' + templateId + '/';
  const manifest = await (await fetchOk(base + 'manifest.json')).json();
  const files = {};
  for (const f of manifest.files) files[f] = await (await fetchOk(base + f)).text();
  const assets = {};
  for (const a of manifest.assets) {
    const ext = a.split('.').pop().toLowerCase();
    assets[a] = { type: ASSET_TYPES[ext], data: bytesToBase64(await (await fetchOk(base + a)).arrayBuffer()) };
  }
  const now = new Date().toISOString();
  const project = {
    id: newId(),
    manifest: { ...manifest, name: name || manifest.name, createdAt: now, updatedAt: now },
    files, assets, saveData: {}
  };
  validateProject(project);
  return project;
}

// Throws an Error listing every problem. Run before saving or launching.
export function validateProject(p) {
  const errs = [];
  const m = p && p.manifest;
  if (!p || typeof p.id !== 'string' || !p.id) errs.push('missing id');
  if (!m) throw new Error('Invalid project: missing manifest');
  if (m.schemaVersion !== SCHEMA_VERSION) errs.push('unsupported schemaVersion ' + m.schemaVersion);
  if (typeof m.name !== 'string' || !m.name.trim()) errs.push('missing name');
  if (!Array.isArray(m.files) || !m.files.includes(m.entry)) errs.push('entry file not listed in files');
  for (const f of m.files || []) {
    if (!PATH_RE.test(f) || !f.endsWith('.js')) errs.push('bad file name: ' + f);
    else if (typeof p.files[f] !== 'string') errs.push('missing file: ' + f);
    else if (p.files[f].length > MAX_FILE_BYTES) errs.push('file too large: ' + f);
  }
  for (const a of m.assets || []) {
    const asset = p.assets && p.assets[a];
    if (!PATH_RE.test(a)) errs.push('bad asset name: ' + a);
    else if (!asset || typeof asset.data !== 'string') errs.push('missing asset: ' + a);
    else if (!Object.values(ASSET_TYPES).includes(asset.type)) errs.push('unsupported asset type: ' + a);
    else if (asset.data.length * 0.75 > MAX_ASSET_BYTES) errs.push('asset too large: ' + a);
  }
  if (errs.length) throw new Error('Invalid project: ' + errs.join('; '));
}
