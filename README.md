# HuaweiCompute — 华为计算公众号文章归档

「华为计算」微信公众号文章的完整归档与**可持续增量采集**方案。

## 现状

- **已归档：695 篇 docx**（正文 + 图片内嵌），覆盖 **2022-04-02 → 2026-10-03**
- 全量清单：[`文档清单.xlsx`](./文档清单.xlsx)
- 完整压缩包（按年份分 5 卷）：[Releases v1.0](https://github.com/yuanshuo2002/HuaweiCompute/releases)

## 增量采集（新文章持续更新）

公众号文章更新频繁。本仓库提供一套**给 AI 直接复用**的增量采集方案：

👉 **核心文档：[`采集方案.md`](./采集方案.md)** —— 包含原理、已知合集、流程、踩过的坑。

```bash
# 一次性准备
cd scripts && npm install

# 每次采集（在仓库根目录执行）
node scripts/incremental-crawl.js

# 新文章会落到：新增-YYYY-MM-DD/（采集当天日期）
# 如需把新增并入基线，避免下次重复：
node scripts/incremental-crawl.js --update-baseline
```

## 目录结构

```
HuaweiCompute/
├── README.md              # 本文件
├── 采集方案.md             # ⭐ 增量采集方案（AI 复用入口）
├── 文档清单.xlsx           # 695 篇全量清单
├── data/
│   ├── baseline.json      # 695 篇基线索引（mid/idx/标题/日期）
│   └── albums.json        # 15 个已知合集 ID
├── scripts/
│   ├── incremental-crawl.js   # 增量采集主脚本
│   ├── package.json
│   └── lib/
│       ├── wechat.js          # 免凭证接口封装
│       └── convert.js         # HTML → docx
└── 新增-YYYY-MM-DD/           # 每次采集的新文章（脚本自动创建）
```

## 快速了解原理

微信公众号没有公开的历史文章列表接口，但可通过三个**免凭证**接口绕过：

1. `getappmsgext` — 由 mid/idx 查文章所属**合集 ID**
2. `appmsgalbum` — 由合集 ID **枚举全部文章**（含下载必需的 `sn`）
3. `getainfo` — 由 mid/idx 探测文章存在性

详见 [`采集方案.md`](./采集方案.md)。

## 已知局限

- 不属于任何合集的「孤儿文章」无法通过免费接口拿到 `sn`，需手动搜索或付费 API 补全；
- 已删除文章无法恢复；
- 视频/iframe/svg 等元素在转 docx 时会被移除（否则 docx 无法打开），正文文字与图片完整保留。

## License

仅用于个人备份、研究等合规用途；请遵守微信平台条款与内容版权。
