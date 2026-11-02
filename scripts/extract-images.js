#!/usr/bin/env node
// extract-images.js — 从 raw/*.html 提取图片 URL，生成 relay/pending.json（供 GitHub Actions 下载）
// 用法: node scripts/extract-images.js [rawDir]
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const rawDir = path.resolve(process.argv[2] || path.join(ROOT, 'raw'));
const outDir = path.join(ROOT, 'relay');

if (!fs.existsSync(rawDir)) {
  console.error(`raw 目录不存在: ${rawDir}（先跑 incremental-crawl.js，默认会保存 raw/*.html）`);
  process.exit(2);
}
const files = fs.readdirSync(rawDir).filter((f) => f.endsWith('.html'));
const urls = new Map();
for (const f of files) {
  const html = fs.readFileSync(path.join(rawDir, f), 'utf8');
  const re = /data-src="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    let u = m[1].replace(/&amp;/g, '&');
    if (u.startsWith('//')) u = 'https:' + u;
    if (!/^https?:\/\//.test(u)) continue;
    if (!/^https?:\/\/(mmbiz\.qpic\.cn|mmbiz\.qlogo\.cn)\//.test(u)) continue;
    if (!urls.has(u)) urls.set(u, crypto.createHash('sha1').update(u).digest('hex').slice(0, 16));
  }
}
const items = [...urls.entries()].map(([url, id]) => ({ id, url }));
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'pending.json'),
  JSON.stringify({ generated_at: new Date().toISOString(), count: items.length, items }, null, 1), 'utf8');
console.log(`提取 ${files.length} 个 html，图片 ${items.length} 个 → relay/pending.json`);
