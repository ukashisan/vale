import { store } from './storage.js';
import { TEMPLATES, createFromTemplate, validateProject } from './projects.js';
import { launch } from './player.js';

const $ = id => document.getElementById(id);
let running = null;   // { project, session }
let lastError = null;

function setStatus(text) { $('status').textContent = text; }

async function renderLibrary() {
  const list = await store.list();
  list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const ul = $('projects');
  ul.replaceChildren();
  $('empty').hidden = list.length > 0;
  for (const p of list) {
    const li = document.createElement('li');
    li.className = 'card';
    const h = document.createElement('h3');
    h.textContent = p.name;
    const meta = document.createElement('div');
    meta.className = 'muted';
    meta.textContent = p.template + ' · edited ' + new Date(p.updatedAt).toLocaleString();
    const row = document.createElement('div');
    row.className = 'row';
    row.append(
      button('Play', 'primary', () => play(p.id)),
      button('Rename', '', () => rename(p.id)),
      button('Delete', 'danger', () => remove(p.id, p.name))
    );
    li.append(h, meta, row);
    ul.append(li);
  }
}

function button(label, cls, onClick) {
  const b = document.createElement('button');
  b.textContent = label;
  if (cls) b.className = cls;
  b.addEventListener('click', onClick);
  return b;
}

async function touch(project) {
  project.manifest.updatedAt = new Date().toISOString();
  await store.put(project);
}

async function rename(id) {
  const project = await store.get(id);
  const name = prompt('Rename game', project.manifest.name);
  if (!name || !name.trim()) return;
  project.manifest.name = name.trim().slice(0, 60);
  await touch(project);
  renderLibrary();
}

async function remove(id, name) {
  if (!confirm('Delete “' + name + '”? This cannot be undone.')) return;
  await store.remove(id);
  renderLibrary();
}

function newGameDialog() {
  const fs = $('templates');
  fs.querySelectorAll('label').forEach(l => l.remove());
  TEMPLATES.forEach((t, i) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio'; input.name = 'template'; input.value = t.id; input.checked = i === 0;
    const text = document.createElement('span');
    text.innerHTML = '<strong></strong><br><span class="muted"></span>';
    text.querySelector('strong').textContent = t.name;
    text.querySelector('.muted').textContent = t.blurb;
    label.append(input, text);
    fs.append(label);
  });
  $('new-name').value = '';
  $('new-dialog').showModal();
}

$('new-dialog').addEventListener('close', async () => {
  if ($('new-dialog').returnValue !== 'ok') return;
  const templateId = document.querySelector('input[name=template]:checked').value;
  try {
    const project = await createFromTemplate(templateId, $('new-name').value.trim());
    await store.put(project);
    await renderLibrary();
    play(project.id);
  } catch (e) {
    alert('Could not create game: ' + e.message);
  }
});

async function play(id) {
  const project = await store.get(id);
  if (!project) return alert('Game not found.');
  try {
    validateProject(project);
  } catch (e) {
    return alert(e.message);
  }
  hideError();
  $('library').hidden = true;
  $('player').hidden = false;
  const session = await launch($('stage'), project, {
    onError: showError,
    onSave: async data => {
      project.saveData = data;
      await touch(project);
    }
  });
  running = { project, session };
}

function closePlayer() {
  if (running) running.session.stop();
  running = null;
  $('player').hidden = true;
  $('library').hidden = false;
  renderLibrary();
}

function showError(err) {
  lastError = err;
  $('error-text').textContent = err.message + (err.line ? ' (line ' + err.line + ')' : '') +
    (err.stack ? '\n\n' + err.stack : '');
  $('error').hidden = false;
}
function hideError() { $('error').hidden = true; lastError = null; }

$('new-btn').addEventListener('click', newGameDialog);
$('close-btn').addEventListener('click', closePlayer);
$('error-dismiss').addEventListener('click', hideError);
$('error-copy').addEventListener('click', () => {
  if (!lastError || !running) return;
  const details = 'Game: ' + running.project.manifest.name + '\n' + $('error-text').textContent;
  if (navigator.clipboard) navigator.clipboard.writeText(details).catch(() => {});
});

if (store.kind === 'indexeddb' && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
setStatus(store.kind === 'native' ? 'Saved on this iPhone (Files › Vale Maker)' : 'Saved in this browser');
renderLibrary().catch(e => setStatus('Storage error: ' + e.message));
