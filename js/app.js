/* Wardogs MOTD Builder — UI */
(function () {
  'use strict';

  const { LIMITS } = MOTD;
  const STORAGE_DRAFT = 'wardogs-motd:draft';
  const STORAGE_LIBRARY = 'wardogs-motd:library';
  const STORAGE_STYLE = 'wardogs-motd:style';
  const STORAGE_EXPORT = 'wardogs-motd:export';
  const SWATCHES = ['#FF4D4D', '#E8A33D', '#FFD447', '#6BE38A', '#7FD6FF', '#4D8BFF', '#B48CFF', '#FFFFFF', '#A0A0A0'];

  const $ = (id) => document.getElementById(id);
  const input = $('input');
  const gutter = $('gutter');
  const counts = $('counts');
  const preview = $('preview');
  const issuesEl = $('issues');

  // ---------- storage helpers (storage can be unavailable) ----------
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : JSON.parse(v);
      } catch (_) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* ignore */ }
    },
  };

  // ---------- toast ----------
  let toastTimer;
  function toast(msg, warn) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.toggle('warn', !!warn);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), warn ? 4200 : 2400);
  }

  // ---------- editing helpers ----------
  /** Replace a range in the textarea, keeping native undo where supported. */
  function replaceRange(start, end, text, selectMode) {
    input.focus();
    input.setSelectionRange(start, end);
    let ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch (_) { ok = false; }
    if (!ok || input.value.slice(start, start + text.length) !== text) {
      input.setRangeText(text, start, end, 'end');
    }
    if (selectMode === 'select') input.setSelectionRange(start, start + text.length);
    render();
  }

  const TAG_RE = /<\/>|<(?:Header|Bold|Italic|text\b[^>]*)>/gi;
  const stripTags = (s) => s.replace(TAG_RE, '');

  function lineBounds(pos) {
    const v = input.value;
    const start = v.lastIndexOf('\n', pos - 1) + 1;
    let end = v.indexOf('\n', pos);
    if (end === -1) end = v.length;
    return { start, end };
  }

  /** Wrap the selection (each selected line separately) in openTag…</>. */
  function wrapSelection(openTag) {
    let s = input.selectionStart;
    let e = input.selectionEnd;
    if (s === e) {
      // No selection: wrap the whole current line if it has text, else insert an empty pair.
      const { start, end } = lineBounds(s);
      const content = input.value.slice(start, end);
      if (content.trim() === '') {
        replaceRange(s, e, openTag + '</>');
        const caret = s + openTag.length;
        input.setSelectionRange(caret, caret);
        return;
      }
      s = start;
      e = end;
    }
    const wrapped = input.value
      .slice(s, e)
      .split('\n')
      .map((part) => {
        const clean = stripTags(part);
        if (clean.trim() === '') return clean;
        const lead = clean.match(/^\s*/)[0];
        const trail = clean.match(/\s*$/)[0];
        return lead + openTag + clean.trim() + '</>' + trail;
      })
      .join('\n');
    replaceRange(s, e, wrapped, 'select');
  }

  function clearStyle() {
    let s = input.selectionStart;
    let e = input.selectionEnd;
    if (s === e) ({ start: s, end: e } = lineBounds(s));
    replaceRange(s, e, stripTags(input.value.slice(s, e)), 'select');
  }

  // ---------- text style controls ----------
  const colorText = $('style-color');
  const colorPicker = $('style-color-picker');
  const sizeInput = $('style-size');
  const faceSelect = $('style-face');

  function currentStyle() {
    const color = colorText.value.trim().toUpperCase();
    const size = sizeInput.value.trim();
    return {
      color: /^#[0-9A-F]{6}$/.test(color) ? color : '',
      size: size === '' ? '' : Math.min(LIMITS.maxSize, Math.max(LIMITS.minSize, Math.round(Number(size)) || LIMITS.minSize)),
      fontface: faceSelect.value,
    };
  }

  function setColor(hex) {
    colorText.value = hex;
    if (hex) colorPicker.value = hex.toLowerCase();
    colorText.classList.remove('invalid');
    markSwatch();
    saveStyle();
  }

  function markSwatch() {
    const c = colorText.value.trim().toUpperCase();
    document.querySelectorAll('.swatch').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.color === c)));
  }

  function saveStyle() {
    store.set(STORAGE_STYLE, { color: colorText.value, size: sizeInput.value, face: faceSelect.value });
  }

  function buildSwatches() {
    const box = $('swatches');
    const none = document.createElement('button');
    none.className = 'swatch none';
    none.title = 'No color (default)';
    none.dataset.color = '';
    none.addEventListener('click', () => setColor(''));
    box.appendChild(none);
    SWATCHES.forEach((c) => {
      const b = document.createElement('button');
      b.className = 'swatch';
      b.style.background = c;
      b.title = c;
      b.dataset.color = c;
      b.addEventListener('click', () => setColor(c));
      box.appendChild(b);
    });
  }

  // ---------- rendering ----------
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function styledSpan(seg, text) {
    const st = seg.style;
    const span = el('span', '', text);
    if (st.kind === 'header') span.className = 'h';
    if (st.bold) span.classList.add('b');
    if (st.italic) span.classList.add('i');
    if (st.color) span.style.color = st.color;
    if (st.size) span.style.fontSize = st.size + 'px';
    return span;
  }

  function renderPreview(result) {
    preview.textContent = '';
    if (result.lineCount === 1 && result.lines[0].raw === '') {
      preview.appendChild(el('div', 'empty-msg', 'Your message will appear here.'));
      return;
    }
    const frag = document.createDocumentFragment();
    for (const line of result.lines) {
      const row = el('div', 'pl');
      row.dataset.line = line.number;
      if (line.overLimit) {
        row.classList.add('cutline');
        row.title = `Line ${line.number} — over the ${LIMITS.maxLines}-line limit, cut in game`;
      }
      let used = 0;
      for (const seg of line.segments) {
        const chars = Array.from(seg.text);
        const keep = Math.max(0, Math.min(chars.length, LIMITS.maxChars - used));
        if (keep > 0) row.appendChild(styledSpan(seg, chars.slice(0, keep).join('')));
        if (keep < chars.length) {
          const cut = styledSpan(seg, chars.slice(keep).join(''));
          cut.classList.add('cut');
          cut.title = 'Over 128 characters — cut in game';
          row.appendChild(cut);
        }
        used += chars.length;
      }
      if (!line.segments.length) row.appendChild(document.createTextNode('​'));
      frag.appendChild(row);
    }
    preview.appendChild(frag);
  }

  function renderGutter(result) {
    const g = document.createDocumentFragment();
    const c = document.createDocumentFragment();
    for (const line of result.lines) {
      const n = el('div', '', String(line.number));
      const sev = line.issues.some((i) => i.severity === 'error') ? 'error'
        : line.issues.some((i) => i.severity === 'warning') ? 'warning' : '';
      if (sev) n.classList.add(sev);
      if (line.overLimit) n.classList.add('cut');
      g.appendChild(n);

      const k = el('div', '', line.raw === '' ? '' : String(line.visible));
      if (line.visible > LIMITS.maxChars) k.classList.add('over');
      else if (line.visible > LIMITS.maxChars - 12) k.classList.add('near');
      if (line.overLimit) k.classList.add('cut');
      k.title = `${line.visible} / ${LIMITS.maxChars} visible characters`;
      c.appendChild(k);
    }
    // Spacer so the gutter can scroll as far as the textarea (horizontal scrollbar).
    g.appendChild(el('div', '', ''));
    c.appendChild(el('div', '', ''));
    gutter.replaceChildren(g);
    counts.replaceChildren(c);
    syncScroll();
  }

  function renderIssues(result) {
    issuesEl.textContent = '';
    if (!result.issues.length) {
      const li = el('li', 'all-good');
      li.append(el('span', 'sev', '✓'), el('span', '', 'Looks good — ready to export.'));
      issuesEl.appendChild(li);
      $('issues-summary').textContent = '';
      return;
    }
    const sorted = result.issues.slice().sort((a, b) =>
      (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1) || a.line - b.line || a.col - b.col);
    const shown = sorted.slice(0, 200);
    for (const it of shown) {
      const li = el('li', it.severity);
      li.append(
        el('span', 'sev', it.severity === 'error' ? '✕' : '!'),
        el('span', 'where', `Line ${it.line}`),
        el('span', '', it.message),
      );
      li.title = 'Jump to line';
      li.addEventListener('click', () => jumpToLine(it.line, it.col));
      issuesEl.appendChild(li);
    }
    const fixable = MOTD.autoFix(input.value) !== normalizeNewlines(input.value);
    $('issues-summary').textContent =
      (sorted.length > shown.length ? `showing ${shown.length} of ${sorted.length}` : '') +
      (fixable ? (sorted.length > shown.length ? ' · ' : '') + 'some can be fixed with Auto-fix' : '');
  }

  function renderStats(result) {
    const lines = $('stat-lines');
    const count = input.value === '' ? 0 : result.lineCount;
    lines.textContent = `${count} / ${LIMITS.maxLines} lines`;
    lines.classList.toggle('over', count > LIMITS.maxLines);
    const errs = $('stat-errors');
    errs.textContent = `${result.errorCount} error${result.errorCount === 1 ? '' : 's'}`;
    errs.classList.toggle('has', result.errorCount > 0);
    errs.classList.toggle('ok', result.errorCount === 0);
    const warns = $('stat-warnings');
    warns.textContent = `${result.warningCount} warning${result.warningCount === 1 ? '' : 's'}`;
    warns.classList.toggle('has', result.warningCount > 0);
  }

  let lastResult = null;
  function render() {
    const result = MOTD.validate(input.value);
    lastResult = result;
    renderGutter(result);
    renderPreview(result);
    renderIssues(result);
    renderStats(result);
    store.set(STORAGE_DRAFT, input.value);
  }

  let renderTimer;
  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, 40);
  }

  function syncScroll() {
    gutter.scrollTop = input.scrollTop;
    counts.scrollTop = input.scrollTop;
  }

  function normalizeNewlines(s) {
    return s.replace(/\r\n?/g, '\n').replace(/\n$/, '');
  }

  function lineOffset(lineNo) {
    const v = input.value;
    let pos = 0;
    for (let i = 1; i < lineNo; i++) {
      const nl = v.indexOf('\n', pos);
      if (nl === -1) return v.length;
      pos = nl + 1;
    }
    return pos;
  }

  function jumpToLine(lineNo, col) {
    const start = lineOffset(lineNo);
    const { end } = lineBounds(start);
    input.focus();
    input.setSelectionRange(start + Math.max(0, (col || 1) - 1), end);
    const lh = parseFloat(getComputedStyle(input).lineHeight) || 22;
    input.scrollTop = Math.max(0, (lineNo - 1) * lh - input.clientHeight / 3);
    syncScroll();
  }

  function flashPreviewLine(lineNo) {
    const row = preview.querySelector(`.pl[data-line="${lineNo}"]`);
    if (!row) return;
    preview.querySelectorAll('.pl.flash').forEach((r) => r.classList.remove('flash'));
    row.classList.add('flash');
    const top = row.offsetTop - preview.offsetTop;
    if (top < preview.scrollTop || top > preview.scrollTop + preview.clientHeight - 30) {
      preview.scrollTop = top - preview.clientHeight / 3;
    }
  }

  function currentLineNo() {
    return input.value.slice(0, input.selectionStart).split('\n').length;
  }

  // ---------- load / save / share ----------
  function setText(text, msg) {
    input.value = text;
    input.scrollTop = 0;
    input.setSelectionRange(0, 0);
    render();
    if (msg) toast(msg);
  }

  function encodeShare(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decodeShare(s) {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      const ta = el('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (__) { ok = false; }
      ta.remove();
      return ok;
    }
  }

  function library() { return store.get(STORAGE_LIBRARY, []); }

  function renderLibrary() {
    const list = $('saved');
    list.textContent = '';
    const items = library().sort((a, b) => b.updated - a.updated);
    if (!items.length) {
      list.appendChild(el('li', 'empty', 'Nothing saved yet.'));
      return;
    }
    for (const item of items) {
      const li = el('li');
      const name = el('span', 'name', item.name);
      name.title = item.name;
      const date = el('span', 'date', new Date(item.updated).toLocaleDateString());
      const load = el('button', 'btn', 'Load');
      load.addEventListener('click', () => {
        setText(item.text, `Loaded "${item.name}"`);
        $('save-name').value = item.name;
      });
      const del = el('button', 'btn danger', 'Delete');
      let armed = false;
      del.addEventListener('click', () => {
        if (!armed) {
          armed = true;
          del.textContent = 'Sure?';
          setTimeout(() => { armed = false; del.textContent = 'Delete'; }, 2500);
          return;
        }
        store.set(STORAGE_LIBRARY, library().filter((x) => x.name !== item.name));
        renderLibrary();
        toast(`Deleted "${item.name}"`);
      });
      li.append(name, date, load, del);
      list.appendChild(li);
    }
  }

  // ---------- wire up ----------
  function init() {
    buildSwatches();

    const style = store.get(STORAGE_STYLE, null);
    if (style) {
      colorText.value = style.color || '';
      if (/^#[0-9A-Fa-f]{6}$/.test(colorText.value)) colorPicker.value = colorText.value.toLowerCase();
      sizeInput.value = style.size || '';
      faceSelect.value = style.face || '';
    }
    markSwatch();

    const select = $('template-select');
    MOTD_TEMPLATES.forEach((t, i) => select.appendChild(new Option(t.name, String(i))));

    // Initial content: shared link > saved draft > first template.
    let initial = null;
    const m = /[#&]motd=([A-Za-z0-9_-]*)/.exec(location.hash);
    if (m) {
      try {
        initial = decodeShare(m[1]);
        setTimeout(() => toast('Loaded MOTD from shared link'), 200);
      } catch (_) {
        setTimeout(() => toast('That share link is damaged — loaded your last draft instead.', true), 200);
      }
      history.replaceState(null, '', location.pathname + location.search);
    }
    if (initial === null) initial = store.get(STORAGE_DRAFT, null);
    if (initial === null) initial = MOTD_TEMPLATES[0].text;
    input.value = initial;
    render();
    renderLibrary();

    input.addEventListener('input', scheduleRender);
    input.addEventListener('scroll', syncScroll);
    ['keyup', 'click'].forEach((ev) => input.addEventListener(ev, () => flashPreviewLine(currentLineNo())));
    input.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'b') { e.preventDefault(); wrapSelection('<Bold>'); }
      else if (mod && !e.shiftKey && e.key.toLowerCase() === 'i') { e.preventDefault(); wrapSelection('<Italic>'); }
      else if (e.key === 'Tab') { e.preventDefault(); replaceRange(input.selectionStart, input.selectionEnd, '    '); }
    });

    preview.addEventListener('click', (e) => {
      const row = e.target.closest('.pl');
      if (row) jumpToLine(Number(row.dataset.line));
    });

    document.querySelectorAll('[data-wrap]').forEach((b) =>
      b.addEventListener('click', () => wrapSelection(`<${b.dataset.wrap}>`)));
    document.querySelectorAll('[data-insert]').forEach((b) =>
      b.addEventListener('click', () => replaceRange(input.selectionStart, input.selectionEnd, b.dataset.insert)));
    $('btn-strip').addEventListener('click', clearStyle);

    $('btn-apply-text').addEventListener('click', () => {
      const st = currentStyle();
      if (!st.color && !st.size && !st.fontface) {
        toast('Pick a color, size or face first.', true);
        return;
      }
      wrapSelection(MOTD.buildTextTag(st));
    });
    colorPicker.addEventListener('input', () => setColor(colorPicker.value.toUpperCase()));
    colorText.addEventListener('input', () => {
      let v = colorText.value.trim();
      if (v && v[0] !== '#') v = '#' + v;
      const ok = v === '' || /^#[0-9A-Fa-f]{6}$/.test(v);
      colorText.classList.toggle('invalid', !ok);
      if (ok && v) colorPicker.value = v.toLowerCase();
      markSwatch();
      saveStyle();
    });
    sizeInput.addEventListener('change', () => {
      if (sizeInput.value !== '') {
        sizeInput.value = Math.min(LIMITS.maxSize, Math.max(LIMITS.minSize, Math.round(Number(sizeInput.value)) || LIMITS.minSize));
      }
      saveStyle();
    });
    faceSelect.addEventListener('change', saveStyle);

    $('btn-format').addEventListener('click', () => {
      // Format the selected lines, or the whole message if nothing is selected.
      let s = 0;
      let e = input.value.length;
      const hasSel = input.selectionStart !== input.selectionEnd;
      if (hasSel) {
        s = lineBounds(input.selectionStart).start;
        e = lineBounds(Math.max(input.selectionStart, input.selectionEnd - 1)).end;
      }
      const before = input.value.slice(s, e);
      if (!before.trim()) return toast('Paste your text first, then Auto-format.', true);
      const formatted = MOTD.autoFormat(before, { title: !hasSel || s === 0 });
      if (formatted === normalizeNewlines(before)) return toast('Already formatted — nothing to change.');
      replaceRange(s, e, formatted, hasSel ? 'select' : undefined);
      const r = lastResult;
      const tail = r.errorCount ? ` ${r.errorCount} issue${r.errorCount === 1 ? '' : 's'} left — see Checks.` : '';
      toast(`Formatted — ${r.lineCount} / ${LIMITS.maxLines} lines. Ctrl+Z to undo.${tail}`, r.errorCount > 0);
    });

    $('btn-fix').addEventListener('click', () => {
      const before = normalizeNewlines(input.value);
      const fixed = MOTD.autoFix(input.value);
      if (fixed === before) {
        toast('Nothing to auto-fix.');
        return;
      }
      const errBefore = lastResult ? lastResult.errorCount + lastResult.warningCount : 0;
      replaceRange(0, input.value.length, fixed);
      const left = lastResult.errorCount + lastResult.warningCount;
      toast(`Fixed ${Math.max(0, errBefore - left)} issue${errBefore - left === 1 ? '' : 's'}` +
        (left ? ` — ${left} left to fix by hand.` : '.'), left > 0);
    });

    const exportSelect = $('export-format');
    exportSelect.value = store.get(STORAGE_EXPORT, 'ini');
    exportSelect.addEventListener('change', () => store.set(STORAGE_EXPORT, exportSelect.value));
    const asIni = () => exportSelect.value === 'ini';
    const exportText = () => {
      const msg = normalizeNewlines(input.value);
      return asIni() ? MOTD.toConfigLines(msg) : msg;
    };

    $('btn-copy').addEventListener('click', async () => {
      const ok = await copyText(exportText());
      if (!ok) return toast('Copy failed — select the text and copy manually.', true);
      const where = asIni()
        ? `Copied ${lastResult.lineCount} config.ini lines — paste them into the server's config.ini.`
        : 'Copied the plain message.';
      if (lastResult.errorCount) {
        toast(`${where} Note: ${lastResult.errorCount === 1 ? '1 error' : `${lastResult.errorCount} errors`} still listed in Checks.`, true);
      } else {
        toast(where);
      }
    });

    $('btn-download').addEventListener('click', () => {
      const ini = asIni();
      const body = exportText().replace(/\n/g, ini ? '\r\n' : '\n') + (ini ? '\r\n' : '\n');
      const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
      const a = el('a');
      const name = ($('save-name').value.trim() || 'wardogs-motd').replace(/[^\w.-]+/g, '-');
      a.href = URL.createObjectURL(blob);
      a.download = name + (ini ? '.ini' : '.txt');
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    });

    $('file-open').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      file.text().then((t) => {
        if (MOTD.isConfigText(t)) {
          setText(MOTD.fromConfigLines(t), `Opened ${file.name} — read the ServerWelcomeMessageLines entries.`);
        } else {
          setText(normalizeNewlines(t), `Opened ${file.name}`);
        }
        $('save-name').value = file.name.replace(/\.(txt|ini)$/i, '');
      });
      e.target.value = '';
    });

    // Pasting config.ini lines strips the ".ServerWelcomeMessageLines=" prefixes.
    input.addEventListener('paste', (e) => {
      const t = e.clipboardData && e.clipboardData.getData('text/plain');
      if (!t || !MOTD.isConfigText(t)) return;
      e.preventDefault();
      replaceRange(input.selectionStart, input.selectionEnd, MOTD.fromConfigLines(t));
      toast('Pasted config.ini lines — prefixes removed for editing. Copy adds them back.');
    });

    $('btn-share').addEventListener('click', async () => {
      const url = location.origin + location.pathname + '#motd=' + encodeShare(normalizeNewlines(input.value));
      const ok = await copyText(url);
      toast(ok ? 'Share link copied — anyone with it can open this MOTD in the builder.' : 'Could not copy the link.', !ok);
    });

    $('btn-template').addEventListener('click', () => {
      const t = MOTD_TEMPLATES[Number(select.value)];
      const current = normalizeNewlines(input.value);
      if (current && current !== t.text && !library().some((x) => x.text === current)) {
        store.set(STORAGE_LIBRARY, library().filter((x) => x.name !== 'Autosave (before template)')
          .concat({ name: 'Autosave (before template)', text: current, updated: Date.now() }));
        renderLibrary();
      }
      replaceRange(0, input.value.length, t.text);
      toast(`Loaded template "${t.name}"` + (current && current !== t.text ? ' — your previous text is in Saved messages.' : ''));
    });

    $('btn-save').addEventListener('click', () => {
      const name = $('save-name').value.trim();
      if (!name) {
        $('save-name').focus();
        return toast('Give it a name first.', true);
      }
      const items = library().filter((x) => x.name !== name);
      items.push({ name, text: normalizeNewlines(input.value), updated: Date.now() });
      store.set(STORAGE_LIBRARY, items);
      renderLibrary();
      toast(`Saved "${name}"`);
    });
    $('save-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-save').click(); });

    $('popup-width').addEventListener('change', (e) => { $('popup').style.width = e.target.value + 'px'; });
  }

  init();
})();
