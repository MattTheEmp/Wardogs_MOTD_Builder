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
    { name: 'Blank', text: '' },
  ];

  if (typeof module === 'object' && module.exports) module.exports = TEMPLATES;
  else root.MOTD_TEMPLATES = TEMPLATES;
})(typeof self !== 'undefined' ? self : this);
