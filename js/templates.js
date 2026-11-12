/* Starter templates for the builder. Every template must pass validation (see tests). */
(function (root) {
  const TEMPLATES = [
    {
      name: 'Welcome + rules',
      text: [
        '<Header>Welcome to Dogpile</>',
        '<text color="#E8A33D" size="16" fontface="Bold">EU Hardcore KOTH</>',
        '',
        '<text size="20" fontface="Bold" color="#FF4D4D">SERVER RULES</>',
        '<Bold>1. No cheating</> — exploits, scripts or macros = permanent ban.',
        '<Bold>2. Be respectful</> — no racism, harassment or targeted toxicity.',
        '<Bold>3. No spawn camping</> on the main objectives.',
        '4. Keep chat in <text color="#7FD6FF">English</> so admins can moderate.',
        '',
        '<text color="#6BE38A" fontface="Bold">Need an admin?</> Ask in chat or find us on Discord.',
        '',
        '<Italic>Have fun &amp; good hunting!</>',
      ].join('\n'),
    },
    {
      name: 'Short & simple',
      text: [
        '<Header>Welcome, soldier</>',
        '',
        'Play fair, have fun, and keep chat friendly.',
        '<Italic>See you on the front line.</>',
      ].join('\n'),
    },
    {
      name: 'Event announcement',
      text: [
        '<text size="22" fontface="Bold" color="#FFD447">WEEKEND EVENT</>',
        '<text color="#A0A0A0" size="12">Saturday &amp; Sunday — 18:00 CET</>',
        '',
        '<Bold>Double XP</> on every match all weekend.',
        'Top squad on Sunday night wins <text color="#6BE38A" fontface="Bold">VIP for a month</>.',
        '',
        '<text color="#7FD6FF">Squad up and bring your friends!</>',
      ].join('\n'),
    },
    {
      name: 'Format test (every style, labelled)',
      // Same as motds/format-test.txt
      text: "<Header>Header tag: &lt;Header&gt;</>\nPlain text line, no tags (default size and color)\n\n<text size=\"16\" fontface=\"Bold\" color=\"#E8A33D\">— BASIC TAGS —</>\n<Bold>Bold tag: &lt;Bold&gt;</>\n<Italic>Italic tag: &lt;Italic&gt;</>\n<text fontface=\"Bold\">text tag with fontface=&quot;Bold&quot;</>\n<text fontface=\"Italic\">text tag with fontface=&quot;Italic&quot;</>\n<text size=\"20\" fontface=\"Bold\">text size 20 Bold (compare to the Header at the top)</>\n\n<text size=\"16\" fontface=\"Bold\" color=\"#E8A33D\">— FONT SIZES 8–24 —</>\n<text size=\"8\">Size 8 (minimum)</>\n<text size=\"9\">Size 9</>\n<text size=\"10\">Size 10</>\n<text size=\"11\">Size 11</>\n<text size=\"12\">Size 12</>\n<text size=\"13\">Size 13</>\n<text size=\"14\">Size 14</>\n<text size=\"15\">Size 15</>\n<text size=\"16\">Size 16</>\n<text size=\"17\">Size 17</>\n<text size=\"18\">Size 18</>\n<text size=\"19\">Size 19</>\n<text size=\"20\">Size 20</>\n<text size=\"21\">Size 21</>\n<text size=\"22\">Size 22</>\n<text size=\"23\">Size 23</>\n<text size=\"24\">Size 24 (maximum)</>\n\n<text size=\"16\" fontface=\"Bold\" color=\"#E8A33D\">— SIZE + FONTFACE —</>\n<text size=\"10\" fontface=\"Bold\">Size 10 Bold</> · <text size=\"10\" fontface=\"Italic\">Size 10 Italic</>\n<text size=\"14\" fontface=\"Bold\">Size 14 Bold</> · <text size=\"14\" fontface=\"Italic\">Size 14 Italic</>\n<text size=\"18\" fontface=\"Bold\">Size 18 Bold</> · <text size=\"18\" fontface=\"Italic\">Size 18 Italic</>\n<text size=\"24\" fontface=\"Bold\">Size 24 Bold</> · <text size=\"24\" fontface=\"Italic\">Size 24 Italic</>\n\n<text size=\"16\" fontface=\"Bold\" color=\"#E8A33D\">— COLORS —</>\n<text color=\"#FF4D4D\">Red #FF4D4D</>\n<text color=\"#FF8C42\">Orange #FF8C42</>\n<text color=\"#E8A33D\">Amber #E8A33D</>\n<text color=\"#FFD447\">Yellow #FFD447</>\n<text color=\"#6BE38A\">Green #6BE38A</>\n<text color=\"#2ECC71\">Emerald #2ECC71</>\n<text color=\"#7FD6FF\">Light blue #7FD6FF</>\n<text color=\"#4D8BFF\">Blue #4D8BFF</>\n<text color=\"#B48CFF\">Purple #B48CFF</>\n<text color=\"#FF6FB5\">Pink #FF6FB5</>\n<text color=\"#FFFFFF\">White #FFFFFF</>\n<text color=\"#A0A0A0\">Gray #A0A0A0</>\n<text color=\"#5A5A5A\">Dark gray #5A5A5A</>\n\n<text size=\"16\" fontface=\"Bold\" color=\"#E8A33D\">— COLOR + SIZE + FONTFACE —</>\n<text color=\"#FF4D4D\" size=\"20\" fontface=\"Bold\">Red, size 20, Bold</>\n<text color=\"#7FD6FF\" size=\"16\" fontface=\"Italic\">Light blue, size 16, Italic</>\n<text color=\"#6BE38A\" size=\"12\" fontface=\"Bold\">Green, size 12, Bold</>\n<text color=\"#FFD447\" size=\"8\" fontface=\"Italic\">Yellow, size 8, Italic</>\n\n<text size=\"16\" fontface=\"Bold\" color=\"#E8A33D\">— MIXED ON ONE LINE —</>\nPlain, <Bold>Bold</>, <Italic>Italic</>, <text color=\"#FF4D4D\">red</>, <text size=\"20\">size 20</>, back to plain\n<text color=\"#6BE38A\">Green</> <text color=\"#FFD447\">Yellow</> <text color=\"#FF4D4D\">Red</> <text color=\"#7FD6FF\">Blue</> — four colors, one line\n\n<text size=\"16\" fontface=\"Bold\" color=\"#E8A33D\">— SPECIAL CHARACTERS —</>\nEscapes: &lt; less than, &gt; greater than, &amp; ampersand, &quot; quote\nFake tag shown as text: &lt;Bold&gt;not bold&lt;/&gt;\nUnicode: → arrow • bullet ✓ check é ñ ü accents\nEmoji (may not render in game font): 🙂 🔥 🎯\n\n<text size=\"16\" fontface=\"Bold\" color=\"#E8A33D\">— SPACING —</>\nThe next line is an empty spacer line:\n\nThe line above was an empty spacer line.\n\n<text size=\"16\" fontface=\"Bold\" color=\"#E8A33D\">— LENGTH —</>\nThis line is exactly 128 visible characters long, the per-line maximum. It should wrap in the popup: xxxxxxxxxxxxxxxxxxxxxxxxxxx\n<Bold>Tags do not count:</> this line has 128 visible characters even though the raw text is longer: yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy\n\n<text size=\"16\" fontface=\"Bold\" color=\"#E8A33D\">— END —</>\n<text color=\"#A0A0A0\" size=\"12\">Last line: line 77 of 77 (limit 128). If you can read this, scrolling works.</>",
    },
    { name: 'Blank', text: '' },
  ];

  if (typeof module === 'object' && module.exports) module.exports = TEMPLATES;
  else root.MOTD_TEMPLATES = TEMPLATES;
})(typeof self !== 'undefined' ? self : this);
