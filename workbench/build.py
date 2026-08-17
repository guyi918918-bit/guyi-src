#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把增强模块注入原始工作台 HTML，产出 dist/index.html。
原始代码保持逐行不变，只做「插入 / 已白名单的替换」，确保功能与版式零偏差。

本次注入：
  - 云端同步骨架（enhance.css / enhance_header.html / enhance_body.html / enhance.js）【保留】
  - 六大板块导航：情报搜集(dash) / 灵感早报(inspire) / 日常工作(work) / 项目管理 / 客户管理 / 回收站(recycle)
    - dash.css + dash_panels.html(情报搜集：双窗口+检索入口自搜+目标企业库 三子窗口) + work_panels.html(日常工作) + inspire_panels.html(灵感早报) + dash.js + extra.js
    - 回收站从日常工作二级子标签提升为与客户管理并列的顶层独立板块
    - 目标企业库并入情报搜集「🏢 目标企业库」子窗口（62 条种子企业 + 情报自动同步，均附公开活动证据/挂网链接）
    - 情报搜集「🔗 检索入口（自搜）」子窗口（50+ 分地区检索平台，新增/批量删除）
    - 客户管理：运行时把内联新增表单收起为「➕ 新增客户」按钮
"""
import pathlib
import re
import sys
import json
import time
import base64

ROOT = pathlib.Path(__file__).resolve().parent
BASE = ROOT.parent / "_extract" / "copy1.html"
PATCH = ROOT / "patch"
OUT = ROOT / "dist" / "index.html"
FEED = ROOT / "feed.json"


def read(p):
    return p.read_text(encoding="utf-8")


def insert_before(src, anchor, payload, what):
    idx = src.find(anchor)
    if idx < 0:
        sys.exit("[FAIL] 未找到锚点（%s）: %r" % (what, anchor[:60]))
    if src.count(anchor) != 1:
        sys.exit("[FAIL] 锚点不唯一（%s），出现 %d 次" % (what, src.count(anchor)))
    return src[:idx] + payload + src[idx:]


def insert_after(src, anchor, payload, what):
    idx = src.find(anchor)
    if idx < 0:
        sys.exit("[FAIL] 未找到锚点（%s）: %r" % (what, anchor[:60]))
    if src.count(anchor) != 1:
        sys.exit("[FAIL] 锚点不唯一（%s），出现 %d 次" % (what, src.count(anchor)))
    end = idx + len(anchor)
    return src[:end] + payload + src[end:]


OLD_TABBAR = '''    <!-- ===== 标签栏 ===== -->
  <div class="tab-bar">
      <button class="tab-btn active" data-tab="daily">📋 日报</button>
      <button class="tab-btn" data-tab="weekly">📊 周报</button>
      <button class="tab-btn" data-tab="monthly">📈 月报</button>
      <button class="tab-btn" data-tab="projects">📌 项目管理</button>
      <button class="tab-btn" data-tab="clients">👥 客户</button>
      <button class="tab-btn" data-tab="stat">📊 看板</button>
      <button class="tab-btn" data-tab="annual">📅 年度</button>
      <button class="tab-btn" data-tab="history">📚 历史</button>
      <button class="tab-btn" data-tab="recycle">🗑️ 回收站</button>
  </div>'''

NEW_TABBAR = '''    <!-- ===== 七大板块导航 ===== -->
    <div class="tab-bar">
      <button class="top-tab active" data-tab="dash">🛰️ 情报搜集</button>
      <button class="top-tab" data-tab="inspire">💡 灵感早报</button>
      <button class="top-tab" data-tab="work">🗓️ 日常工作</button>
      <button class="top-tab" data-tab="projects">📌 项目管理</button>
      <button class="top-tab" data-tab="clients">👥 客户管理</button>
      <button class="top-tab" data-tab="recycle">🗑️ 回收站</button>
    </div>'''


def main():
    src = read(BASE)
    orig_lines = src.count("\n")

    # ---------- 1) 移动端 meta + 本地化 xlsx（去掉外部 CDN 强依赖） ----------
    src = insert_after(
        src,
        '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
        '\n'
        '  <meta name="theme-color" content="#0066cc" />\n'
        '  <meta name="apple-mobile-web-app-capable" content="yes" />\n'
        '  <meta name="apple-mobile-web-app-title" content="认真工作台" />\n'
        '  <meta name="mobile-web-app-capable" content="yes" />\n'
        '  <meta name="referrer" content="no-referrer" />\n'
        '  <link rel="icon" type="image/png" href="./icon-192.png" />\n'
        '  <link rel="apple-touch-icon" href="./icon-192.png" />\n'
        '  <link rel="manifest" href="./manifest.webmanifest" />',
        "viewport meta",
    )

    src = src.replace(
        '  <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js">\n  </script>',
        '  <script src="./xlsx.full.min.js"></script>\n'
        '  <script>\n'
        '    window.addEventListener("load", function () {\n'
        '      if (typeof XLSX === "undefined") {\n'
        '        var s = document.createElement("script");\n'
        '        s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";\n'
        '        document.head.appendChild(s);\n'
        '      }\n'
        '    });\n'
        '  </script>',
        1,
    )
    if "./xlsx.full.min.js" not in src:
        sys.exit("[FAIL] xlsx 本地化替换失败")

    # ---------- 2) 增强样式：五大板块 + 同步 ----------
    src = insert_before(src, "  </style>\n</head>", read(PATCH / "dash.css"), "dash style")
    src = insert_before(src, "  </style>\n</head>", read(PATCH / "enhance.css"), "sync style")

    # ---------- 3) 头部同步状态徽标（保留云端同步） ----------
    src = src.replace(
        '    <div class="header-actions">\n',
        '    <div class="header-actions">\n' + read(PATCH / "enhance_header.html"),
        1,
    )

    # ---------- 4) 五大板块导航（替换原 9 个平铺标签，白名单替换） ----------
    m = re.search(r'<!--\s*=====\s*标签栏\s*=====\s*-->\s*<div class="tab-bar">.*?</div>', src, re.S)
    if not m:
        sys.exit("[FAIL] 未匹配到原标签栏，无法替换")
    src = src[:m.start()] + NEW_TABBAR + src[m.end():]

    # ---------- 5) 弹窗 + 同步脚本 + 种子数据 + 模块脚本 ----------
    feed_json = FEED.read_text(encoding="utf-8")
    json.loads(feed_json)  # 校验合法
    seed_script = '<script>window.__SEED_FEED__ = ' + feed_json + ';</script>'
    # Service Worker 注册（静默；仅 https 且非本地时启用，失败不影响主功能）
    sw_register = (
        '<script>\n'
        '(function () {\n'
        '  if (!("serviceWorker" in navigator)) return;\n'
        '  if (location.protocol !== "https:") return;\n'
        '  if (/localhost|127\\.0\\.0\\.1/.test(location.host)) return;\n'
        '  window.addEventListener("load", function () {\n'
        '    navigator.serviceWorker.register("./sw.js").catch(function (e) { console.warn("[SW]", e); });\n'
        '  });\n'
        '})();\n'
        '</script>\n'
    )
    payload = (
        sw_register
        + read(PATCH / "enhance_body.html") + "\n"
        + read(PATCH / "enhance.js") + "\n"
        + seed_script + "\n<script>\n" + read(PATCH / "dash.js") + "\n</script>"
        + "\n<script>\n" + read(PATCH / "extra.js") + "\n</script>"
    )
    tail = "  </script>\n</body>"
    if src.count(tail) != 1:
        sys.exit("[FAIL] body 收尾锚点不唯一，出现 %d 次" % src.count(tail))
    src = src.replace(tail, "  </script>\n" + payload + "</body>", 1)

    # ---------- 6) 三大面板（插入到模态框之前） ----------
    panels_payload = (
        read(PATCH / "dash_panels.html")
        + "\n" + read(PATCH / "work_panels.html")
        + "\n" + read(PATCH / "inspire_panels.html")
    )
    src = insert_before(src, "  <!-- ===== 模态框 ===== -->", panels_payload, "dash/work/inspire panels")

    # ---------- 7) 内联 PWA manifest（绕过 CloudStudio 对 .webmanifest 的 MIME 限制） ----------
    import shutil
    manifest_text = (ROOT / "manifest.webmanifest").read_text(encoding="utf-8")
    manifest_b64 = base64.b64encode(manifest_text.encode("utf-8")).decode("ascii")
    inline_manifest = 'data:application/json;base64,' + manifest_b64
    src = src.replace(
        '<link rel="manifest" href="./manifest.webmanifest" />',
        '<link rel="manifest" href="%s" />' % inline_manifest,
        1,
    )
    if 'data:application/json;base64,' not in src:
        sys.exit("[FAIL] manifest 内联失败")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(src, encoding="utf-8")

    # ---------- 8) Service Worker：每次构建注入时间戳，触发浏览器更新 ----------
    sw_src = (ROOT / "sw.js").read_text(encoding="utf-8")
    sw_src = sw_src.replace("/*BUILD_TS*/", "/* build@%d */" % int(time.time()))
    (ROOT / "dist" / "sw.js").write_text(sw_src, encoding="utf-8")

    # ---------- 9) PWA 资源：manifest + 图标 ----------
    (ROOT / "dist" / "manifest.webmanifest").write_text(manifest_text, encoding="utf-8")
    if (ROOT / "icon.svg").exists():
        shutil.copy(ROOT / "icon.svg", ROOT / "dist" / "icon.svg")
    if (ROOT / "icon-192.png").exists():
        shutil.copy(ROOT / "icon-192.png", ROOT / "dist" / "icon-192.png")
    if (ROOT / "icon-512.png").exists():
        shutil.copy(ROOT / "icon-512.png", ROOT / "dist" / "icon-512.png")

    print("[OK] 输出 %s" % OUT)
    print("[OK] 输出 %s" % (ROOT / "dist" / "sw.js"))
    print("     原始 %d 行 -> 产出 %d 行（纯插入 + 已白名单替换，原有代码未改动）"
          % (orig_lines, src.count("\n")))


if __name__ == "__main__":
    main()
