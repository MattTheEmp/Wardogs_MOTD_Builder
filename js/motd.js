/*
 * Wardogs MOTD parser / validator / fixer.
 *
 * Implements the "Server Welcome Messages" spec from the WARDOGS team:
 *   - One line of text = one line in the popup. Empty line = spacer.
 *   - Tags: <Header>…</>, <Bold>…</>, <Italic>…</>, <text color size fontface>…</>
 *   - Every tag is closed with </>. Tags cannot nest.
 *   - Header takes no attributes.
 *   - Any other tag (including links) is shown as typed and RCON refuses the line.
 *   - Escapes: &lt; &gt; &amp; &quot;  (each counts as 1 visible character)
 *   - Limits: 128 lines, 128 visible characters per line, font size 8–24.
 *
 * Works in the browser (window.MOTD) and in Node (module.exports).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MOTD = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LIMITS = Object.freeze({ maxLines: 128, maxChars: 128, minSize: 8, maxSize: 24 });

  const ENTITIES = Object.freeze({ lt: '<', gt: '>', amp: '&', quot: '"' });
  const SIMPLE_TAGS = ['Header', 'Bold', 'Italic'];
  const ALL_TAGS = SIMPLE_TAGS.concat(['text']);
  const FONTFACES = ['Bold', 'Italic'];
  const ATTRS = ['color', 'size', 'fontface'];
  const SMART_QUOTES = /[“”„‟″‘’«»]/;

  /** Severity levels. "error" = RCON refuses to Apply / gets cut in game. */
  const ERROR = 'error';
  const WARNING = 'warning';

  function issue(severity, line, col, message) {
    return { severity, line, col, message };
  }

  function visibleLength(str) {
    return Array.from(str).length;
  }

  /**
   * Parse the attribute string of a <text …> tag.
   * Returns { attrs, issues } where attrs are normalised values.
   */
  function parseAttrs(raw, lineNo, col) {
    const issues = [];
    const attrs = {};
    // name = "value"  — accept straight, smart and single quotes so we can report them.
    const re = /([A-Za-z]+)\s*=\s*(["'“”„‟‘’])(.*?)(["'“”„‟‘’])/g;
    let m;
    let leftover = raw;
    while ((m = re.exec(raw)) !== null) {
      leftover = leftover.replace(m[0], ' ');
      const name = m[1];
      const open = m[2];
      const close = m[4];
      let value = m[3].trim();
      const key = name.toLowerCase();

      if (open !== '"' || close !== '"') {
        if (SMART_QUOTES.test(open) || SMART_QUOTES.test(close)) {
          issues.push(issue(ERROR, lineNo, col, `Smart quotes around ${name}=… — use straight quotes ("). This usually happens when copying from Discord.`));
        } else {
          issues.push(issue(WARNING, lineNo, col, `Use double quotes for ${name}="…", not single quotes.`));
        }
      }
      if (!ATTRS.includes(key)) {
        issues.push(issue(ERROR, lineNo, col, `Unknown attribute "${name}". Allowed: color, size, fontface.`));
        continue;
      }
      if (name !== key) {
        issues.push(issue(ERROR, lineNo, col, `Attribute "${name}" should be lowercase "${key}".`));
      }
      if (key in attrs) {
        issues.push(issue(WARNING, lineNo, col, `Attribute "${key}" given more than once; the last one is used.`));
      }

      if (key === 'color') {
        if (/^#?[0-9A-Fa-f]{6}$/.test(value)) {
          if (value[0] !== '#') {
            issues.push(issue(ERROR, lineNo, col, `Color "${value}" needs a leading # (e.g. "#${value}").`));
            value = '#' + value;
          }
          attrs.color = value.toUpperCase();
        } else if (/^#?[0-9A-Fa-f]{3}$/.test(value)) {
          const h = value.replace('#', '');
          const full = '#' + h.split('').map((c) => c + c).join('').toUpperCase();
          issues.push(issue(ERROR, lineNo, col, `Color "${value}" must be 6 digits (#RRGGBB), e.g. "${full}".`));
          attrs.color = full;
        } else {
          issues.push(issue(ERROR, lineNo, col, `Color "${value}" is not #RRGGBB.`));
        }
      } else if (key === 'size') {
        const n = Number(value);
        if (!/^-?\d+(\.\d+)?$/.test(value) || !isFinite(n)) {
          issues.push(issue(ERROR, lineNo, col, `Size "${value}" is not a number.`));
        } else {
          let size = Math.round(n);
          if (size !== n) {
            issues.push(issue(WARNING, lineNo, col, `Size "${value}" should be a whole number.`));
          }
          if (size < LIMITS.minSize || size > LIMITS.maxSize) {
            const clamped = Math.min(LIMITS.maxSize, Math.max(LIMITS.minSize, size));
            issues.push(issue(ERROR, lineNo, col, `Size ${value} is outside ${LIMITS.minSize}–${LIMITS.maxSize}. The game clamps it to ${clamped} and RCON refuses to Apply.`));
            size = clamped;
          }
          attrs.size = size;
        }
      } else if (key === 'fontface') {
        const match = FONTFACES.find((f) => f.toLowerCase() === value.toLowerCase());
        if (!match) {
          issues.push(issue(ERROR, lineNo, col, `fontface "${value}" must be "Bold" or "Italic".`));
        } else {
          if (match !== value) {
            issues.push(issue(ERROR, lineNo, col, `fontface "${value}" should be written "${match}".`));
          }
          attrs.fontface = match;
        }
      }
    }
    if (leftover.trim() !== '') {
      issues.push(issue(ERROR, lineNo, col, `Couldn't read "${leftover.trim()}" in the <text> tag. Use name="value" pairs.`));
    }
    return { attrs, issues };
  }

  /**
   * Tokenise one line.
   * Tokens: {t:'text', s} | {t:'open', tag, attrs} | {t:'close'}
   * Text values are decoded (entities resolved).
   */
  function tokenizeLine(line, lineNo) {
    const tokens = [];
    const issues = [];
    let buf = '';
    let open = null; // currently-open tag token
    const flush = () => {
      if (buf) tokens.push({ t: 'text', s: buf });
      buf = '';
    };

    let i = 0;
    while (i < line.length) {
      const ch = line[i];
      const col = i + 1;

      if (ch === '<') {
        if (line.startsWith('</>', i)) {
          if (!open) {
            issues.push(issue(ERROR, lineNo, col, 'Closing </> without an open tag.'));
          } else {
            flush();
            tokens.push({ t: 'close' });
            open = null;
          }
          i += 3;
          continue;
        }
        const end = line.indexOf('>', i + 1);
        const nextLt = line.indexOf('<', i + 1);
        const inner = end === -1 ? null : line.slice(i + 1, end);
        const looksLikeTag = inner !== null && (nextLt === -1 || nextLt > end) && /^\/?[A-Za-z]/.test(inner);

        if (!looksLikeTag) {
          issues.push(issue(WARNING, lineNo, col, 'Unescaped "<" — write &lt; to show it.'));
          buf += '<';
          i += 1;
          continue;
        }

        // Closing tags like </Bold>
        if (inner[0] === '/') {
          issues.push(issue(ERROR, lineNo, col, `Close tags with </>, not <${inner}>.`));
          if (open) {
            flush();
            tokens.push({ t: 'close' });
            open = null;
          } else {
            buf += '<' + inner + '>'; // shown as typed
          }
          i = end + 1;
          continue;
        }

        const nameMatch = /^([A-Za-z]+)([\s\S]*)$/.exec(inner);
        const name = nameMatch[1];
        const rest = nameMatch[2];
        const known = ALL_TAGS.find((t) => t.toLowerCase() === name.toLowerCase());

        if (!known || (known !== 'text' && rest.trim() !== '' && !/^\s/.test(rest))) {
          issues.push(issue(ERROR, lineNo, col, `<${inner}> is not a supported tag. Only Header, Bold, Italic and text work — links and other tags show as typed and RCON refuses the line.`));
          buf += '<' + inner + '>';
          i = end + 1;
          continue;
        }
        if (known === 'text' && rest !== '' && !/^\s/.test(rest)) {
          issues.push(issue(ERROR, lineNo, col, `<${inner}> is not a supported tag.`));
          buf += '<' + inner + '>';
          i = end + 1;
          continue;
        }
        const issuesBefore = issues.length;
        if (known !== name) {
          issues.push(issue(ERROR, lineNo, col, `Tag <${name}> should be written <${known}>.`));
        }

        let attrs = {};
        if (known === 'text') {
          const parsed = parseAttrs(rest, lineNo, col);
          attrs = parsed.attrs;
          issues.push(...parsed.issues);
        } else if (rest.trim() !== '') {
          if (known === 'Header') {
            issues.push(issue(ERROR, lineNo, col, 'Header can\'t take color or size. Use <text size="20" fontface="Bold" color="#…"> instead.'));
            const parsed = parseAttrs(rest, lineNo, col);
            attrs = parsed.attrs;
          } else {
            issues.push(issue(ERROR, lineNo, col, `<${known}> doesn't take attributes. Use <text …> for custom styling.`));
            const parsed = parseAttrs(rest, lineNo, col);
            attrs = parsed.attrs;
          }
        }

        if (open) {
          issues.push(issue(ERROR, lineNo, col, `Tags can't go inside other tags — close <${open.tag}> with </> first.`));
          flush();
          tokens.push({ t: 'close', implicit: true });
        }
        const clean = issues.length === issuesBefore && !open;
        flush();
        open = { t: 'open', tag: known, attrs, col, raw: clean ? '<' + inner + '>' : null };
        tokens.push(open);
        i = end + 1;
        continue;
      }

      if (ch === '&') {
        const m = /^&(lt|gt|amp|quot);/.exec(line.slice(i));
        if (m) {
          buf += ENTITIES[m[1]];
          i += m[0].length;
          continue;
        }
        issues.push(issue(WARNING, lineNo, col, 'Unescaped "&" — write &amp; to show it.'));
        buf += '&';
        i += 1;
        continue;
      }

      if (ch === '>') {
        issues.push(issue(WARNING, lineNo, col, 'Unescaped ">" — write &gt; to show it.'));
      }
      buf += ch;
      i += 1;
    }
    flush();
    if (open) {
      issues.push(issue(ERROR, lineNo, open.col, `<${open.tag}> is never closed — add </> at the end.`));
      tokens.push({ t: 'close', implicit: true });
    }
    return { tokens, issues };
  }

  /** Convert tokens into styled segments for rendering. */
  function toSegments(tokens) {
    const segs = [];
    let style = null;
    for (const tok of tokens) {
      if (tok.t === 'open') style = { tag: tok.tag, attrs: tok.attrs };
      else if (tok.t === 'close') style = null;
      else segs.push({ text: tok.s, style: styleFor(style) });
    }
    return segs;
  }

  function styleFor(s) {
    if (!s) return { kind: 'plain' };
    if (s.tag === 'Header') return { kind: 'header' };
    if (s.tag === 'Bold') return { kind: 'plain', bold: true };
    if (s.tag === 'Italic') return { kind: 'plain', italic: true };
    return {
      kind: 'text',
      color: s.attrs.color || null,
      size: s.attrs.size || null,
      bold: s.attrs.fontface === 'Bold',
      italic: s.attrs.fontface === 'Italic',
    };
  }

  function splitLines(text) {
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    // A single trailing newline doesn't create an extra popup line.
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    return lines;
  }

  /**
   * Validate a whole MOTD.
   * Returns { lines: [{ number, raw, segments, visible, issues }], issues, errorCount, warningCount }
   */
  function validate(text) {
    const rawLines = splitLines(text);
    const lines = [];
    const all = [];
    rawLines.forEach((raw, idx) => {
      const number = idx + 1;
      const { tokens, issues } = tokenizeLine(raw, number);
      const segments = toSegments(tokens);
      const visible = segments.reduce((n, s) => n + visibleLength(s.text), 0);
      if (visible > LIMITS.maxChars) {
        issues.push(issue(ERROR, number, 1, `Line has ${visible} visible characters (max ${LIMITS.maxChars}). Extra text is cut in game and RCON refuses to Apply.`));
      }
      if (number > LIMITS.maxLines && number === LIMITS.maxLines + 1) {
        issues.push(issue(ERROR, number, 1, `Message has ${rawLines.length} lines (max ${LIMITS.maxLines}). Lines from here on are cut.`));
      }
      if (/\bhttps?:\/\/|\bwww\.[a-z0-9-]+\./i.test(raw)) {
        issues.push(issue(WARNING, number, 1, 'Links are not clickable in the popup — players will have to type it out.'));
      }
      lines.push({ number, raw, segments, visible, issues, overLimit: number > LIMITS.maxLines });
      all.push(...issues);
    });
    return {
      lines,
      issues: all,
      lineCount: rawLines.length,
      errorCount: all.filter((x) => x.severity === ERROR).length,
      warningCount: all.filter((x) => x.severity === WARNING).length,
    };
  }

  function escapeText(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function serializeOpen(tok) {
    if (tok.raw) return tok.raw; // already valid — keep the author's formatting
    if (tok.tag === 'text' || (tok.tag === 'Header' && Object.keys(tok.attrs).length)) {
      const a = Object.assign({}, tok.attrs);
      if (tok.tag === 'Header') {
        // Header with attributes → equivalent <text> title.
        if (!a.size) a.size = 20;
        if (!a.fontface) a.fontface = 'Bold';
      }
      return buildTextTag(a);
    }
    return `<${tok.tag}>`;
  }

  /** Build a <text …> tag from { color, size, fontface }. */
  function buildTextTag(a) {
    const parts = ['text'];
    if (a.color) parts.push(`color="${a.color}"`);
    if (a.size) parts.push(`size="${a.size}"`);
    if (a.fontface) parts.push(`fontface="${a.fontface}"`);
    return `<${parts.join(' ')}>`;
  }

  /**
   * Rewrite a MOTD so it follows the spec where it can be fixed automatically:
   * straight quotes, escaped < > & ", tag-name case, closed/un-nested tags,
   * clamped sizes, Header-with-attributes → <text>, unknown tags escaped.
   * Over-length lines are left alone (the author has to decide what to cut).
   */
  function autoFix(text) {
    return splitLines(text)
      .map((raw, idx) => {
        const { tokens } = tokenizeLine(raw, idx + 1);
        let out = '';
        let isOpen = false;
        for (const tok of tokens) {
          if (tok.t === 'open') {
            out += serializeOpen(tok);
            isOpen = true;
          } else if (tok.t === 'close') {
            if (isOpen) out += '</>';
            isOpen = false;
          } else {
            out += escapeText(tok.s);
          }
        }
        // Drop empty tag pairs like <Bold></>
        return out.replace(/<(?:Header|Bold|Italic|text[^>]*)><\/>/g, '');
      })
      .join('\n');
  }

  // ---------------------------------------------------------------------------
  // Auto-format: turn pasted plain text (e.g. a Discord rules post) into a
  // styled MOTD that fits the limits.
  // ---------------------------------------------------------------------------

  const INVISIBLE = /[​-‍⁠﻿]/g;
  const BULLET_RE = /^(?:[-*•·–—▪▫►›»✓✔]|\d{1,2}[.)])\s+/;

  function isCapsHeading(s) {
    const letters = s.match(/\p{L}/gu) || [];
    return letters.length >= 3 && s === s.toUpperCase() && s !== s.toLowerCase() &&
      visibleLength(s) <= 60 && s.split(/\s+/).length <= 8 && !BULLET_RE.test(s);
  }

  function isShortLabel(s) {
    return visibleLength(s) <= 40 && s.split(/\s+/).length <= 5 && /^\p{Lu}/u.test(s) &&
      !/[.!?:;,]$/.test(s) && !/:\s/.test(s) && !BULLET_RE.test(s);
  }

  /** "NO CHEATING & EXPLOITS - This shouldn't…" → ['NO CHEATING & EXPLOITS', "This shouldn't…"] */
  function splitCapsLead(s) {
    const m = /^(.{3,60}?)\s+[-–—:]\s+(\S.*)$/.exec(s);
    return m && isCapsHeading(m[1]) ? [m[1], m[2]] : null;
  }

  /** "How to Report a Player: While in game…" → ['How to Report a Player', 'While in game…'] */
  function splitLabel(s) {
    const m = /^(\p{Lu}[^:.!?]{1,38}):\s+(\S.*)$/u.exec(s);
    return m && m[1].split(/\s+/).length <= 6 ? [m[1], m[2]] : null;
  }

  /** Split plain text into pieces of at most `max` visible chars, preferring sentence breaks. */
  function splitToFit(s, max) {
    s = s.trim();
    if (visibleLength(s) <= max) return [s];
    const sentences = s.match(/[^.!?]+(?:[.!?]+["')\]]*|$)\s*/g) || [s];
    const out = [];
    let cur = '';
    const push = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
    for (let sent of sentences) {
      if (visibleLength((cur + sent).trim()) <= max) { cur += sent; continue; }
      push();
      sent = sent.trim();
      // A single sentence that is still too long: wrap on words into balanced pieces,
      // preferring a break after a comma, so no tiny orphan is left on the last line.
      while (visibleLength(sent) > max) {
        const chars = Array.from(sent);
        const target = Math.ceil(chars.length / Math.ceil(chars.length / max));
        let best = -1;
        let bestScore = Infinity;
        for (let k = 1; k <= Math.min(max, chars.length - 1); k++) {
          if (chars[k] !== ' ') continue;
          const afterComma = /[,;]/.test(chars[k - 1]);
          const score = Math.abs(k - target) - (afterComma ? max * 0.15 : 0);
          if (score < bestScore) { bestScore = score; best = k; }
        }
        if (best < 0) best = max;
        out.push(chars.slice(0, best).join('').trim());
        sent = chars.slice(best).join('').trim();
      }
      cur = sent + ' ';
    }
    push();
    return out;
  }

  /**
   * Format pasted plain text into a styled MOTD.
   * Lines that already contain tags are kept (and auto-fixed).
   * Options: { title: true, headingColor, headingSize }
   */
  function autoFormat(text, options) {
    const o = Object.assign({ title: true, headingColor: '#E8A33D', headingSize: 18 }, options);
    const headingTag = buildTextTag({ color: o.headingColor, size: o.headingSize, fontface: 'Bold' });
    const max = LIMITS.maxChars;

    // 1. Normalise and decode each line into plain text (or keep tagged lines).
    const src = text.replace(/\r\n?/g, '\n')
      .replace(/(^|\s)\u2060(?=[a-z0-9][a-z0-9_-]*)/g, '$1#') // Discord #channel mentions paste as U+2060 + name
      .replace(INVISIBLE, '').replace(/ /g, ' ').replace(/\t/g, '    ');
    const lines = src.split('\n').map((raw) => {
      const { tokens } = tokenizeLine(raw.replace(/\s+$/, ''), 0);
      if (tokens.some((t) => t.t === 'open')) return { tagged: autoFix(raw.trim()) };
      const plain = tokens.filter((t) => t.t === 'text').map((t) => t.s).join('').replace(/\s+/g, ' ').replace(/\s+([).,!?])/g, '$1').trim();
      return { plain };
    });

    const blankAt = (i) => i < 0 || i >= lines.length || (lines[i].plain === '' && !lines[i].tagged);

    // 2. Classify.
    let seenContent = false;
    let underSub = false;
    let prevKind = null;
    const items = [];
    lines.forEach((ln, i) => {
      if (ln.tagged !== undefined) {
        items.push({ kind: 'tagged', text: ln.tagged });
        seenContent = true;
        prevKind = 'tagged';
        return;
      }
      const s = ln.plain;
      if (s === '') {
        items.push({ kind: 'blank' });
        underSub = false;
        prevKind = 'blank';
        return;
      }
      const prev = blankAt(i - 1) ? null : lines[i - 1].plain;
      const next = blankAt(i + 1) ? null : lines[i + 1].plain;
      let item;

      if (!seenContent && o.title && (isCapsHeading(s) || isShortLabel(s))) {
        item = { kind: 'title', text: s };
      } else if (isCapsHeading(s)) {
        item = { kind: 'heading', text: s };
      } else if (splitCapsLead(s)) {
        const [h, rest] = splitCapsLead(s);
        item = { kind: 'heading', text: h, rest };
      } else if (BULLET_RE.test(s)) {
        const num = /^\d/.test(s) ? s.match(/^\d{1,2}[.)]/)[0] + ' ' : '• ';
        item = { kind: 'bullet', prefix: num, text: s.replace(BULLET_RE, '') };
      } else if (isShortLabel(s)) {
        const listContext = prevKind === 'item' || (prev !== null && /:$/.test(prev) && next !== null && isShortLabel(next));
        if (listContext) item = { kind: 'item', text: s };
        else if (next !== null && !isShortLabel(next)) item = { kind: 'sub', text: s };
        else item = { kind: 'text', text: s };
      } else if (splitLabel(s)) {
        const [label, rest] = splitLabel(s);
        item = { kind: 'label', label, text: rest };
      } else if (underSub) {
        item = { kind: 'bullet', prefix: '• ', text: s };
      } else {
        item = { kind: 'text', text: s };
      }

      if (item.kind === 'heading' || item.kind === 'title') underSub = false;
      if (item.kind === 'sub') underSub = true;
      seenContent = true;
      prevKind = item.kind;
      items.push(item);
    });

    // 3. Emit.
    const out = [];
    const lastOut = () => out[out.length - 1];
    const ensureGap = () => { if (out.length && lastOut() !== '') out.push(''); };
    const emitPlain = (s, prefix) => {
      const pre = prefix || '';
      splitToFit(s, max - visibleLength(pre)).forEach((p, k) => out.push((k === 0 ? pre : '') + escapeText(p)));
    };

    for (const it of items) {
      switch (it.kind) {
        case 'blank':
          if (out.length && lastOut() !== '') out.push('');
          break;
        case 'tagged':
          out.push(it.text);
          break;
        case 'title':
          splitToFit(it.text, max).forEach((p) => out.push(`<Header>${escapeText(p)}</>`));
          break;
        case 'heading':
          ensureGap();
          splitToFit(it.text, max).forEach((p) => out.push(`${headingTag}${escapeText(p)}</>`));
          if (it.rest) splitToFit(it.rest, max).forEach((p) => out.push(`<Italic>${escapeText(p)}</>`));
          break;
        case 'sub':
          if (out.length && lastOut() !== '' && !lastOut().startsWith(headingTag)) out.push('');
          out.push(`<Bold>${escapeText(it.text)}</>`);
          break;
        case 'item':
          emitPlain(it.text, '• ');
          break;
        case 'bullet':
          emitPlain(it.text, it.prefix);
          break;
        case 'label': {
          const labelLen = visibleLength(it.label) + 2;
          const pieces = splitToFit(it.text, max - labelLen);
          out.push(`<Bold>${escapeText(it.label)}:</> ${escapeText(pieces[0])}`);
          if (pieces.length > 1) emitPlain(pieces.slice(1).join(' '));
          break;
        }
        default:
          emitPlain(it.text);
      }
    }
    while (out.length && out[0] === '') out.shift();
    while (out.length && lastOut() === '') out.pop();
    return out.join('\n');
  }

  /** Plain text of a line as shown in game (tags stripped, entities decoded). */
  function plainText(text) {
    return validate(text).lines.map((l) => l.segments.map((s) => s.text).join('')).join('\n');
  }

  return {
    LIMITS,
    validate,
    autoFix,
    autoFormat,
    plainText,
    escapeText,
    buildTextTag,
    tokenizeLine,
    visibleLength,
  };
});
