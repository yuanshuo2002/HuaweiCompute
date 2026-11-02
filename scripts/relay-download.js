#!/usr/bin/env node
// relay-download.js — GitHub Actions 内运行：按 relay/pending.json 下载图片
// 输出: relay/images/<id>.<ext> + relay/manifest.json（url -> 仓库相对路径）
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PENDING = path.join(ROOT, 'relay', 'pending.json');
const IMG_DIR = path.join(ROOT, 'relay', 'images');
const MANIFEST = path.join(ROOT, 'relay', 'manifest.json');

const EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
              'image/webp': 'webp', 'image/bmp': 'bmp', 'image/svg+xml': 'svg' };

(async () => {
  if (!fs.existsSync(PENDING)) { console.error('缺少 relay/pending.json'); process.exit(2); }
  const { items } = JSON.parse(fs.readFileSync(PENDING, 'utf8'));
  fs.mkdirSync(IMG_DIR, { recursive: true });
  const manifest = { generated_at: new Date().toISOString(), images: {} };
  let ok = 0, fail = 0;

  for (let i = 0; i < items.length; i += 6) {
    await Promise.all(items.slice(i, i + 6).map(async (it) => {
      try {
        const res = await fetch(it.url, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://mp.weixin.qq.com/' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        const ct = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].toLowerCase();
        const ext = EXT[ct] || 'jpg';
        const rel = `relay/images/${it.id}.${ext}`;
        fs.writeFileSync(path.join(ROOT, rel), buf);
        manifest.images[it.url] = rel;
        ok++;
      } catch (e) {
        fail++;
        console.error(`FAIL ${it.url.slice(0, 80)} :: ${e.message}`);
      }
    }));
  }
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1), 'utf8');
  console.log(`relay: ok=${ok} fail=${fail} → relay/manifest.json`);
  if (fail) process.exitCode = 0; // 部分失败不阻塞提交
})();
