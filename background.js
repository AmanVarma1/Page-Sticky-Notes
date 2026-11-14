// Page Sticky Notes - background service worker
const PREFIX = 'note_';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function normalize(url) {
  try {
    const u = new URL(url);
    if (!/^(https?|file):$/.test(u.protocol)) return null;
    u.hash = '';
    return u.href;
  } catch {
    return null;
  }
}

function hostOf(url) {
  try { return new URL(url).hostname || url; } catch { return url || ''; }
}

function plain(text) {
  const first = (text || '').split('\n').find((l) => l.trim()) || '';
  return first
    .replace(/^\s*[-*•]\s+(\[[ xX]\]\s*)?/, '')
    .replace(/^#{1,3}\s+/, '')
    .replace(/\*\*|`/g, '')
    .replace(/(^|\s)\*([^*]+)\*/g, '$1$2')
    .trim();
}

async function sendToTab(tabId, msg) {
  try {
    return await chrome.tabs.sendMessage(tabId, msg);
  } catch {
    return null; // page not scriptable or needs a refresh
  }
}

/* ------------------------------------------------------------------ */
/* Context menu + keyboard commands                                    */
/* ------------------------------------------------------------------ */
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'add-sticky-note', title: 'Add sticky note to this page', contexts: ['page'] });
    chrome.contextMenus.create({ id: 'add-note-with-text', title: 'Add sticky note with selected text', contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'highlight-note', title: 'Highlight selection and add note', contexts: ['selection'] });
  });
  try { chrome.action.setBadgeTextColor({ color: '#000000' }); } catch {}
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || tab.id == null) return;
  if (info.menuItemId === 'add-sticky-note') sendToTab(tab.id, { type: 'ADD_NOTE' });
  if (info.menuItemId === 'add-note-with-text') sendToTab(tab.id, { type: 'ADD_NOTE', text: info.selectionText || '' });
  if (info.menuItemId === 'highlight-note') sendToTab(tab.id, { type: 'ADD_NOTE', highlight: true });
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id == null) return;
  if (command === 'add-note') sendToTab(tab.id, { type: 'ADD_NOTE' });
  if (command === 'highlight-note') sendToTab(tab.id, { type: 'ADD_NOTE', highlight: true });
  if (command === 'toggle-notes') sendToTab(tab.id, { type: 'TOGGLE_VISIBILITY' });
});

/* ------------------------------------------------------------------ */
/* Badge: number of notes on the current page                          */
/* ------------------------------------------------------------------ */
async function updateBadge(tabId, url) {
  const key = normalize(url || '');
  if (!key) {
    chrome.action.setBadgeText({ tabId, text: '' });
    return;
  }
  const all = await chrome.storage.local.get(null);
  let n = 0;
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith(PREFIX) && v && v.url === key) n++;
  }
  chrome.action.setBadgeText({ tabId, text: n ? String(n) : '' });
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#f5c518' });
}

async function refreshActiveTabs() {
  const tabs = await chrome.tabs.query({ active: true });
  for (const t of tabs) if (t.id != null) updateBadge(t.id, t.url);
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') updateBadge(tabId, tab.url);
});
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    updateBadge(tabId, tab.url);
  } catch {}
});

/* ------------------------------------------------------------------ */
/* Reminders (chrome.alarms + notifications)                           */
/* ------------------------------------------------------------------ */
async function syncAlarms() {
  const all = await chrome.storage.local.get(null);
  const existing = await chrome.alarms.getAll();
  const want = new Set();
  for (const [k, n] of Object.entries(all)) {
    if (!k.startsWith(PREFIX) || !n || !n.reminder) continue;
    want.add(k);
    const ex = existing.find((a) => a.name === k);
    if (!ex || Math.abs(ex.scheduledTime - n.reminder) > 1000) {
      chrome.alarms.create(k, { when: Math.max(n.reminder, Date.now() + 1000) });
    }
  }
  for (const a of existing) {
    if (a.name.startsWith(PREFIX) && !want.has(a.name)) chrome.alarms.clear(a.name);
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith(PREFIX)) return;
  const key = alarm.name;
  const note = (await chrome.storage.local.get(key))[key];
  if (!note || !note.reminder) return;
  if (note.reminder > Date.now() + 5000) { // rescheduled meanwhile
    chrome.alarms.create(key, { when: note.reminder });
    return;
  }
  chrome.notifications.create(key, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Sticky note reminder',
    message: (plain(note.text) || '(empty note)').slice(0, 200),
    contextMessage: hostOf(note.url),
    priority: 2,
    requireInteraction: true
  });
  note.reminder = null;
  note.updated = Date.now();
  await chrome.storage.local.set({ [key]: note });
});

chrome.notifications.onClicked.addListener(async (notifId) => {
  if (!notifId.startsWith(PREFIX)) return;
  const note = (await chrome.storage.local.get(notifId))[notifId];
  chrome.notifications.clear(notifId);
  if (!note) return;
  const tabs = await chrome.tabs.query({});
  const open = tabs.find((t) => normalize(t.url || '') === note.url);
  if (open) {
    await chrome.tabs.update(open.id, { active: true });
    try { await chrome.windows.update(open.windowId, { focused: true }); } catch {}
    sendToTab(open.id, { type: 'FOCUS_NOTE', id: note.id });
  } else {
    await chrome.storage.local.set({ pendingFocus: note.id });
    chrome.tabs.create({ url: note.url });
  }
});

/* ------------------------------------------------------------------ */
/* Cross-device sync (chrome.storage.sync mirror of the notes)         */
/* ------------------------------------------------------------------ */
let syncEnabled = false;
const lastPushed = new Map(); // key -> updated timestamp already in sync storage
const pendingSync = new Set();
let flushTimer = null;
const encoder = new TextEncoder();

const ready = (async () => {
  const { settings } = await chrome.storage.local.get('settings');
  syncEnabled = !!(settings && settings.sync);
})();

// Sync storage allows 8,192 bytes per item
const tooBig = (key, note) => encoder.encode(key + JSON.stringify(note)).length > 8000;

async function setSyncStatus(ok, msg) {
  await chrome.storage.local.set({ syncStatus: { ok, msg, at: Date.now() } });
}

function queueSync(key) {
  pendingSync.add(key);
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flushSync, 1500);
}

async function flushSync() {
  const keys = [...pendingSync];
  pendingSync.clear();
  if (!keys.length || !syncEnabled) return;
  const local = await chrome.storage.local.get(keys);
  const toSet = {};
  const toRemove = [];
  let skipped = 0;
  for (const k of keys) {
    const n = local[k];
    if (!n) { toRemove.push(k); lastPushed.delete(k); continue; }
    if (tooBig(k, n)) { skipped++; continue; }
    if (lastPushed.get(k) === n.updated) continue;
    toSet[k] = n;
    lastPushed.set(k, n.updated);
  }
  try {
    if (Object.keys(toSet).length) await chrome.storage.sync.set(toSet);
    if (toRemove.length) await chrome.storage.sync.remove(toRemove);
    await setSyncStatus(true, skipped ? `Synced (${skipped} note(s) too large to sync)` : 'Synced');
  } catch (e) {
    await setSyncStatus(false, (e && e.message) || 'Sync failed');
  }
}

async function fullSync() {
  try {
    const [loc, rem] = await Promise.all([chrome.storage.local.get(null), chrome.storage.sync.get(null)]);
    const toLocal = {};
    const toSync = {};
    let skipped = 0;
    for (const [k, n] of Object.entries(rem)) {
      if (!k.startsWith(PREFIX) || !n || typeof n.url !== 'string') continue;
      const l = loc[k];
      if (!l || (n.updated || 0) > (l.updated || 0)) { toLocal[k] = n; lastPushed.set(k, n.updated); }
    }
    for (const [k, n] of Object.entries(loc)) {
      if (!k.startsWith(PREFIX) || !n) continue;
      const r = rem[k];
      if (r && (r.updated || 0) >= (n.updated || 0)) continue;
      if (tooBig(k, n)) { skipped++; continue; }
      toSync[k] = n;
      lastPushed.set(k, n.updated);
    }
    if (Object.keys(toLocal).length) await chrome.storage.local.set(toLocal);
    if (Object.keys(toSync).length) await chrome.storage.sync.set(toSync);
    await setSyncStatus(true, skipped ? `Synced (${skipped} note(s) too large to sync)` : 'Synced');
  } catch (e) {
    await setSyncStatus(false, (e && e.message) || 'Sync failed');
  }
}

/* ------------------------------------------------------------------ */
/* Storage change router                                               */
/* ------------------------------------------------------------------ */
chrome.storage.onChanged.addListener(async (changes, area) => {
  await ready;

  if (area === 'local') {
    if (changes.settings) {
      const was = syncEnabled;
      syncEnabled = !!(changes.settings.newValue && changes.settings.newValue.sync);
      if (syncEnabled && !was) fullSync();
    }
    let touched = false;
    for (const [k, ch] of Object.entries(changes)) {
      if (!k.startsWith(PREFIX)) continue;
      touched = true;
      const nv = ch.newValue;
      if (nv && nv.reminder) chrome.alarms.create(k, { when: Math.max(nv.reminder, Date.now() + 1000) });
      else chrome.alarms.clear(k);
      if (syncEnabled) queueSync(k);
    }
    if (touched) refreshActiveTabs();
    return;
  }

  if (area === 'sync' && syncEnabled) {
    const setLocal = {};
    const removeLocal = [];
    for (const [k, ch] of Object.entries(changes)) {
      if (!k.startsWith(PREFIX)) continue;
      const nv = ch.newValue;
      if (!nv) { removeLocal.push(k); lastPushed.delete(k); continue; }
      if (typeof nv.url !== 'string') continue;
      const l = (await chrome.storage.local.get(k))[k];
      if (!l || (nv.updated || 0) > (l.updated || 0)) {
        setLocal[k] = nv;
        lastPushed.set(k, nv.updated);
      }
    }
    if (Object.keys(setLocal).length) await chrome.storage.local.set(setLocal);
    if (removeLocal.length) await chrome.storage.local.remove(removeLocal);
  }
});

/* ------------------------------------------------------------------ */
// AI requests use the Groq integration in the popup. Note sync/export only
// process note_* entries, so AI credentials are never synced or exported.
