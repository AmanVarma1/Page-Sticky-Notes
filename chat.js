// Ask-AI chat inside the popup.
// Runs after popup.js and reuses its globals: activeTab, notes, normalize, sendToActive, showMsg.
(() => {
  const CHAT_PREFIX = 'chat_';   // per-page chat history in chrome.storage.local (never synced or exported)
  const MAX_STORED = 30;         // messages kept per page
  const MAX_CHATS = 50;          // pages whose chat history is kept
  const $ = (id) => document.getElementById(id);
  const CHIPS = [
    'Summarize this page',
    'Explain my highlights in simple words',
    'Turn my notes into a checklist',
    'Quiz me with 5 questions on this page'
  ];

  let messages = [];             // [{ role: 'user' | 'assistant', content }]
  let busy = false;
  let loadedFor = null;

  const pageKey = () => (activeTab ? normalize(activeTab.url || '') : null);
  const chatKey = () => CHAT_PREFIX + (pageKey() || 'global');

  /* ---------------- status line ---------------- */
  function setStatus(text, isErr = false, withSettings = false) {
    const s = $('chatStatus');
    s.textContent = text || '';
    s.classList.toggle('err', isErr);
    if (withSettings) {
      const b = document.createElement('button');
      b.className = 'link';
      b.textContent = 'Open settings';
      b.addEventListener('click', () => { chrome.runtime.openOptionsPage(); window.close(); });
      s.append(' ', b);
    }
  }

  async function refreshModelLine() {
    try {
      const st = await chrome.runtime.sendMessage({ type: 'AI_STATUS' });
      if (st && st.configured) {
        $('chatModel').textContent = `${st.label} · ${st.model}`;
        return true;
      }
      $('chatModel').textContent = 'AI not set up';
      setStatus('Add your API key to start chatting.', true, true);
      return false;
    } catch {
      setStatus('The extension was reloaded. Reopen this popup.', true);
      return false;
    }
  }

  /* ---------------- history ---------------- */
  const validMsg = (m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string';

  async function loadHistory() {
    const key = chatKey();
    if (loadedFor === key) return;
    loadedFor = key;
    const res = await chrome.storage.local.get(key);
    messages = res[key] && Array.isArray(res[key].messages) ? res[key].messages.filter(validMsg) : [];
    renderLog();
  }

  async function saveHistory() {
    const key = chatKey();
    messages = messages.slice(-MAX_STORED);
    if (!messages.length) { await chrome.storage.local.remove(key); return; }
    await chrome.storage.local.set({ [key]: { messages, updated: Date.now() } });
    // keep storage tidy: drop the oldest chats beyond MAX_CHATS
    const all = await chrome.storage.local.get(null);
    const chats = Object.entries(all).filter(([k]) => k.startsWith(CHAT_PREFIX)).sort((a, b) => (b[1].updated || 0) - (a[1].updated || 0));
    if (chats.length > MAX_CHATS) await chrome.storage.local.remove(chats.slice(MAX_CHATS).map(([k]) => k));
  }

  /* ---------------- rendering ---------------- */
  function bubble(m) {
    const d = document.createElement('div');
    d.className = 'msg ' + (m.role === 'user' ? 'user' : 'ai');
    if (m.role === 'user') { d.textContent = m.content; return d; }
    const body = document.createElement('div');
    body.className = 'md';
    renderMarkdown(body, m.content);
    const bar = document.createElement('div');
    bar.className = 'msg-actions';
    const copy = document.createElement('button');
    copy.className = 'link';
    copy.textContent = 'Copy';
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(m.content); copy.textContent = 'Copied ✓'; }
      catch { copy.textContent = 'Copy failed'; }
      setTimeout(() => { copy.textContent = 'Copy'; }, 1500);
    });
    const save = document.createElement('button');
    save.className = 'link';
    save.textContent = '📝 Save as note';
    save.addEventListener('click', async () => {
      const r = await sendToActive({ type: 'ADD_NOTE', text: '🤖 **AI answer**\n' + m.content + '\n' });
      if (r && r.ok !== false) setStatus('Saved as a note on this page ✓');
    });
    bar.append(copy, save);
    d.append(body, bar);
    return d;
  }

  function renderLog(pending) {
    const log = $('chatLog');
    log.textContent = '';
    if (!messages.length && !pending) {
      const empty = document.createElement('div');
      empty.className = 'chat-empty';
      const p = document.createElement('p');
      p.textContent = 'Ask anything about this page, your highlights or your notes.';
      empty.append(p);
      for (const text of CHIPS) {
        const c = document.createElement('button');
        c.className = 'chip';
        c.textContent = text;
        c.addEventListener('click', () => { $('chatText').value = text; send(); });
        empty.append(c);
      }
      log.append(empty);
      return;
    }
    for (const m of messages) log.append(bubble(m));
    if (pending) {
      log.append(bubble({ role: 'user', content: pending }));
      const t = document.createElement('div');
      t.className = 'msg ai pending';
      t.textContent = 'Thinking…';
      log.append(t);
    }
    log.scrollTop = log.scrollHeight;
  }

  /* ---------------- context (notes + highlights + page text) ---------------- */
  async function gatherContext() {
    const key = pageKey();
    const ctx = { title: activeTab && activeTab.title || '', url: key || '', page: '', selection: '', highlights: [], notes: [] };
    let warning = '';
    const wantPage = $('ctxPage').checked, wantHl = $('ctxHl').checked, wantNotes = $('ctxNotes').checked;

    if ((wantPage || wantHl) && key && activeTab) {
      try {
        const r = await chrome.tabs.sendMessage(activeTab.id, { type: 'GET_PAGE_CONTEXT', includeText: wantPage });
        if (r && r.ok) {
          if (wantPage) ctx.page = r.text || '';
          if (wantHl) ctx.selection = r.selection || '';
          ctx.title = r.title || ctx.title;
        }
      } catch {
        warning = 'Couldn’t read this page (reload it once). Using your saved notes only.';
      }
    } else if ((wantPage || wantHl) && !key) {
      warning = 'This kind of page can’t be read. Using your saved notes only.';
    }

    if (wantHl && key) {
      ctx.highlights = notes.filter((n) => n.url === key && n.anchor && n.anchor.quote).map((n) => n.anchor.quote);
    }
    if (wantNotes) {
      const scopeAll = $('ctxScope').value === 'all';
      ctx.notes = notes
        .filter((n) => (scopeAll || n.url === key) && n.text && n.text.trim())
        .map((n) => ({ title: n.title, url: n.url, text: n.text }));
    }
    return { ctx, warning };
  }

  /* ---------------- send ---------------- */
  async function send() {
    if (busy) return;
    const ta = $('chatText');
    const text = ta.value.trim();
    if (!text) return;
    busy = true;
    ta.value = '';
    $('chatSend').disabled = true;
    setStatus('Reading your context…');
    renderLog(text);

    const { ctx, warning } = await gatherContext();
    setStatus(warning ? warning + ' Thinking…' : 'Thinking…');
    let res;
    try {
      res = await chrome.runtime.sendMessage({
        type: 'AI_CHAT',
        question: text,
        history: messages.map(({ role, content }) => ({ role, content })),
        context: ctx
      });
    } catch {
      res = { ok: false, error: 'The extension was reloaded. Reopen this popup.' };
    }
    busy = false;
    $('chatSend').disabled = false;

    if (!res || !res.ok) {
      renderLog();
      ta.value = text; // let the user retry without retyping
      setStatus((res && res.error) || 'No response from the AI.', true, !!(res && res.needsSetup));
      return;
    }
    messages.push({ role: 'user', content: text }, { role: 'assistant', content: res.text });
    await saveHistory();
    renderLog();
    setStatus(warning, false);
    $('chatModel').textContent = `${res.provider} · ${res.model}`;
  }

  /* ---------------- tab switching hook (called by popup.js) ---------------- */
  window.onScopeChange = (s) => {
    const ai = s === 'ai';
    $('chat').hidden = !ai;
    $('list').hidden = ai;
    $('search').hidden = ai;
    if (ai) {
      $('empty').hidden = true;
      enter();
    }
  };

  async function enter() {
    await loadHistory();
    const ok = await refreshModelLine();
    if (ok) setStatus('');
    $('chatText').focus();
  }

  /* ---------------- wiring ---------------- */
  chrome.storage.local.get('chatPrefs').then(({ chatPrefs }) => {
    const p = chatPrefs || {};
    if (p.page === false) $('ctxPage').checked = false;
    if (p.hl === false) $('ctxHl').checked = false;
    if (p.notes === false) $('ctxNotes').checked = false;
    if (p.scope === 'all') $('ctxScope').value = 'all';
  });
  const savePrefs = () => chrome.storage.local.set({
    chatPrefs: { page: $('ctxPage').checked, hl: $('ctxHl').checked, notes: $('ctxNotes').checked, scope: $('ctxScope').value }
  });
  ['ctxPage', 'ctxHl', 'ctxNotes', 'ctxScope'].forEach((id) => $(id).addEventListener('change', savePrefs));

  $('chatSend').addEventListener('click', send);
  $('chatText').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
  });
  $('chatClear').addEventListener('click', async () => {
    messages = [];
    await saveHistory();
    renderLog();
    setStatus('');
  });
})();
