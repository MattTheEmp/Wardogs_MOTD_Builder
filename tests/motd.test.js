const test = require('node:test');
const assert = require('node:assert/strict');
const MOTD = require('../js/motd.js');

const errors = (text) => MOTD.validate(text).issues.filter((i) => i.severity === 'error');
const warnings = (text) => MOTD.validate(text).issues.filter((i) => i.severity === 'warning');

test('plain text and blank lines are valid', () => {
  const r = MOTD.validate('Welcome to the server\n\nHave fun');
  assert.equal(r.errorCount, 0);
  assert.equal(r.lineCount, 3);
  assert.equal(r.lines[1].visible, 0);
});

test('spec examples are valid', () => {
  const examples = [
    '<Header>Welcome to Dogpile</>',
    '<Bold>No cheating</>',
    '<Italic>Have fun</>',
    '<text color="#E8A33D" size="16" fontface="Bold">EU Hardcore KOTH</>',
    'Keep chat in <text color="#7FD6FF">English</> and be respectful',
    '<text size="20" fontface="Bold" color="#FF4D4D">SERVER RULES</>',
  ];
  for (const ex of examples) assert.deepEqual(errors(ex), [], ex);
});

test('segments carry styles', () => {
  const [line] = MOTD.validate('Keep chat in <text color="#7FD6FF" size="12">English</> ok').lines;
  assert.equal(line.segments.length, 3);
  assert.deepEqual(line.segments[1].style, { kind: 'text', color: '#7FD6FF', size: 12, bold: false, italic: false });
});

test('nesting is an error', () => {
  assert.equal(errors('<Bold><Italic>x</></>').length >= 1, true);
});

test('unclosed and stray closers are errors', () => {
  assert.equal(errors('<Bold>never closed').length, 1);
  assert.equal(errors('oops</>').length, 1);
  assert.equal(errors('<Bold>x</Bold>').length, 1);
});

test('Header cannot take attributes', () => {
  assert.equal(errors('<Header color="#FF0000">Rules</>').length, 1);
});

test('unknown tags and links', () => {
  assert.equal(errors('<a href="https://x.com">site</>').length >= 1, true);
  assert.equal(errors('<url>discord.gg/abc</>').length >= 1, true);
  assert.equal(warnings('Join https://discord.gg/abc').length, 1);
});

test('smart quotes in attributes are flagged', () => {
  assert.equal(errors('<text color=“#E8A33D”>x</>').length, 1);
});

test('attribute validation', () => {
  assert.equal(errors('<text color="red">x</>').length, 1);
  assert.equal(errors('<text color="#FFF">x</>').length, 1);
  assert.equal(errors('<text size="30">x</>').length, 1);
  assert.equal(errors('<text size="7">x</>').length, 1);
  assert.equal(errors('<text fontface="Underline">x</>').length, 1);
  assert.equal(errors('<text weight="bold">x</>').length, 1);
  assert.deepEqual(errors('<text size="8">x</> <text size="24">y</>'), []);
});

test('entities count as one visible character', () => {
  const [line] = MOTD.validate('a &lt; b &amp;&amp; c &gt; d &quot;').lines;
  assert.equal(line.visible, 'a < b && c > d "'.length);
  assert.equal(line.issues.length, 0);
});

test('tags do not count toward the 128 character limit', () => {
  const body = 'x'.repeat(128);
  assert.deepEqual(errors(`<text color="#FFFFFF" size="12">${body}</>`), []);
  assert.equal(errors(`<Bold>${body}y</>`).length, 1);
});

test('128 line limit', () => {
  assert.equal(MOTD.validate(Array(128).fill('x').join('\n')).errorCount, 0);
  assert.equal(MOTD.validate(Array(129).fill('x').join('\n')).errorCount, 1);
  // a trailing newline does not add a line
  assert.equal(MOTD.validate(Array(128).fill('x').join('\n') + '\n').errorCount, 0);
});

test('raw special characters warn', () => {
  assert.equal(warnings('Tom & Jerry').length, 1);
  assert.equal(warnings('5 > 3').length, 1);
  assert.equal(warnings('3 < 5 and 6').length, 1);
});

