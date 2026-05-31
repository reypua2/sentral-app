const fs = require('fs');
let c = fs.readFileSync('C:\\sentralis\\App.js', 'utf8');
const old = `const sheetKeys = new Set(sheetsEvents.map(e => e.title.toLowerCase().replace(/\\s+/g, \` \`).trim()));

      const uniqueCalEvents = calendarEvents.filter(ce => {
        const calTitle = ce.title.toLowerCase().replace(/\\s+/g, \` \`).trim();
        return ![...sheetKeys].some(sk => sk.includes(calTitle) || calTitle.includes(sk));
      }).map(ce => ({`;
const neu = `const sheetKeys = new Set(sheetsEvents.map(e => \`\${e.date}|\${e.title.toLowerCase().trim()}\`));

      const uniqueCalEvents = calendarEvents.filter(ce => {
        const key = \`\${ce.date}|\${ce.title.toLowerCase().trim()}\`;
        return !sheetKeys.has(key);
      }).map(ce => ({`;
if (c.includes(old)) { c = c.replace(old, neu); fs.writeFileSync('C:\\sentralis\\App.js', c); console.log('FIXED'); }
else { console.log('OLD NOT FOUND - length: ' + c.length); }
