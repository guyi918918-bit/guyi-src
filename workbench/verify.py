#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""产物校验：1) 原始代码零丢失 2) 内联 JS 语法可解析 3) 关键 id 齐全"""
import pathlib
import re
import subprocess
import sys
import tempfile
import difflib

ROOT = pathlib.Path(__file__).resolve().parent
BASE = ROOT.parent / "_extract" / "copy1.html"
OUT = ROOT / "dist" / "index.html"
NODE = "/Users/mianmian/.workbuddy/binaries/node/versions/22.22.2/bin/node"

ok = True


def fail(msg):
    global ok
    ok = False
    print("  [FAIL] " + msg)


base = BASE.read_text(encoding="utf-8").split("\n")
out = OUT.read_text(encoding="utf-8").split("\n")

# ---------- 1) 原始代码零丢失（允许纯插入 / 已知的白名单替换） ----------
print("[1] 原始代码完整性")
sm = difflib.SequenceMatcher(None, base, out, autojunk=False)
removed, replaced, inserted = [], [], 0
for tag, i1, i2, j1, j2 in sm.get_opcodes():
    if tag == "delete":
        removed.append((i1, i2, base[i1:i2]))
    elif tag == "replace":
        replaced.append((i1, i2, base[i1:i2], out[j1:j2]))
    elif tag == "insert":
        inserted += j2 - j1

ALLOWED_REPLACE_TOKENS = (
    "xlsx.full.min.js", "window.__wbSync", "renderRadar", "syncModal", "标签栏",
)
for i1, i2, olds, news in replaced:
    joined = "\n".join(olds) + "\n".join(news)
    if not any(t in joined for t in ALLOWED_REPLACE_TOKENS):
        fail("出现未预期的行替换 @原文第 %d-%d 行: %r" % (i1 + 1, i2, olds[:2]))

if removed:
    for i1, i2, olds in removed:
        fail("原始代码被删除 @第 %d-%d 行: %r" % (i1 + 1, i2, olds[:2]))
else:
    print("  [OK] 无任何原始行被删除")

print("  [OK] 新增 %d 行；预期替换均落在白名单内" % inserted)

# ---------- 2) 内联 JS 语法检查 ----------
print("[2] 内联 JavaScript 语法")
html = OUT.read_text(encoding="utf-8")
scripts = re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", html, re.S)
print("  发现 %d 段内联脚本" % len(scripts))
for i, code in enumerate(scripts):
    if not code.strip():
        continue
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as f:
        f.write(code)
        path = f.name
    r = subprocess.run([NODE, "--check", path], capture_output=True, text=True)
    if r.returncode != 0:
        fail("第 %d 段脚本语法错误:\n%s" % (i + 1, r.stderr[:900]))
    else:
        print("  [OK] 第 %d 段脚本语法正确（%d 字符）" % (i + 1, len(code)))
    pathlib.Path(path).unlink()

# ---------- 3) 标签闭合与关键元素 ----------
print("[3] 结构与关键元素")
for tag in ("html", "head", "body", "style"):
    o, c = html.count("<%s" % tag), html.count("</%s>" % tag)
    print("  <%s> 开 %d / 闭 %d" % (tag, o, c))

need_ids = [
    "syncBadge", "syncBadgeText", "syncModal", "syncUrl", "syncKey", "syncSpace",
    "syncStatusBox", "syncSqlBox", "wbToastWrap",
    "panel-daily", "panel-weekly", "panel-monthly", "panel-history",
    "history-daily", "history-weekly", "history-monthly",
    "todoDailyList", "todoWeeklyList", "todoMonthlyList",
    "d-date", "w-week", "m-month", "globalYear",
    # 五大板块新增
    "panel-dash", "panel-work", "workInner", "panel-inspire",
    "intelRegions", "intelKw", "insRegions", "insSources",
    "dashSubBar", "insSubBar", "intelNotice", "intelSector", "dashChips",
    "intelWinLabel", "insWinLabel", "insListSection", "calSection", "calGrid", "calDetail",
    "gridTenders", "gridCases",
    "nTenders", "nCases", "statTenders", "statCases", "statProv", "statSrc", "statProv2", "statNew",
    "dashUpdated", "insUpdated",
    # V3.3 新增：情报检索入口(自搜) + 灵感早报创意入口
    "intelCfgWrap", "dashStats",
    "tendersSection", "linksSection", "intelLinks", "nLinks",
    "lkAddBtn", "lkBatchBtn", "lk-region-sel", "lk-region-new", "lk-name", "lk-url", "lk-save", "lk-cancel",
    "inspLinksSection", "inspLinks", "nInspLinks",
    "inspLkAddBtn", "inspLkBatchBtn", "inspLk-region-sel", "inspLk-region-new", "inspLk-name", "inspLk-url", "inspLk-save", "inspLk-cancel",
]
for i in need_ids:
    if ('id="%s"' % i) not in html:
        fail("缺少元素 id=%s" % i)