test('autoFix repairs the fixable problems', () => {
  const cases = [
    ['<text color=“#e8a33d” size=“30”>x</>', '<text color="#E8A33D" size="24">x</>'],
    ['<bold>Rules', '<Bold>Rules</>'],
    ['<Bold><Italic>x</></>', '<Bold></><Italic>x</>'.replace('<Bold></>', '')],
    ['Tom & Jerry > all', 'Tom &amp; Jerry &gt; all'],
    ['<Header color="#FF4D4D">RULES</>', '<text color="#FF4D4D" size="20" fontface="Bold">RULES</>'],
    ['<a href="x">y</a>', '&lt;a href=&quot;x&quot;&gt;y&lt;/a&gt;'],
  ];
  for (const [input, expected] of cases) {
    const fixed = MOTD.autoFix(input);
    assert.equal(fixed, expected, input);
    assert.equal(MOTD.validate(fixed).errorCount, 0, `still has errors: ${fixed}`);
  }
});

test('autoFix leaves valid input unchanged', () => {
  const ok = '<Header>Welcome</>\n\nKeep chat in <text color="#7FD6FF">English</>\n<Bold>No cheating</>';
  assert.equal(MOTD.autoFix(ok), ok);
});

test('built-in templates are valid and need no fixing', () => {
  const templates = require('../js/templates.js');
  for (const t of templates) {
    const r = MOTD.validate(t.text);
    assert.equal(r.errorCount + r.warningCount, 0, `${t.name}: ${JSON.stringify(r.issues)}`);
    assert.equal(MOTD.autoFix(t.text), t.text, t.name);
  }
});

test('every saved MOTD in motds/ passes validation', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const dir = path.join(__dirname, '..', 'motds');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.txt'))) {
    const r = MOTD.validate(fs.readFileSync(path.join(dir, f), 'utf8'));
    const errs = r.issues.filter((i) => i.severity === 'error').map((i) => `line ${i.line}: ${i.message}`);
    assert.deepEqual(errs, [], `${f} has errors`);
  }
});

test('autoFormat turns the plain-text rules post into a valid MOTD', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const plain = fs.readFileSync(path.join(__dirname, 'fixtures', 'rules-plain.txt'), 'utf8');
  const out = MOTD.autoFormat(plain);
  const r = MOTD.validate(out);
  assert.equal(r.errorCount, 0, JSON.stringify(r.issues));
  assert.ok(r.lineCount <= MOTD.LIMITS.maxLines);
  const lines = out.split('\n');
  assert.equal(lines[0], '<Header>IN-GAME SERVER RULES</>');
  assert.ok(lines.includes('<text color="#E8A33D" size="18" fontface="Bold">NO GRIEFING</>'));
  assert.ok(lines.includes('<Bold>Ramming Vehicles</>'));
  assert.ok(lines.includes('• Warnings'));
  assert.ok(out.includes('#support-or-report'));
  assert.ok(!/⁠/.test(out));
  // running it again changes nothing
  assert.equal(MOTD.autoFormat(out), out);
});

test('autoFormat details', () => {
  // caps heading with a tagline
  assert.equal(
    MOTD.autoFormat('Intro\n\nNO CHEATING - Seriously.', { title: false }).split('\n').slice(2).join('\n'),
    '<text color="#E8A33D" size="18" fontface="Bold">NO CHEATING</>\n<Italic>Seriously.</>');
  // label lines, bullets, escaping
  assert.equal(MOTD.autoFormat('How to report: press Tab', { title: false }), '<Bold>How to report:</> press Tab');
  assert.equal(MOTD.autoFormat('- Tom & Jerry <3', { title: false }), '• Tom &amp; Jerry &lt;3');
  // long lines split under the limit without orphans
  const long = 'word '.repeat(60).trim() + '.';
  const parts = MOTD.autoFormat(long, { title: false }).split('\n');
  assert.equal(parts.length, 3);
  for (const p of parts) assert.ok(p.length <= 128 && p.length > 60, p);
  // tagged lines are left alone
  const tagged = 'Keep chat in <text color="#7FD6FF">English</>';
  assert.equal(MOTD.autoFormat(tagged, { title: false }), tagged);
});
