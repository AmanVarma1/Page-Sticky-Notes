const PREFIX = 'note_';
const COLORS = ['yellow', 'pink', 'blue', 'green', 'orange', 'purple', 'teal', 'gray'];
const $ = (id) => document.getElementById(id);

function normalize(url) {
  try {
    const u = new URL(url);
    if (!/^(https?|file):$/.test(u.protocol)) return null;
    u.hash = '';
    return u.href;
  } catch { return null; }
}

async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { theme: 'auto', sync: false, ...(settings || {}) };
}
async function patchSettings(patch) {
  const s = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ settings: s });
}

function setStatus(id, text, ok = true) {
  const el = $(id);
  el.textContent = text || '';
  el.className = 'status' + (text ? (ok ? ' ok' : ' err') : '');
}

async function refreshCount() {
  const all = await chrome.storage.local.get(null);
  const n = Object.keys(all).filter((k) => k.startsWith(PREFIX)).length;
  $('count').textContent = `You have ${n} note${n === 1 ? '' : 's'} saved on this device.`;
}

function showSyncStatus(st, enabled) {
  if (!enabled) { setStatus('syncStatus', 'Sync is off. Notes stay on this device only.', true); return; }
  if (!st) { setStatus('syncStatus', 'Starting sync…', true); return; }
  const when = new Date(st.at).toLocaleTimeString();
  setStatus('syncStatus', `${st.msg} · ${when}`, st.ok);
}

/* ---------- Import validation ---------- */
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v, d, min, max) => (Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : d);

function cleanNote(r) {
  if (!r || typeof r !== 'object') return null;
  if (typeof r.id !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(r.id)) return null;
  const url = normalize(r.url);
  if (!url) return null;
  const now = Date.now();
  const n = {
    id: r.id,
    url,
    title: str(r.title, 300),
    text: str(r.text, 20000),
    color: COLORS.includes(r.color) ? r.color : 'yellow',
    x: num(r.x, 40, 0, 100000),
    y: num(r.y, 40, 0, 1000000),
    w: num(r.w, 240, 160, 1200),
    h: num(r.h, 200, 90, 1200),
    min: !!r.min,
    pinned: !!r.pinned,
    reminder: Number.isFinite(r.reminder) && r.reminder > now ? r.reminder : null,
    created: num(r.created, now, 0, 1e14),
    updated: num(r.updated, now, 0, 1e14)
  };
  if (n.pinned) { n.fx = num(r.fx, 20, 0, 5000); n.fy = num(r.fy, 20, 0, 5000); }
  if (r.anchor && typeof r.anchor.quote === 'string' && r.anchor.quote) {
    n.anchor = {
      quote: str(r.anchor.quote, 1500),
      prefix: str(r.anchor.prefix, 60),
      suffix: str(r.anchor.suffix, 60)
    };
  }
  return n;
}


/* ---------- Groq AI settings ---------- */
const GROQ_KEY_STORAGE = 'groqApiKey';
const GROQ_MODEL_STORAGE = 'groqModel';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

async function loadGroqSettings() {
  const saved = await chrome.storage.local.get([GROQ_KEY_STORAGE, GROQ_MODEL_STORAGE]);
  $('groqApiKey').value = saved[GROQ_KEY_STORAGE] || '';
  $('groqModel').value = saved[GROQ_MODEL_STORAGE] || 'openai/gpt-oss-20b';
}

async function saveGroqSettings() {
  const key = $('groqApiKey').value.trim();
  const model = $('groqModel').value.trim() || 'openai/gpt-oss-20b';
  if (key && (key.length < 20 || !/^gsk_[A-Za-z0-9_-]+$/.test(key))) {
    setStatus('groqStatus', 'That API key does not look valid. Paste the full Groq key (usually starts with gsk_).', false);
    throw new Error('Invalid Groq API key format');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{1,127}$/.test(model)) {
    setStatus('groqStatus', 'Enter a valid model ID (letters, numbers, ., _, / or -).', false);
    throw new Error('Invalid model ID');
  }
  if (key) await chrome.storage.local.set({ [GROQ_KEY_STORAGE]: key, [GROQ_MODEL_STORAGE]: model });
  else await chrome.storage.local.remove(GROQ_KEY_STORAGE);
  if (!key) await chrome.storage.local.set({ [GROQ_MODEL_STORAGE]: model });
  setStatus('groqStatus', key ? 'Groq settings saved on this device.' : 'API key removed. Add a key before using Ask AI.', !!key);
  return { key, model };
}

