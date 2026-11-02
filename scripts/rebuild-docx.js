#!/usr/bin/env node
// rebuild-docx.js — 用已下载的图片（relay/manifest.json）重新生成带图 docx
// 用法: node scripts/rebuild-docx.js --raw raw --manifest relay/manifest.json --out 新增-图文
const fs = require('fs');
const path = require('path');
const { htmlToDocx, safeName } = require('./lib/convert');

const ROOT = path.resolve(__dirname, '..');
function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
}

(async () => {
  const rawDir = path.resolve(ROOT, arg('raw', 'raw'));
  const manifestFile = path.resolve(ROOT, arg('manifest', 'relay/manifest.json'));
  const outDir = path.resolve(ROOT, arg('out', '新增-图文'));
  if (!fs.existsSync(rawDir)) { console.error('raw 目录不存在'); process.exit(2); }
  if (!fs.existsSync(manifestFile)) { console.error('manifest 不存在'); process.exit(2); }
  const { images } = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  fs.mkdirSync(outDir, { recursive: true });

  const files = fs.readdirSync(rawDir).filter((f) => f.endsWith('.html'));
  let ok = 0, fail = 0;
  for (const f of files) {
    try {
      const html = fs.readFileSync(path.join(rawDir, f), 'utf8');
      const tag = path.basename(f, '.html');
      const { buf, title, images: imgStat } = await htmlToDocx(html, { imageMap: images });
      fs.writeFileSync(path.join(outDir, `${tag}_${safeName(title)}.docx`), buf);
      console.log(`  OK ${tag} "${String(title).slice(0, 24)}" img=${imgStat.ok}/${imgStat.total}`);
      ok++;
    } catch (e) { fail++; console.error(`  FAIL ${f} :: ${e.message}`); }
  }
  console.log(`完成：成功 ${ok} / 失败 ${fail} → ${outDir}`);
})();
