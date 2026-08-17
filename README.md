# 认真工作台 · 源代码仓库（guyi-src）

本仓库保存「认真工作台」**可复现构建的全部源代码**。
线上成品站点部署在另一个仓库 `guyi`（GitHub Pages，永久链接 https://guyi918918-bit.github.io/guyi/）。

## 目录结构（与本地开发一致，不可打乱）

```
guyi-src/
├── _extract/
│   └── copy1.html          # base 底座（5200+ 行原始工作台，含本次所有修改）
├── workbench/
│   ├── build.py            # 注入式构建：读 base → 注入 patch/* → 输出 dist/index.html
│   ├── verify.py           # 静态校验（关键 id / 面板 / 存储键 / SW / PWA）
│   ├── v3test*.mjs         # jsdom 冒烟测试（79+2+5+10 断言）
│   ├── generate_icons.py   # 从猫咪头像生成 PWA 图标（192/512/svg）
│   ├── sw.js               # Service Worker 源码（Network-First + 构建戳）
│   ├── manifest.webmanifest# PWA manifest 源（构建时 base64 内联，绕过 CloudStudio MIME）
│   ├── feed.json           # 情报/案例数据种子
│   ├── patch/              # 注入补丁（dash/extra/enhance 的 js/css/html）
│   └── 使用说明.md / 工作台升级说明.md / Supabase配置指引.md
└── UX审查报告.md            # 10年 UX 视角逐模块审查 + 优化路线图
```

> 关键约定：`build.py` 中 `BASE = ROOT.parent / "_extract" / "copy1.html"`，
> 因此 `_extract/` 与 `workbench/` 必须保持**兄弟目录**关系，移动任一目录都会导致构建失败。

## 构建与部署

```bash
# 1. 在本仓库根目录运行构建（生成 workbench/dist/）
cd workbench
python3 build.py

# 2. 校验 + 测试
python3 verify.py
NODE_PATH=<node_modules> node v3test.mjs

# 3. 部署：把 workbench/dist/* 同步到 guyi 仓库根目录并 push
#    （GitHub Pages 从 guyi 仓库 main 分支根目录托管）
```

## 工程约束（重要）

- **base 文件 `_extract/copy1.html` 原则零删改**；所有功能增强只写进 `workbench/patch/*`，
  由 `build.py` 注入式合并。本次为落地「客户卡折叠 / 周月报自动聚合 / getStorage 容错」
  曾破例直接改 base，已记录。
- 云同步用 Supabase 免费版，图片压缩 / 回收站清理 / 日报归档等策略已内置于 `enhance.js`。

## 关联

- 成品/部署：`guyi` 仓库（GitHub Pages）
- 保活：`.github/workflows/keepalive.yml` 在 guyi 仓库，每日 ping Supabase 防暂停
