// Project storage. Two backends with the same async API:
//  - native: the iOS shell (WKScriptMessageHandlerWithReply "store"), which
//    writes each project as a folder in the app's Documents directory.
//  - indexeddb: browsers / Home Screen web app.

const nativeStore = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.store;

const native = {
  kind: 'native',
  list: () => nativeStore.postMessage({ op: 'list' }),
  get: id => nativeStore.postMessage({ op: 'get', id }),
  put: project => nativeStore.postMessage({ op: 'put', project }),
  remove: id => nativeStore.postMessage({ op: 'remove', id })
};

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('vale-maker', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('projects', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise;
function tx(mode, fn) {
  dbPromise = dbPromise || openDb();
  return dbPromise.then(db => new Promise((resolve, reject) => {
    const t = db.transaction('projects', mode);
    const req = fn(t.objectStore('projects'));
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
  }));
}

const idb = {
  kind: 'indexeddb',
  list: () => tx('readonly', s => s.getAll()).then(all => all.map(p => ({ id: p.id, ...p.manifest }))),
  get: id => tx('readonly', s => s.get(id)).then(p => p || null),
  put: project => tx('readwrite', s => s.put(project)).then(() => true),
  remove: id => tx('readwrite', s => s.delete(id)).then(() => true)
};

export const store = nativeStore ? native : idb;

// Ask the browser not to evict our data under storage pressure.
if (!nativeStore && navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}
