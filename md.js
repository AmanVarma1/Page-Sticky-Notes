// Tiny, safe markdown renderer for AI answers in the popup.
// Builds DOM nodes with textContent only (never innerHTML), so model output can't inject markup.
// Supports: **bold**, *italic*, `code`, http(s) links, "- " bullets, "1. " lists,
// "- [ ] / - [x]" checklists (read-only), and "# " headings.
(() => {
  const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };

  function inline(parent, s) {
    const re = /(\*\*[^*\n]+?\*\*|\*[^*\s][^*\n]*?\*|`[^`\n]+`|https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g;
    let last = 0, m;
    while ((m = re.exec(s))) {
      if (m.index > last) parent.append(s.slice(last, m.index));
      const t = m[0];
      let node;
      if (t.startsWith('**')) { node = el('strong'); node.textContent = t.slice(2, -2); }
      else if (t.startsWith('*')) { node = el('em'); node.textContent = t.slice(1, -1); }
      else if (t.startsWith('`')) { node = el('code'); node.textContent = t.slice(1, -1); }
      else {
        node = el('a');
        node.href = t; node.textContent = t; node.target = '_blank'; node.rel = 'noopener noreferrer';
      }
      parent.append(node);
      last = m.index + t.length;
    }
    if (last < s.length) parent.append(s.slice(last));
  }

  window.renderMarkdown = function renderMarkdown(container, text) {
    container.textContent = '';
    let blank = false;
    for (const line of String(text || '').split('\n')) {
      let m;
      if (!line.trim()) { blank = true; continue; }
      let row;
      if ((m = /^(\s*)[-*•]\s+\[( |x|X)\]\s?(.*)$/.exec(line))) {
        row = el('div', 'li cl' + (m[2] !== ' ' ? ' done' : ''));
        const box = el('span', 'b'); box.textContent = m[2] !== ' ' ? '☑' : '☐';
        const t = el('span', 't'); inline(t, m[3]);
        row.append(box, t);
      } else if ((m = /^(\s*)[-*•]\s+(.*)$/.exec(line))) {
        row = el('div', 'li');
        const b = el('span', 'b'); b.textContent = '•';
        const t = el('span', 't'); inline(t, m[2]);
        row.append(b, t);
      } else if ((m = /^(\s*)(\d+)[.)]\s+(.*)$/.exec(line))) {
        row = el('div', 'li');
        const b = el('span', 'b'); b.textContent = m[2] + '.';
        const t = el('span', 't'); inline(t, m[3]);
        row.append(b, t);
      } else if ((m = /^#{1,3}\s+(.*)$/.exec(line))) {
        row = el('div', 'h'); inline(row, m[1]);
      } else {
        row = el('div', 'p'); inline(row, line);
      }
      if (blank && container.childNodes.length) row.classList.add('gap');
      blank = false;
      container.append(row);
    }
  };
})();
