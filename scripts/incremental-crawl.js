#!/usr/bin/env node
// scripts/incremental-crawl.js — 增量采集：枚举合集 → 对比基线 → 下载新增文章
//
// 用法（在仓库根目录执行）：
//   node scripts/incremental-crawl.js
//   node scripts/incremental-crawl.js --date 2026-10-08      # 手动指定文件夹日期
//   node scripts/incremental-crawl.js --update-baseline      # 采集后把新增并入基线
//   node scripts/incremental-crawl.js --biz MzUyNjk4NjM1MA==
//
// 流程：
//   1. 读 data/baseline.json（已采集文章的 mid/idx 集合）
//   2. 枚举 data/albums.json 里全部合集 → 收集所有文章
//   3. 对比基线，找出新增文章（不在基线里的）
//   4. 对新增文章探测其所属合集，若发现新合集则一并枚举（递归一层）
//   5. 下载新增文章 → 转 docx → 输出到 新增-YYYY-MM-DD/ 文件夹
//
// 依赖：cheerio、html-to-docx（见 scripts/package.json）
const fs = require('fs');
const path = require('path');
const { getAppmsgExt, getAlbumArticles, sleep } = require('./lib/wechat');
const { htmlToDocx, safeName } = require('./lib/convert');

const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--biz') { a.biz = argv[++i]; }
    else if (k === '--date') { a.date = argv[++i]; }
    else if (k === '--out') { a.out = argv[++i]; }
    else if (k === '--baseline') { a.baseline = argv[++i]; }
    else if (k === '--albums') { a.albums = argv[++i]; }
    else if (k === '--update-baseline') { a.updateBaseline = true; }
    else if (k === '--no-discover') { a.noDiscover = true; }
  }
  return a;
}

