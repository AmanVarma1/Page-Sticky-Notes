// Page Sticky Notes - content script
(() => {
  if (window.__pageStickyNotesLoaded) return;
  window.__pageStickyNotesLoaded = true;

  const PREFIX = 'note_';
  const COLORS = {
    yellow: { light: ['#fff9a8', '#f7e463'], dark: ['#4a4520', '#6b6320'], hl: '255,235,59' },
    pink:   { light: ['#ffd1e3', '#ff9fc4'], dark: ['#4d2a3a', '#7a3d59'], hl: '255,128,171' },
    blue:   { light: ['#cfe8ff', '#8fc4f7'], dark: ['#243b52', '#35597d'], hl: '100,181,246' },
    green:  { light: ['#d4f5c9', '#9bdc86'], dark: ['#263f27', '#3a6b3c'], hl: '129,199,132' },
    orange: { light: ['#ffe0b8', '#ffbf75'], dark: ['#4d3720', '#7a5528'], hl: '255,183,77' },
    purple: { light: ['#e6d6ff', '#b99cf5'], dark: ['#3a2f55', '#5b4a8a'], hl: '186,155,245' },
    teal:   { light: ['#c9f2ef', '#7fd6cf'], dark: ['#1f4542', '#2f726d'], hl: '77,208,200' },
    gray:   { light: ['#e8e8e8', '#bdbdbd'], dark: ['#333333', '#4d4d4d'], hl: '189,189,189' }
  };
  const COLOR_ORDER = Object.keys(COLORS);

  const SHADOW_CSS = `
    :host { all: initial; }
    .note {
      position: absolute; display: flex; flex-direction: column;
      min-width: 210px; min-height: 120px; box-sizing: border-box;
      border-radius: 6px; overflow: hidden; resize: both;
      box-shadow: 0 8px 22px rgba(0,0,0,.28), 0 1px 3px rgba(0,0,0,.2);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg); color: var(--fg);
    }
    .note.dark { color-scheme: dark; box-shadow: 0 8px 22px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.08); }
    .note.pinned { position: fixed; }
    .note.flash { animation: flash 1.2s ease 2; }
    @keyframes flash { 50% { outline: 4px solid #ff5252; outline-offset: 2px; } }
    .head {
      display: flex; align-items: center; gap: 2px; padding: 4px 6px;
      background: var(--head); cursor: grab; user-select: none; touch-action: none;
    }
    .head.drag { cursor: grabbing; }
    .title {
      flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
      font-size: 11px; font-weight: 600; letter-spacing: .03em; opacity: .7;
    }
    .btn {
      all: unset; box-sizing: border-box; flex: none; width: 20px; height: 20px; line-height: 20px;
      text-align: center; font-size: 12px; border-radius: 4px; cursor: pointer; color: var(--fg);
    }
    .btn:hover { background: rgba(0,0,0,.16); }
    .btn.on { background: rgba(0,0,0,.24); }
    .btn.confirm { background: #e53935; color: #fff; }
    .dot { display: inline-block; width: 12px; height: 12px; margin-top: 4px; border-radius: 50%; border: 2px solid rgba(0,0,0,.45); }
    .dark .dot { border-color: rgba(255,255,255,.7); }
    .rem {
      display: none; align-items: center; gap: 4px; flex-wrap: wrap;
      padding: 5px 6px; background: rgba(0,0,0,.08);
    }
    .note.remopen .rem { display: flex; }
    .rem input {
      flex: 1; min-width: 130px; font: 12px -apple-system, "Segoe UI", Roboto, sans-serif;
      color: var(--fg); background: rgba(255,255,255,.55); border: 1px solid rgba(0,0,0,.2);
      border-radius: 4px; padding: 2px 4px;
    }
    .dark .rem input { background: rgba(0,0,0,.35); border-color: rgba(255,255,255,.25); }
    .mini {
      all: unset; box-sizing: border-box; padding: 2px 8px; border-radius: 4px;
      background: rgba(0,0,0,.2); cursor: pointer; font-size: 11px; color: var(--fg);
    }
    .mini:hover { background: rgba(0,0,0,.32); }
    .tools {
      display: none; align-items: center; gap: 2px; padding: 3px 6px;
      border-bottom: 1px solid rgba(0,0,0,.1);
    }
    .note.editing .tools { display: flex; }
    .tb {
      all: unset; box-sizing: border-box; width: 24px; height: 22px; line-height: 22px;
      text-align: center; font-size: 13px; border-radius: 4px; cursor: pointer; color: var(--fg);
    }
    .tb:hover { background: rgba(0,0,0,.16); }
    .hint { margin-left: auto; font-size: 10px; opacity: .5; white-space: nowrap; overflow: hidden; }
    .view {
      flex: 1; overflow: auto; box-sizing: border-box; padding: 8px 10px; cursor: text;
      font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      word-break: break-word;
    }
    .view.empty::before { content: 'Click to write…'; opacity: .5; }
    .view .p { min-height: 1.45em; }
    .view .h { font-weight: 700; font-size: 15px; }
    .view .li, .view .cl { display: flex; gap: 6px; }
    .view .li .b { flex: none; }
    .view .cl input { flex: none; margin: 3px 0 0; cursor: pointer; }
    .view .cl.done .t { text-decoration: line-through; opacity: .6; }
    .view a { color: inherit; text-decoration: underline; }
    .view code { background: rgba(0,0,0,.14); padding: 0 3px; border-radius: 3px; font: 12px ui-monospace, Menlo, Consolas, monospace; }
    textarea {
      display: none; flex: 1; width: 100%; box-sizing: border-box; border: 0; outline: 0; resize: none;
      background: transparent; padding: 8px 10px; color: var(--fg);
      font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .note.editing textarea { display: block; }
    .note.editing .view { display: none; }
    .note.min { resize: none; min-height: 0; }
    .note.min .view, .note.min textarea, .note.min .tools, .note.min .rem { display: none !important; }
  `;

  let host = null, root = null, hidden = false, currentKey = null, zTop = 1, theme = 'auto';
  const items = new Map();   // id -> { note, el, ta, refresh, jumpBtn, setEditing }
  const timers = new Map();
  const ranges = new Map();  // id -> Range (live highlight anchor)
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const isDark = () => theme === 'dark' || (theme === 'auto' && mq.matches);

  const guard = (fn) => { try { return fn(); } catch { /* extension was reloaded */ } };

  function pageKey() {
    const u = new URL(location.href);
    u.hash = '';
    return u.href;
  }

  function ensureHost() {
    if (host && host.isConnected) return;
    host = document.createElement('div');
    host.id = '__page_sticky_notes_host__';
    host.style.cssText = 'all:initial;position:absolute;top:0;left:0;width:0;height:0;z-index:2147483647;';
    root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = SHADOW_CSS;
    root.appendChild(style);
    document.documentElement.appendChild(host);
    for (const it of items.values()) root.appendChild(it.el);
    host.style.display = hidden ? 'none' : '';
  }

  function save(note, delay = 300) {
    clearTimeout(timers.get(note.id));
    timers.set(note.id, setTimeout(() => {
      note.updated = Date.now();
      guard(() => chrome.storage.local.set({ [PREFIX + note.id]: { ...note } }));
    }, delay));
  }

  function removeLocal(id) {
    const it = items.get(id);
    if (!it) return;
    it.el.remove();
    items.delete(id);
    if (ranges.delete(id)) paintHighlights();
  }

  /* ---------------- Formatting (markdown-lite, built with DOM nodes) ---------------- */
  function renderInline(parent, s) {
    const re = /(\*\*[^*\n]+?\*\*|\*[^*\s][^*\n]*?\*|`[^`\n]+`|https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g;
    let last = 0, m;
    while ((m = re.exec(s))) {
      if (m.index > last) parent.append(s.slice(last, m.index));
      const t = m[0];
      let node;
      if (t.startsWith('**')) { node = document.createElement('strong'); node.textContent = t.slice(2, -2); }
      else if (t.startsWith('*')) { node = document.createElement('em'); node.textContent = t.slice(1, -1); }
      else if (t.startsWith('`')) { node = document.createElement('code'); node.textContent = t.slice(1, -1); }
      else {
        node = document.createElement('a');
        node.href = t; node.textContent = t; node.target = '_blank'; node.rel = 'noopener noreferrer';
      }
      parent.append(node);
      last = m.index + t.length;
    }
    if (last < s.length) parent.append(s.slice(last));
  }

  const mk = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };

  function toLocalInput(ts) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  /* ---------------- Highlight anchors (text selection -> note) ---------------- */
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT']);
  let hlStyleReady = false;

  function ensureHighlightStyle() {
    if (hlStyleReady) return;
    hlStyleReady = true;
    const css = COLOR_ORDER.map((c) => `::highlight(sn-${c}){background-color:rgba(${COLORS[c].hl},.55);color:#111;}`).join('\n');
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    } catch {
      const s = document.createElement('style');
      s.textContent = css;
      (document.head || document.documentElement).appendChild(s);
    }
  }

  function paintHighlights() {
    if (!window.CSS || !CSS.highlights || typeof Highlight === 'undefined') return;
    if (ranges.size) ensureHighlightStyle();
    const byColor = {};
    for (const [id, r] of ranges) {
      const it = items.get(id);
      (byColor[it ? it.note.color : 'yellow'] ||= []).push(r);
    }
    for (const c of COLOR_ORDER) {
      if (byColor[c]) CSS.highlights.set('sn-' + c, new Highlight(...byColor[c]));
      else CSS.highlights.delete('sn-' + c);
    }
  }

  function buildIndex() {
    const nodes = [];
    let text = '';
    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        return !p || SKIP_TAGS.has(p.tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    while (walker.nextNode()) {
      const n = walker.currentNode;
      nodes.push({ n, start: text.length });
      text += n.data;
    }
    return { nodes, text };
  }

  function anchorFromSelection() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    const { nodes, text } = buildIndex();
    let start = -1, end = -1;
    for (const { n, start: s } of nodes) {
      if (!range.intersectsNode(n)) continue;
      const a = n === range.startContainer ? range.startOffset : 0;
      const b = n === range.endContainer ? range.endOffset : n.data.length;
      if (start < 0) start = s + a;
      end = s + b;
    }
    if (start < 0 || end <= start) return null;
    while (start < end && /\s/.test(text[start])) start++;
    while (end > start && /\s/.test(text[end - 1])) end--;
    if (end <= start) return null;
    end = Math.min(end, start + 1500);
    const idx = { nodes, text };
    const liveRange = rangeFor(idx, start, end);
    if (!liveRange) return null;
    return {
      anchor: {
        quote: text.slice(start, end),
        prefix: text.slice(Math.max(0, start - 40), start),
        suffix: text.slice(end, end + 40)
      },
      range: liveRange,
      rect: liveRange.getBoundingClientRect()
    };
  }

  function findAnchor(a, idx) {
    const { text } = idx;
    let best = -1, bestScore = -1, from = 0, guardCount = 0;
    while (guardCount++ < 300) {
      const i = text.indexOf(a.quote, from);
      if (i < 0) break;
      let score = 0;
      const pre = text.slice(Math.max(0, i - a.prefix.length), i);
      for (let k = 1; k <= Math.min(pre.length, a.prefix.length); k++) {
        if (pre[pre.length - k] === a.prefix[a.prefix.length - k]) score++; else break;
      }
      const suf = text.slice(i + a.quote.length, i + a.quote.length + a.suffix.length);
      for (let k = 0; k < Math.min(suf.length, a.suffix.length); k++) {
        if (suf[k] === a.suffix[k]) score++; else break;
      }
      if (score > bestScore) { bestScore = score; best = i; }
      from = i + 1;
    }
    return best;
  }

  function rangeFor(idx, start, end) {
    const r = document.createRange();
    let startSet = false;
    for (const { n, start: s } of idx.nodes) {
      const e = s + n.data.length;
      if (!startSet && start >= s && start < e) { r.setStart(n, start - s); startSet = true; }
      if (startSet && end > s && end <= e) { r.setEnd(n, end - s); return r; }
    }
    return null;
  }

  function resolveAnchors() {
    for (const [id, r] of ranges) {
      if (r.collapsed || !r.startContainer.isConnected) ranges.delete(id);
    }
    const pending = [...items.values()].filter((it) => it.note.anchor && !ranges.has(it.note.id));
    if (pending.length) {
      const idx = buildIndex();
      for (const it of pending) {
        const a = it.note.anchor;
        const s = findAnchor(a, idx);
        if (s < 0) continue;
        const r = rangeFor(idx, s, s + a.quote.length);
        if (r) ranges.set(it.note.id, r);
      }
    }
    paintHighlights();
  }

  let resolveTimers = [];
  function scheduleResolve() {
    resolveTimers.forEach(clearTimeout);
    resolveTimers = [0, 1000, 3000, 7000, 15000, 30000].map((d) => setTimeout(() => guard(resolveAnchors), d));
  }

  function jumpToHighlight(id) {
    let r = ranges.get(id);
    if (!r) { resolveAnchors(); r = ranges.get(id); }
    const it = items.get(id);
    if (!r) { if (it) it.jumpBtn.title = 'Highlighted text not found on this page'; return; }
    const rect = r.getBoundingClientRect();
    window.scrollTo({ top: Math.max(0, window.scrollY + rect.top - 140), behavior: 'smooth' });
  }

  /* ---------------- Rendering a note ---------------- */
  function render(note) {
    ensureHost();
    if (items.has(note.id)) return items.get(note.id);

    const el = document.createElement('div');
    el.className = 'note';
    el.innerHTML = `
      <div class="head">
        <span class="title">Note</span>
        <button class="btn jump" title="Scroll to highlighted text">🔗</button>
        <button class="btn remb" title="Set a reminder">⏰</button>
        <button class="btn pin" title="Pin to screen">📌</button>
        <button class="btn color" title="Change colour"><span class="dot"></span></button>
        <button class="btn min" title="Minimize / expand">–</button>
        <button class="btn del" title="Delete note">✕</button>
      </div>
      <div class="rem">
        <input type="datetime-local">
        <button class="mini set">Set</button>
        <button class="mini clr">Clear</button>
      </div>
      <div class="tools">
        <button class="tb" data-act="bold" title="Bold (Ctrl+B)"><b>B</b></button>
        <button class="tb" data-act="italic" title="Italic (Ctrl+I)"><i>I</i></button>
        <button class="tb" data-act="bullet" title="Bulleted list">•</button>
        <button class="tb" data-act="check" title="Checklist">☑</button>
        <span class="hint">**bold**  *italic*</span>
      </div>
      <div class="view"></div>
      <textarea placeholder="Write your note…" spellcheck="true"></textarea>`;
    root.appendChild(el);

    const q = (s) => el.querySelector(s);
    const head = q('.head'), title = q('.title'), ta = q('textarea'), view = q('.view');
    const dot = q('.dot'), tools = q('.tools'), remInput = q('.rem input');
    const btnJump = q('.jump'), btnRem = q('.remb'), btnPin = q('.pin');
    const btnColor = q('.color'), btnMin = q('.min'), btnDel = q('.del');
    let editing = false;

    function renderView() {
      view.textContent = '';
      view.classList.toggle('empty', !note.text.trim());
      const lines = note.text.split('\n');
      lines.forEach((line, i) => {
        let m;
        if ((m = /^(\s*)[-*•]\s+\[( |x|X)\]\s?(.*)$/.exec(line))) {
          const row = mk('div', 'cl' + (m[2] !== ' ' ? ' done' : ''));
          row.style.paddingLeft = Math.min(m[1].length, 8) * 6 + 'px';
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = m[2] !== ' ';
          cb.addEventListener('change', () => {
            const ls = note.text.split('\n');
            ls[i] = ls[i].replace(/\[( |x|X)\]/, cb.checked ? '[x]' : '[ ]');
            note.text = ls.join('\n');
            ta.value = note.text;
            save(note, 0);
            renderView();
          });
          const t = mk('span', 't');
          renderInline(t, m[3]);
          row.append(cb, t);
          view.append(row);
        } else if ((m = /^(\s*)[-*•]\s+(.*)$/.exec(line))) {
          const row = mk('div', 'li');
          row.style.paddingLeft = Math.min(m[1].length, 8) * 6 + 'px';
          const b = mk('span', 'b');
          b.textContent = '•';
          const t = mk('span', 't');
          renderInline(t, m[2]);
          row.append(b, t);
          view.append(row);
        } else if ((m = /^#{1,3}\s+(.*)$/.exec(line))) {
          const h = mk('div', 'h');
          renderInline(h, m[1]);
          view.append(h);
        } else {
          const p = mk('div', 'p');
          renderInline(p, line);
          view.append(p);
        }
      });
    }

    function refresh() {
      const c = COLORS[note.color] || COLORS.yellow;
      const dark = isDark();
      const p = dark ? c.dark : c.light;
      el.classList.toggle('dark', dark);
      el.style.setProperty('--bg', p[0]);
      el.style.setProperty('--head', p[1]);
      el.style.setProperty('--fg', dark ? '#f2f2f2' : '#222');
      dot.style.background = c.light[1];
      const pinned = !!note.pinned;
      el.classList.toggle('pinned', pinned);
      el.style.left = (pinned ? (note.fx ?? 20) : note.x) + 'px';
      el.style.top = (pinned ? (note.fy ?? 20) : note.y) + 'px';
      el.style.width = note.w + 'px';
      el.classList.toggle('min', !!note.min);
      el.style.height = note.min ? 'auto' : note.h + 'px';
      btnMin.textContent = note.min ? '+' : '–';
      btnPin.classList.toggle('on', pinned);
      btnPin.title = pinned ? 'Unpin (scroll with the page)' : 'Pin to screen (stay visible while scrolling)';
      btnRem.classList.toggle('on', !!note.reminder);
      btnRem.title = note.reminder ? 'Reminder: ' + new Date(note.reminder).toLocaleString() : 'Set a reminder';
      btnJump.style.display = note.anchor ? '' : 'none';
      title.textContent = note.anchor ? '“' + note.anchor.quote.replace(/\s+/g, ' ').slice(0, 28) + '”' : 'Note';
      title.title = note.anchor ? note.anchor.quote.slice(0, 300) : '';
      if (root.activeElement !== ta && ta.value !== note.text) ta.value = note.text;
      renderView();
    }

    function setEditing(v) {
      editing = v;
      el.classList.toggle('editing', v);
      if (v) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
      else renderView();
    }

    refresh();

    /* --- editing: view <-> textarea --- */
    view.addEventListener('click', (e) => {
      if (e.target.closest('a, input')) return;
      setEditing(true);
    });
    ta.addEventListener('blur', () => setEditing(false));
    ta.addEventListener('input', () => { note.text = ta.value; save(note); });

    const fireInput = () => ta.dispatchEvent(new Event('input', { bubbles: true }));

    function wrapSel(mark) {
      const s = ta.selectionStart, e = ta.selectionEnd;
      const sel = ta.value.slice(s, e);
      if (sel.length >= mark.length * 2 && sel.startsWith(mark) && sel.endsWith(mark)) {
        const inner = sel.slice(mark.length, sel.length - mark.length);
        ta.setRangeText(inner, s, e, 'select');
      } else {
        ta.setRangeText(mark + sel + mark, s, e, 'end');
        ta.setSelectionRange(s + mark.length, s + mark.length + sel.length);
      }
      fireInput();
    }

    const stripMark = (l) => l.replace(/^[-*•] (\[[ xX]\] )?/, '');
    const isBullet = (l) => /^[-*•] (?!\[[ xX]\] )/.test(l);
    const isCheck = (l) => /^[-*•] \[[ xX]\] /.test(l);

    function toggleLines(kind) {
      const v = ta.value;
      const s = ta.selectionStart, e = ta.selectionEnd;
      const ls = v.lastIndexOf('\n', s - 1) + 1;
      let le = v.indexOf('\n', e);
      if (le === -1) le = v.length;
      const lines = v.slice(ls, le).split('\n');
      const test = kind === 'bullet' ? isBullet : isCheck;
      const prefix = kind === 'bullet' ? '- ' : '- [ ] ';
      const allHave = lines.every(test);
      const out = lines.map((l) => (allHave ? stripMark(l) : prefix + stripMark(l))).join('\n');
      ta.setRangeText(out, ls, le, 'select');
      fireInput();
    }

    tools.addEventListener('mousedown', (e) => e.preventDefault()); // keep textarea focused
    tools.addEventListener('click', (e) => {
      const b = e.target.closest('.tb');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'bold') wrapSel('**');
      if (act === 'italic') wrapSel('*');
      if (act === 'bullet') toggleLines('bullet');
      if (act === 'check') toggleLines('check');
      ta.focus();
    });

    ta.addEventListener('keydown', (e) => {
      e.stopPropagation(); // keep site hotkeys from firing while typing
      if (e.key === 'Escape') { ta.blur(); return; }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'b') { e.preventDefault(); wrapSel('**'); return; }
        if (k === 'i') { e.preventDefault(); wrapSel('*'); return; }
      }
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing &&
          ta.selectionStart === ta.selectionEnd) {
        const v = ta.value, pos = ta.selectionStart;
        const ls = v.lastIndexOf('\n', pos - 1) + 1;
        const m = /^(\s*)([-*•]) (\[[ xX]\] )?(.*)$/.exec(v.slice(ls, pos));
        if (m) {
          e.preventDefault();
          if (m[4] === '') ta.setRangeText('', ls, pos, 'end');
          else ta.setRangeText('\n' + m[1] + m[2] + ' ' + (m[3] ? '[ ] ' : ''), pos, pos, 'end');
          fireInput();
        }
      }
    });
    ['keyup', 'keypress'].forEach((t) => ta.addEventListener(t, (e) => e.stopPropagation()));

    el.addEventListener('pointerdown', () => { el.style.zIndex = String(++zTop); });

    /* --- drag --- */
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.btn')) return;
      e.preventDefault();
      head.setPointerCapture(e.pointerId);
      head.classList.add('drag');
      const sx = e.clientX, sy = e.clientY;
      const pinned = !!note.pinned;
      const ox = pinned ? (note.fx ?? 20) : note.x;
      const oy = pinned ? (note.fy ?? 20) : note.y;
      const move = (ev) => {
        let nx = Math.max(0, Math.round(ox + ev.clientX - sx));
        let ny = Math.max(0, Math.round(oy + ev.clientY - sy));
        if (pinned) {
          nx = Math.min(nx, Math.max(0, window.innerWidth - 80));
          ny = Math.min(ny, Math.max(0, window.innerHeight - 40));
          note.fx = nx; note.fy = ny;
        } else { note.x = nx; note.y = ny; }
        el.style.left = nx + 'px';
        el.style.top = ny + 'px';
      };
      const up = () => {
        head.removeEventListener('pointermove', move);
        head.removeEventListener('pointerup', up);
        head.classList.remove('drag');
        save(note, 0);
      };
      head.addEventListener('pointermove', move);
      head.addEventListener('pointerup', up);
    });

    /* --- resize --- */
    new ResizeObserver(() => {
      if (note.min) return;
      const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
      if (w < 1 || h < 1) return;
      if (Math.abs(w - note.w) >= 1 || Math.abs(h - note.h) >= 1) {
        note.w = w; note.h = h;
        save(note, 400);
      }
    }).observe(el);

    /* --- header buttons --- */
    btnJump.addEventListener('click', () => jumpToHighlight(note.id));

    btnPin.addEventListener('click', () => {
      if (!note.pinned) {
        note.fx = Math.min(Math.max(0, Math.round(note.x - window.scrollX)), Math.max(0, window.innerWidth - 80));
        note.fy = Math.min(Math.max(0, Math.round(note.y - window.scrollY)), Math.max(0, window.innerHeight - 40));
        note.pinned = true;
      } else {
        note.x = Math.round((note.fx ?? 20) + window.scrollX);
        note.y = Math.round((note.fy ?? 20) + window.scrollY);
        note.pinned = false;
      }
      refresh(); save(note, 0);
    });

    btnRem.addEventListener('click', () => {
      const open = el.classList.toggle('remopen');
      if (open) remInput.value = toLocalInput(note.reminder || Date.now() + 3600 * 1000);
    });
    q('.rem .set').addEventListener('click', () => {
      const ts = remInput.value ? new Date(remInput.value).getTime() : NaN;
      if (!Number.isFinite(ts) || ts <= Date.now()) { remInput.title = 'Pick a time in the future'; remInput.focus(); return; }
      note.reminder = ts;
      el.classList.remove('remopen');
      refresh(); save(note, 0);
    });
    q('.rem .clr').addEventListener('click', () => {
      note.reminder = null;
      el.classList.remove('remopen');
      refresh(); save(note, 0);
    });

    btnColor.addEventListener('click', () => {
      const i = COLOR_ORDER.indexOf(note.color);
      note.color = COLOR_ORDER[(i + 1) % COLOR_ORDER.length];
      refresh(); paintHighlights(); save(note, 0);
    });

    btnMin.addEventListener('click', () => {
      note.min = !note.min;
      refresh(); save(note, 0);
    });

    let confirmTimer = null;
    btnDel.addEventListener('click', () => {
      if (!note.text.trim() || btnDel.classList.contains('confirm')) {
        clearTimeout(confirmTimer);
        clearTimeout(timers.get(note.id));
        removeLocal(note.id);
        guard(() => chrome.storage.local.remove(PREFIX + note.id));
        return;
      }
      btnDel.classList.add('confirm');
      btnDel.title = 'Click again to delete';
      confirmTimer = setTimeout(() => {
        btnDel.classList.remove('confirm');
        btnDel.title = 'Delete note';
      }, 2500);
    });

    const item = { note, el, ta, refresh, jumpBtn: btnJump, setEditing };
    items.set(note.id, item);
    if (note.anchor) scheduleResolve();
    return item;
  }

  /* ---------------- Page load / navigation ---------------- */
  async function loadPage() {
    currentKey = pageKey();
    for (const id of [...items.keys()]) removeLocal(id);
    ranges.clear();
    paintHighlights();
    const all = await guard(() => chrome.storage.local.get(null));
    if (!all) return;
    for (const [k, v] of Object.entries(all)) {
      if (k.startsWith(PREFIX) && v && v.url === currentKey) render({ ...v });
    }
    handlePendingFocus();
  }

  async function handlePendingFocus() {
    const res = await guard(() => chrome.storage.local.get('pendingFocus'));
    const id = res && res.pendingFocus;
    if (!id || !items.has(id)) return;
    guard(() => chrome.storage.local.remove('pendingFocus'));
    setTimeout(() => focusNote(id), 700);
  }

  function flash(id) {
    const it = items.get(id);
    if (!it) return;
    if (hidden) setHidden(false);
    it.el.style.zIndex = String(++zTop);
    it.el.classList.remove('flash');
    void it.el.offsetWidth;
    it.el.classList.add('flash');
    setTimeout(() => it.el.classList.remove('flash'), 2600);
  }

  function focusNote(id) {
    const it = items.get(id);
    if (!it) return;
    if (!it.note.pinned) {
      window.scrollTo({ top: Math.max(0, it.note.y - 100), left: Math.max(0, it.note.x - 60), behavior: 'smooth' });
    }
    flash(id);
  }

  function setHidden(v) {
    hidden = v;
    if (host) host.style.display = hidden ? 'none' : '';
  }

  function addNote(text = '', opts = {}) {
    let anchor = null, selRange = null, rect = null;
    if (opts.highlight) {
      const a = anchorFromSelection();
      if (!a) return { ok: false, error: 'no-selection' };
      anchor = a.anchor; selRange = a.range; rect = a.rect;
    }
    ensureHost();
    if (hidden) setHidden(false);
    const jitter = (items.size % 6) * 24;
    let x = Math.round(window.scrollX + Math.max(20, window.innerWidth / 2 - 110) + jitter);
    let y = Math.round(window.scrollY + Math.max(20, window.innerHeight / 4) + jitter);
    if (rect) {
      if (rect.right + 12 + 250 <= window.innerWidth) {
        x = Math.round(window.scrollX + rect.right + 12);
        y = Math.round(window.scrollY + Math.max(8, rect.top));
      } else {
        x = Math.round(window.scrollX + Math.max(8, window.innerWidth - 260));
        y = Math.round(window.scrollY + rect.bottom + 8);
      }
    }
    const note = {
      id: crypto.randomUUID(),
      url: pageKey(),
      title: document.title || location.hostname,
      text,
      color: 'yellow',
      x, y, w: 240, h: 200, min: false, pinned: false, reminder: null,
      created: Date.now(), updated: Date.now()
    };
    if (anchor) note.anchor = anchor;
    const it = render(note);
    if (selRange) {
      ranges.set(note.id, selRange);
      paintHighlights();
      window.getSelection().removeAllRanges();
    }
    guard(() => chrome.storage.local.set({ [PREFIX + note.id]: { ...note } }));
    it.el.style.zIndex = String(++zTop);
    it.setEditing(true);
    if (text) it.ta.setSelectionRange(text.length, text.length);
    return { ok: true };
  }

  /* ---------------- Messaging, settings & sync ---------------- */
  guard(() => chrome.runtime.onMessage.addListener((msg, _sender, send) => {
    switch (msg && msg.type) {
      case 'ADD_NOTE': send(addNote(msg.text || '', { highlight: !!msg.highlight })); break;
      case 'TOGGLE_VISIBILITY': setHidden(!hidden); send({ ok: true, hidden }); break;
      case 'FOCUS_NOTE': focusNote(msg.id); send({ ok: true }); break;
      case 'GET_AI_PAGE_TEXT': {
        // Prefer article/main content to navigation, ads and other page chrome.
        const candidates = [document.querySelector('article'), document.querySelector('main'), document.querySelector('[role="main"]')].filter(Boolean);
        const source = candidates.sort((a, b) => (b.innerText || '').length - (a.innerText || '').length)[0] || document.body;
        const selection = String(window.getSelection?.() || '').trim().slice(0, 2000);
        send({ ok: true, title: document.title || location.hostname, url: pageKey(), selection, text: (source?.innerText || '').slice(0, 12000) });
        break;
      }
      case 'PING': send({ ok: true, hidden, count: items.size }); break;
    }
  }));

  const refreshAll = () => { for (const it of items.values()) it.refresh(); };

  guard(() => chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.settings) {
      theme = (changes.settings.newValue && changes.settings.newValue.theme) || 'auto';
      refreshAll();
    }
    for (const [k, ch] of Object.entries(changes)) {
      if (!k.startsWith(PREFIX)) continue;
      const id = k.slice(PREFIX.length);
      const nv = ch.newValue;
      if (!nv || nv.url !== currentKey) { removeLocal(id); continue; }
      const it = items.get(id);
      if (!it) { render({ ...nv }); continue; }
      if (it.note.updated === nv.updated) continue; // our own write
      Object.assign(it.note, nv);
      it.refresh();
      paintHighlights();
    }
  }));

  mq.addEventListener('change', refreshAll);

  (async () => {
    const res = await guard(() => chrome.storage.local.get('settings'));
    if (res && res.settings && res.settings.theme) { theme = res.settings.theme; refreshAll(); }
  })();

  // Clicking highlighted text flashes its note
  document.addEventListener('click', (e) => {
    if (!ranges.size || !document.caretRangeFromPoint) return;
    if (host && e.composedPath().includes(host)) return;
    const cr = document.caretRangeFromPoint(e.clientX, e.clientY);
    if (!cr) return;
    for (const [id, r] of ranges) {
      try {
        if (r.isPointInRange(cr.startContainer, cr.startOffset)) { flash(id); break; }
      } catch { /* detached range */ }
    }
  }, true);

  // Single-page apps change the URL without reloading
  setInterval(() => {
    if (pageKey() !== currentKey) loadPage();
    else if (host && !host.isConnected) ensureHost();
  }, 1000);

  loadPage();
})();