async function testGroqConnection() {
  let saved;
  try { saved = await saveGroqSettings(); } catch { return; }
  const { key, model } = saved;
  if (!key) { setStatus('groqStatus', 'Paste your Groq API key first.', false); return; }
  const button = $('testGroq');
  button.disabled = true;
  button.textContent = 'Testing…';
  setStatus('groqStatus', 'Testing Groq connection…');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with OK.' }], max_tokens: 8, temperature: 0 }),
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || `HTTP ${response.status}`);
    setStatus('groqStatus', `Connection successful with ${model}.`, true);
  } catch (err) {
    setStatus('groqStatus', err.name === 'AbortError' ? 'Connection test timed out. Try again.' : `Connection failed: ${err.message}`, false);
  } finally {
    clearTimeout(timeout);
    button.disabled = false;
    button.textContent = 'Save & test connection';
  }
}

/* ---------- Wire up the page ---------- */
(async () => {
  const s = await getSettings();
  $('theme').value = s.theme;
  $('sync').checked = !!s.sync;
  await loadGroqSettings();
  $('toggleGroqKey').addEventListener('click', () => {
    const field = $('groqApiKey');
    field.type = field.type === 'password' ? 'text' : 'password';
    $('toggleGroqKey').textContent = field.type === 'password' ? 'Show' : 'Hide';
  });
  $('saveGroq').addEventListener('click', async () => {
    try { await saveGroqSettings(); } catch { /* validation message is shown beside the controls */ }
  });
  $('testGroq').addEventListener('click', testGroqConnection);
  const { syncStatus } = await chrome.storage.local.get('syncStatus');
  showSyncStatus(syncStatus, s.sync);
  refreshCount();

  $('theme').addEventListener('change', () => patchSettings({ theme: $('theme').value }));

  $('sync').addEventListener('change', async () => {
    await patchSettings({ sync: $('sync').checked });
    showSyncStatus(null, $('sync').checked);
  });

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;
    if (changes.syncStatus) showSyncStatus(changes.syncStatus.newValue, (await getSettings()).sync);
    if (Object.keys(changes).some((k) => k.startsWith(PREFIX))) refreshCount();
  });

  $('export').addEventListener('click', async () => {
    const all = await chrome.storage.local.get(null);
    const notes = Object.entries(all).filter(([k, v]) => k.startsWith(PREFIX) && v).map(([, v]) => v);
    const payload = { app: 'page-sticky-notes', version: 1, exportedAt: new Date().toISOString(), notes };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sticky-notes-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    setStatus('backupStatus', `Exported ${notes.length} note${notes.length === 1 ? '' : 's'}.`, true);
  });

  $('import').addEventListener('click', () => $('importFile').click());

  $('importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const list = Array.isArray(data) ? data : data && data.notes;
      if (!Array.isArray(list)) throw new Error('this file has no notes in it');
      const existing = await chrome.storage.local.get(null);
      const toSet = {};
      let imported = 0, skipped = 0;
      for (const raw of list.slice(0, 5000)) {
        const n = cleanNote(raw);
        if (!n) { skipped++; continue; }
        const cur = existing[PREFIX + n.id];
        if (cur && (cur.updated || 0) >= n.updated) { skipped++; continue; }
        toSet[PREFIX + n.id] = n;
        imported++;
      }
      if (imported) await chrome.storage.local.set(toSet);
      setStatus('backupStatus', `Imported ${imported} note${imported === 1 ? '' : 's'}${skipped ? `, skipped ${skipped} (invalid or already up to date)` : ''}.`, true);
    } catch (err) {
      setStatus('backupStatus', 'Import failed: ' + err.message, false);
    }
    e.target.value = '';
  });
})();
