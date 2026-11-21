'use strict';
// Documentation section: guides are read from the public repo's guides/ folder,
// rendered without inserting any HTML from the guide, and links stay https-only.
const fs = require('fs'), assert = require('assert');
const html = fs.readFileSync('agent/src/desktop.html', 'utf8');
const gui = fs.readFileSync('agent/src/gui.rs', 'utf8');
assert(html.includes("var DXBASE = 'https://raw.githubusercontent.com/stoveez/PlazCode/main/guides/'"), 'guides base address');
assert(!/DXBASE[^;]*latest/.test(html), 'guides never touch the update feeds');
// the only innerHTML in the docs code is the fixed icon table
const docs = html.slice(html.indexOf('/* ===== Documentation: guides'), html.indexOf('function Bind() {'));
assert(docs.length > 5000, 'docs block present');
const inner = docs.match(/innerHTML\s*=/g) || [];
assert.strictEqual(inner.length, 1, 'only the fixed icon table may use innerHTML');
assert(/Wrap\.innerHTML = '<svg[^\n]*\+ Body \+ '<\/svg>';/.test(docs), 'icon table only');
assert(!/insertAdjacentHTML|document\.write|eval\(/.test(docs), 'no unsafe HTML or eval');
// links: https only, or another guide, or an in-page anchor
assert(docs.includes("/^https:\\/\\/[^\\s]+$/.test(Url)"), 'https-only links');
assert(docs.includes("Ipc('open-url:' + Url)"), 'links open through the checked app action');
// picture names cannot escape the guide folder
assert(docs.includes("/^[A-Za-z0-9._-]+$/.test(Ref)"), 'picture file names are plain');
// Rust side accepts only plain https
assert(gui.includes('fn guide_link_url') && gui.includes('url.scheme() != "https"'), 'app opens only https guide links');
assert(gui.includes('"open:discord"'), 'discord link');
// the three pages and the area exist
for (const id of ['page-docs', 'page-guides', 'page-troubleshooting', 'page-doc']) assert(html.includes('id="' + id + '"'), id);
assert(html.includes('data-area="docs"'), 'documentation sidebar pages');
console.log('docs guides: PASS');