function beijingDateStr() {
  const now = new Date();
  const bj = new Date(now.getTime() + 8 * 3600 * 1000);
  return bj.toISOString().slice(0, 10);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const biz = args.biz || 'MzUyNjk4NjM1MA==';
  const dateStr = args.date || beijingDateStr();
  const baselineFile = args.baseline ? path.resolve(args.baseline) : path.join(ROOT, 'data', 'baseline.json');
  const albumsFile = args.albums ? path.resolve(args.albums) : path.join(ROOT, 'data', 'albums.json');
  const outBase = args.out ? path.resolve(args.out) : ROOT;
  const outDir = path.join(outBase, `新增-${dateStr}`);

  console.log(`==== 增量采集 ${dateStr} ====`);
  console.log(`biz=${biz}`);
  console.log(`baseline=${baselineFile}`);
  console.log(`albums=${albumsFile}`);
  console.log(`输出=${outDir}`);

  const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
  const baselineSet = new Set(baseline.map((b) => `${b.mid}-${b.idx}`));
  const albumList = JSON.parse(fs.readFileSync(albumsFile, 'utf8'));
  console.log(`基线 ${baselineSet.size} 篇，已知合集 ${albumList.length} 个`);

  // 1) 枚举全部已知合集
  const known = new Map(); // tag -> article
  const albumIds = albumList.map((x) => (typeof x === 'string' ? x : x.id));
  for (const albumId of albumIds) {
    try {
      const arts = await getAlbumArticles(biz, albumId, {
        onPage: ({ page }) => { if (page > 1) process.stdout.write(`  [${albumId}] p${page}\r`); },
      });
      for (const a of arts) known.set(`${a.mid}-${a.idx}`, a);
      console.log(`  合集 ${albumId} → ${arts.length} 篇`);
    } catch (e) {
      console.log(`  合集 ${albumId} 枚举失败：${e.message}`);
    }
    await sleep(800);
  }
  console.log(`合集去重后共 ${known.size} 篇`);

  // 2) 找出新增（不在基线里）
  let fresh = [...known.values()].filter((a) => !baselineSet.has(`${a.mid}-${a.idx}`));
  console.log(`对比基线：新增 ${fresh.length} 篇`);

  if (!fresh.length) {
    console.log('没有新增文章，结束。');
    return;
  }

  // 3) 对新文章探测新合集（可选，发现公众号新建的主题合集）
  if (!args.noDiscover) {
    const knownAlbumSet = new Set(albumIds);
    const discovered = new Set();
    for (const a of fresh.slice(0, 60)) {
      try {
        const ext = await getAppmsgExt(biz, a.mid, a.idx);
        if (ext.albumId && !knownAlbumSet.has(ext.albumId)) discovered.add(ext.albumId);
      } catch (e) { /* 忽略单篇失败 */ }
      await sleep(400 + Math.floor(Math.random() * 300));
    }
    if (discovered.size) {
      console.log(`发现 ${discovered.size} 个新合集，补充枚举…`);
      for (const albumId of discovered) {
        try {
          const arts = await getAlbumArticles(biz, albumId);
          for (const a of arts) {
            const tag = `${a.mid}-${a.idx}`;
            if (!known.has(tag)) known.set(tag, a);
          }
          console.log(`  新合集 ${albumId} → ${arts.length} 篇`);
        } catch (e) { console.log(`  新合集 ${albumId} 失败：${e.message}`); }
        await sleep(800);
      }
      fresh = [...known.values()].filter((a) => !baselineSet.has(`${a.mid}-${a.idx}`));
      console.log(`补充后新增 ${fresh.length} 篇`);
    }
  }

  // 4) 下载新增
  fs.mkdirSync(outDir, { recursive: true });
  let ok = 0, fail = 0, skip = 0;
  const saved = [];
  for (const a of fresh) {
    const tag = `${a.mid}-${a.idx}`;
    if (fs.existsSync(path.join(outDir)) && fs.readdirSync(outDir).some((f) => f.startsWith(tag + '_'))) { skip++; continue; }
    try {
      const res = await fetch(a.url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36', Referer: 'https://mp.weixin.qq.com/' } });
      const html = await res.text();
      if (html.length < 50000 || (!html.includes('js_content') && !html.includes('rich_media_content'))) throw new Error('not-content len=' + html.length);
      const { buf, title, images } = await htmlToDocx(html, { titleOverride: a.title, authorFallback: '华为计算' });
      fs.writeFileSync(path.join(outDir, `${tag}_${safeName(title)}.docx`), buf);
      ok++;
      saved.push({ mid: a.mid, idx: a.idx, title, date: a.createTime ? new Date(a.createTime * 1000).toISOString().slice(0, 10) : '' });
      console.log(`  OK ${tag} "${String(title).slice(0, 26)}" img=${images.ok}/${images.total}`);
    } catch (e) {
      fail++;
      console.log(`  FAIL ${tag} :: ${e.message}`);
    }
    await sleep(1500 + Math.floor(Math.random() * 2000));
  }

  // 5) 写本次采集的记录
  fs.writeFileSync(path.join(outDir, '_采集记录.json'), JSON.stringify({ date: dateStr, total: fresh.length, ok, fail, skip, articles: saved }, null, 2), 'utf8');

  // 6) 可选：并入基线
  if (args.updateBaseline && saved.length) {
    const merged = baseline.concat(saved.map((s) => ({ mid: s.mid, idx: s.idx, title: s.title, date: s.date })));
    const seen = new Set();
    const uniq = merged.filter((m) => { const k = `${m.mid}-${m.idx}`; if (seen.has(k)) return false; seen.add(k); return true; });
    fs.writeFileSync(baselineFile, JSON.stringify(uniq, null, 2), 'utf8');
    console.log(`基线已更新：${baseline.length} → ${uniq.length}`);
  }

  console.log(`\n完成：新增 ${ok} 篇，失败 ${fail} 篇，跳过(已存在) ${skip} 篇`);
  console.log(`输出目录：${outDir}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
