// lib/convert.js — 微信公众号文章 HTML → DOCX（正文 + 图片内嵌）
//
// 要点：
//   1. 图片从 data-src 下载后转 base64 data URI 内嵌。
//   2. 移除会导致 docx 无法打开的多媒体/交互元素（视频号卡片 <mp-common-videosnap>、iframe、svg、小程序等）。
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const HTMLtoDOCX = require('html-to-docx');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

function pick(html, re) {
  const m = html.match(re);
  return m ? m[1] : '';
}
function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
               webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml' };

function localImage(url, imageMap) {
  if (!imageMap) return null;
  const rel = imageMap[url];
  if (!rel) return null;
  try {
    const p = path.isAbsolute(rel) ? rel : path.join(REPO_ROOT, rel);
    const buf = fs.readFileSync(p);
    const ext = (p.match(/\.([a-z0-9]+)$/i) || [])[1] || 'jpg';
    // 按文件头识别 GIF（扩展名可能因 content-type 误标为 jpg），html-to-docx 对 GIF 支持有缺陷
    if (buf.slice(0, 4).toString('latin1').startsWith('GIF8') || ext.toLowerCase() === 'gif') return null;
    return `data:${MIME[ext.toLowerCase()] || 'image/jpeg'};base64,${buf.toString('base64')}`;
  } catch (e) { return null; }
}

async function urlToDataUri(url, imageMap) {
  const local = localImage(url, imageMap);
  if (local) return local;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://mp.weixin.qq.com/' } });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || 'image/jpeg';
    const buf = Buffer.from(await res.arrayBuffer());
    if (ct.includes('gif') || buf.slice(0, 4).toString('latin1').startsWith('GIF8')) return null;
    return `data:${ct.split(';')[0]};base64,${buf.toString('base64')}`;
  } catch (e) {
    return null;
  }
}

async function htmlToDocx(raw, { titleOverride = '', authorFallback = '', imageMap = null } = {}) {
  const title =
    titleOverride ||
    decodeEntities(pick(raw, /var msg_title = ['"]([^'"]*)['"]/) || pick(raw, /<meta property="og:title" content="([^"]*)"/)) ||
    'untitled';
  const author = decodeEntities(pick(raw, /var author = ['"]([^'"]*)['"]/) || pick(raw, /var nickname = htmlDecode\("([^"]*)"\)/));
  const ctMatch = raw.match(/var ct = ['"](\d+)['"]/) || raw.match(/var ct="(\d+)"/);
  const dateStr = ctMatch ? new Date(parseInt(ctMatch[1], 10) * 1000) : null;

  const $ = cheerio.load(raw);
  let content = $('#js_content');
  if (!content.length) content = $('.rich_media_content');
  if (!content.length) content = $('body');

  const imgs = content.find('img').toArray();
  let imgOk = 0;
  for (const el of imgs) {
    const ds = $(el).attr('data-src') || '', ss = $(el).attr('src') || '';
    if (/\.gif(\?|$)/i.test(ds) || /\.gif(\?|$)/i.test(ss) || ds.startsWith('data:image/gif') || ss.startsWith('data:image/gif')) {
      $(el).remove(); continue; // GIF 会让 docx 缺 content-type
    }
    let src = ds || ss;
    if (!src || src.startsWith('data:')) continue;
    if (src.startsWith('//')) src = 'https:' + src;
    if (!/^https?:/.test(src)) continue;
    const dataUri = await urlToDataUri(src, imageMap);
    if (dataUri) { $(el).attr('src', dataUri); $(el).removeAttr('data-src'); imgOk++; }
    else $(el).remove();
  }

  content.find('iframe, svg, video, audio, embed, object, script, style').remove();
  content.find(
    'mp-common-videosnap, mpvoice, mpvideo, mpcps, mp-miniprogram, mp-common-product, ' +
    'mp-common-mpaudio, mp-common-qqmusic, mp-common-cps, mp-common-profile, mp-common-topnav, ' +
    'mp-common-bottomnav, mp-common-search, mp-common-questionscheck, mp-common-comment, mp-common-redpacket'
  ).remove();
  content.find('[class*="video_iframe"], [class*="videosnap"], [class*="channels_iframe"], [class*="appmsg_card"], [class*="weapp_card"], [class*="qqmusic"]').remove();
  content.find('*').removeAttr('style').removeAttr('class').removeAttr('id');

  const bodyHtml = content.html() || '';
  const fullHtml =
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body>` +
    `<h1>${title}</h1>` +
    `<p>作者：${author || authorFallback || ''}　发布时间：${dateStr ? dateStr.toLocaleString('zh-CN') : ''}</p>` +
    bodyHtml + `</body></html>`;

  const buf = await HTMLtoDOCX(fullHtml, null, { table: { row: { cantSplit: true } }, footer: false, pageNumber: false, font: '宋体' });
  return { buf, title, author, date: dateStr, images: { ok: imgOk, total: imgs.length } };
}

function safeName(s) {
  return String(s || 'untitled').replace(/[\\/:*?"<>|\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

module.exports = { htmlToDocx, safeName };
