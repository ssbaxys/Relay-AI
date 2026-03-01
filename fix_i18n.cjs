const fs = require('fs');
const content = fs.readFileSync('src/i18n.ts', 'utf8');

const start = content.indexOf('const resources = {');
const end = content.indexOf('};', start) + 1;
const resourcesStr = content.substring(start, end);
const prefix = content.substring(0, start);
const suffix = content.substring(end + 1);

eval(resourcesStr.replace('const resources = ', 'var resources = '));

const newResourcesStr = 'const resources = ' + JSON.stringify(resources, null, 2) + ';';
fs.writeFileSync('src/i18n.ts', prefix + newResourcesStr + suffix);
console.log('Fixed i18n.ts duplicate keys');
