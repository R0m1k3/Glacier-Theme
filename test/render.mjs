// Renders the mock pages in test/pages with Unraid's real stylesheets, with and without Glacier,
// and saves screenshots to test/shots. The mock markup copies the structure of Unraid 7.3.4's
// page layout (header, menu, tabs, Dashboard tiles, footer); Unraid's Vue header components are
// approximated, since they only exist on a running server.
//
//   node test/render.mjs /path/to/unraid/webgui      (a checkout of github.com/unraid/webgui, tag 7.3.4)
//
// Needs Playwright (require('playwright')) with Chromium.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const webgui = path.resolve(process.argv[2] || process.env.UNRAID_WEBGUI || '');
const dynamix = path.join(webgui, 'emhttp/plugins/dynamix');
if (!fs.existsSync(path.join(dynamix, 'styles/default-base.css'))) {
  console.error('Pass the path of an unraid/webgui checkout (tag 7.3.4).');
  process.exit(1);
}
const pluginSrc = path.resolve(here, '../plugin/src');
const pagesDir = path.join(here, 'pages');
const shots = path.join(here, 'shots');
fs.mkdirSync(shots, { recursive: true });

const template = fs.readFileSync(path.join(here, 'layout.html'), 'utf8');
const types = { '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.svg': 'image/svg+xml', '.html': 'text/html' };

function page(name, mode) {
  const glacier = mode !== 'stock';
  const body = fs.readFileSync(path.join(pagesDir, `${name}.html`), 'utf8');
  const [meta, content] = body.split('\n---\n');
  const opts = Object.fromEntries(meta.split('\n').filter(Boolean).map((l) => l.split(/:\s*/, 2)));
  return template
    .replaceAll('{{CLASSES}}', glacier ? `glacier gl-hero-on gl-page-${opts.page}${mode === 'dark' ? ' gl-dark' : ''}` : '')
    .replaceAll('Theme--white', mode === 'dark' ? 'Theme--black' : 'Theme--white')
    .replaceAll('themes/white.css', mode === 'dark' ? 'themes/black.css' : 'themes/white.css')
    .replaceAll('{{GLACIER}}', glacier
      ? '<script>window.glacierTemp = {"hot":45,"max":55}; window.glacierUpdates = {"docker":1,"plugins":2}; window.glacierVersion = "2026.10.26.dev";</script><link rel="stylesheet" href="/plugins/Glacier-Theme/styles/glacier.css"><script defer src="/plugins/Glacier-Theme/scripts/glacier.js"></script>'
      : '')
    .replaceAll('{{SHEET}}', opts.sheet ? `<link rel="stylesheet" href="/webGui/sheets/${opts.sheet}">` : '')
    .replace(`<div class="nav-item"><a href="/${opts.active}">`, `<div class="nav-item active"><a href="/${opts.active}">`)
    .replaceAll('{{CONTENT}}', content);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let file;
  if (url.pathname.startsWith('/page/')) {
    const [, , name, mode] = url.pathname.split('/');
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(page(name, mode));
    return;
  }
  if (url.pathname.startsWith('/webGui/')) file = path.join(dynamix, url.pathname.slice('/webGui/'.length));
  else if (url.pathname.startsWith('/plugins/Glacier-Theme/')) file = path.join(pluginSrc, url.pathname.slice('/plugins/Glacier-Theme/'.length));
  if (!file || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const names = process.env.PAGES ? process.env.PAGES.split(',') : fs.readdirSync(pagesDir).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5));
const widths = { wide: 1920, desktop: 1440, tablet: 900, phone: 390 };
for (const name of names) {
  for (const mode of (process.env.MODES ? process.env.MODES.split(',') : ['glacier', 'dark', 'stock'])) {
    for (const [label, width] of Object.entries(widths)) {
      if (mode !== 'glacier' && label !== 'wide' && !(mode === 'stock' && label === 'desktop')) continue;
      if (mode === 'stock' && label !== 'desktop') continue;
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
      const tab = await ctx.newPage();
      const errors = [];
      tab.on('pageerror', (e) => errors.push(e.message));
      await tab.goto(`${base}/page/${name}/${mode}`, { waitUntil: 'networkidle' });
      await tab.evaluate(() => document.fonts.ready);
      const out = path.join(shots, `${name}-${mode}-${label}.png`);
      await tab.screenshot({ path: out, fullPage: true });
      const overflow = await tab.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      console.log(`${out}${overflow > 0 ? `  (horizontal overflow ${overflow}px)` : ''}${errors.length ? `  errors: ${errors.join(' | ')}` : ''}`);
      if (overflow > 0) {
        // The outermost elements that stick out past the right edge.
        const culprits = await tab.evaluate(() => [...document.querySelectorAll('body *')]
          .filter((e) => e.getBoundingClientRect().right > innerWidth + 1 && !(e.parentElement && e.parentElement.getBoundingClientRect().right > innerWidth + 1))
          .slice(0, 8)
          .map((e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).join('.') : ''} → ${Math.round(e.getBoundingClientRect().right)}px`));
        culprits.forEach((c) => console.log(`    ${c}`));
      }
      await ctx.close();
    }
  }
}
await browser.close();
server.close();
