# 图片中转（GitHub Actions）

公司代理屏蔽 `mmbiz.qpic.cn`，本地抓文章时图片会丢失。本目录用 GitHub Actions 下载图片，再把图回填到 docx。

## 流程

```text
本地抓取（正文正常，图片被移除）
   node scripts/incremental-crawl.js        # 默认保存 raw/<mid>-<idx>.html
        ↓
提取图片 URL
   node scripts/extract-images.js           # → relay/pending.json
        ↓
提交 pending.json（push）
   git add relay/pending.json && git commit -m "relay pending" && git push
        ↓
GitHub Actions 自动运行（.github/workflows/image-relay.yml）
   → relay/images/<id>.<ext> + relay/manifest.json（自动 commit/push）
        ↓
本地拉回并重建带图 docx
   git pull
   node scripts/rebuild-docx.js --raw raw --manifest relay/manifest.json --out 新增-图文
        ↓
用“新增-图文/”里的 docx 进 Docs 审核 / 入库
```

## 说明

- `relay/pending.json` 是触发器：push 后 Actions 自动跑；也可在 Actions 页面手动 `workflow_dispatch`
- 图片以文件形式提交进仓库（单张几十 KB）；定期清理旧批次，避免仓库膨胀
- 失败图片会记录在日志里，manifest 中不出现 → 对应图在 docx 中仍为缺失
- 首次推送前需确认仓库 Actions 已启用（Settings → Actions → General → Allow all actions）

## 本地测试

```bash
# 用已有 raw/*.html 测试提取
node scripts/extract-images.js

# 不带 GitHub 时，用本地图片模拟 manifest 测试重建
node scripts/rebuild-docx.js --raw raw --manifest relay/manifest.json --out /tmp/rebuild-test
```