print("  [OK] 关键元素 id 检查完成（共 %d 个）" % len(need_ids))

need_fn = [
    "openSyncModal", "closeSyncModal", "saveSyncConfig", "manualSyncNow",
    "testSyncConnection", "disconnectSync", "copySyncSql",
    "toast", "markDirty",
]
for fn in need_fn:
    if ("function %s" % fn) not in html and ("window.%s" % fn) not in html:
        fail("缺少全局函数 %s" % fn)
print("  [OK] 同步/模块相关全局函数检查完成（共 %d 个）" % len(need_fn))

# ---------- 4) 六大板块导航 ----------
print("[4] 六大板块导航")
tabs = re.findall(r'<button[^>]*class="top-tab[^"]*"[^>]*data-tab="([a-z]+)"', html)
expect_tabs = ["dash", "inspire", "work", "projects", "clients", "recycle"]
if tabs != expect_tabs:
    fail("六大板块顺序/数量不正确: %r" % (tabs,))
else:
    print("  [OK] 6 个板块顺序正确: %s" % " ".join(tabs))

# 情报搜集：检索入口自搜
if 'data-win="links"' not in html:
    fail("情报搜集缺少「检索入口（自搜）」子窗口")
else:
    print("  [OK] 情报搜集「检索入口（自搜）」子窗口已就位")
if 'data-win="targets"' in html:
    fail("目标企业库子窗口应已删除")
else:
    print("  [OK] 目标企业库子窗口已删除")

for pid in ["panel-daily", "panel-weekly", "panel-monthly", "panel-projects",
            "panel-clients", "panel-stat", "panel-annual", "panel-history",
            "panel-recycle", "panel-dash", "panel-work", "panel-inspire"]:
    if ('id="%s"' % pid) not in html:
        fail("缺少面板 %s" % pid)
print("  [OK] 12 个面板 id 齐全（原 9 + 情报搜集 + 日常工作 + 灵感早报）")

for k in ["KEY_DAILY", "KEY_WEEKLY", "KEY_MONTHLY", "KEY_ANNUAL_STAT",
          "KEY_CLIENTS", "KEY_PROJECTS", "KEY_RECYCLE", "KEY_TODOS"]:
    if ("const %s = " % k) not in html:
        fail("缺少存储键 %s" % k)
print("  [OK] 8 个存储键定义完整")

# ---------- 5) Service Worker（自动更新） ----------
print("[5] Service Worker")
sw_path = ROOT / "dist" / "sw.js"
if not sw_path.exists():
    fail("dist/sw.js 未生成（构建应产出）")
else:
    swc = sw_path.read_text(encoding="utf-8")
    if "/*BUILD_TS*/" in swc:
        fail("sw.js 构建戳未替换（将导致无法触发更新）")
    if "self.addEventListener('install'" not in swc and 'self.addEventListener("install"' not in swc:
        fail("sw.js 缺少 install 事件")
    print("  [OK] dist/sw.js 已生成且构建戳已注入")
    if "serviceWorker.register" not in html:
        fail("index.html 未注入 SW 注册脚本")
    else:
        print("  [OK] index.html 已注入 SW 注册脚本（静默注册，失败不影响主功能）")
    if not (ROOT / "dist" / "manifest.webmanifest").exists():
        print("  [WARN] dist/manifest.webmanifest 缺失（不影响自动更新，仅影响安装图标）")
    elif 'rel="manifest"' not in html:
        print("  [WARN] index.html 未注入 manifest link（不影响自动更新）")
    elif 'data:application/json;base64,' not in html:
        print("  [WARN] manifest 未内联（CloudStudio 可能返回错误 MIME）")
    else:
        print("  [OK] PWA manifest 已内联注入（可「加到主屏幕」为独立 App）")
    for icon in ("icon-192.png", "icon-512.png"):
        if not (ROOT / "dist" / icon).exists():
            fail("dist/%s 缺失（影响安装图标）" % icon)
    if './icon-192.png' not in html:
        fail("index.html 未引用 PNG 图标作为 apple-touch-icon")
    elif 'rel="icon"' not in html:
        fail("index.html 未设置浏览器标签页 favicon（<link rel=\"icon\">）")
    else:
        print("  [OK] PNG 安装图标及浏览器 favicon 已生成并引用")

print("\n" + ("===== 全部校验通过 =====" if ok else "===== 存在问题，见上文 ====="))
sys.exit(0 if ok else 1)
