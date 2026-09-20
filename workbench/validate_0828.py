import json
from datetime import datetime

REF = datetime(2026, 8, 28, 9, 11)  # naive 参考时间（与数据写入时一致）

def parse_date(s):
    """宽松解析日期：支持 2026-08-12 / 2026-08 / 2025 等，返回 datetime 或 None。"""
    s = (s or "").strip()
    for fmt in ("%Y-%m-%d", "%Y-%m", "%Y"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None

d = json.load(open("feed.json"))
tenders = d["tenders"]
cases = d["cases"]

# --- URL 复用检查 ---
def norm_title(t):
    return (t or "").replace(" ", "").replace("\u00a0", "").strip()

t_keys = {}
t_dup = []
for x in tenders:
    k = (x.get("url"), norm_title(x.get("title")))
    t_keys.setdefault(k, 0)
    t_keys[k] += 1
for k, n in t_keys.items():
    if n > 1:
        t_dup.append(k)

c_keys = {}
c_dup = []
for x in cases:
    k = (x.get("url"), norm_title(x.get("title")))
    c_keys.setdefault(k, 0)
    c_keys[k] += 1
for k, n in c_keys.items():
    if n > 1:
        c_dup.append(k)

print("tender url dups:", len(t_dup))
print("case url dups:", len(c_dup))
for k in c_dup:
    print("   case dup:", k[0], "|", k[1])

# --- 近 30 天窗口（naive 比较，避开时区问题）---
cut30 = datetime(REF.year, REF.month, REF.day) - __import__("datetime").timedelta(days=30)
cut90 = datetime(REF.year, REF.month, REF.day) - __import__("datetime").timedelta(days=90)

def within(x, cut):
    p = parse_date(x.get("date"))
    return p is not None and p >= cut

w30_t = [x for x in tenders if within(x, cut30)]
w90_t = [x for x in tenders if within(x, cut90)]
w30_c = [x for x in cases if within(x, cut30)]
w90_c = [x for x in cases if within(x, cut90)]

print("\n近30天 tenders:", len(w30_t), "/ 近90天 tenders:", len(w90_t))
print("近30天 cases:", len(w30_c), "/ 近90天 cases:", len(w90_c))

# --- 分布统计（仅近 30 天 tender）---
from collections import Counter
sector = Counter(x.get("sector", "未分类") for x in w30_t)
notice = Counter(x.get("notice", "未分类") for x in w30_t)
prov = Counter(x.get("province", x.get("area", "未知")) for x in w30_t)
print("\n[近30天 tender 板块分布]")
for k, v in sector.most_common():
    print(f"  {k}: {v}")
print("[近30天 tender 公告类型]")
for k, v in notice.most_common():
    print(f"  {k}: {v}")
print("[近30天 tender 省域]")
for k, v in prov.most_common():
    print(f"  {k}: {v}")

# --- 新写入条目定位（date 含 2026-08-2x）---
new_t = [x for x in tenders if (x.get("date") or "").startswith("2026-08-2")]
new_c = [x for x in cases if (x.get("date") or "").startswith("2026-08-2")]
print("\n本次窗口内(2026-08-2x) tenders:", len(new_t), " cases:", len(new_c))
