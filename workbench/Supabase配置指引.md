# Supabase 云端同步 · 配置指引（简化版）

工作台通过 Supabase 实现多设备云端同步（最后修改优先）。按下面步骤操作，全程约 5 分钟。
配置完成后，右上角同步徽标会从灰色「未配置」变绿色「已连接」。

> 已帮你做了两处省事设计：① 打开设置时**同步空间 ID 已自动生成**（可改）；② 点「测试连接」若发现没建表，会**自动展开指引并复制建表 SQL**，你直接去 Supabase 粘贴即可。

---

## 第 1 步：建 Supabase 项目

1. 打开 https://supabase.com ，用 GitHub 或邮箱注册/登录。
2. 右上角 **New project**。
3. 填写：Name 随意（如 `workbench-sync`）；Database Password 记牢；Region 选最近的（如 Singapore / Tokyo）。
4. 点 **Create new project**，等 1–2 分钟初始化。

---

## 第 2 步：建数据表（最关键，别漏）

1. 左侧菜单点 **SQL Editor** → **New query**。
2. 粘贴下面**整段** SQL，点 **Run**：

```sql
create table if not exists public.wb_kv (
  space      text        not null,
  k          text        not null,
  v          jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (space, k)
);

alter table public.wb_kv enable row level security;

drop policy if exists "wb_kv_anon_all" on public.wb_kv;
create policy "wb_kv_anon_all" on public.wb_kv
  for all to anon
  using (true) with check (true);

-- 若运行后仍报 PGRST125，再单独执行下面这句刷新缓存（一般不用）：
-- NOTIFY pgrst, 'reload schema';

-- 验证：返回 public.wb_kv 说明建表成功
select to_regclass('public.wb_kv');
```

3. 看到 `Success. No rows returned` 即成功。

> ⚠️ **最容易踩的坑（导致 PGRST125）**：
> - 建表 SQL **必须跑在「你第 4 步填的 Project URL 所属的那个项目」里**。你如果有两个 Supabase 项目，跑错一个就会报 `PGRST125 Invalid path`。
> - 若表已建好却仍报 PGRST125，去 SQL Editor 再执行上面的 `NOTIFY pgrst, 'reload schema';` 刷新 API 缓存即可。

---

## 第 3 步：拿 Project URL 和 anon key

1. 左侧 **Project Settings**（齿轮）→ **API**。
2. 复制两个值：
   - **Project URL**：形如 `https://xxxxxxxxxxxx.supabase.co`
   - **anon public key**：很长的 `eyJ...` 串

> 用 **anon** key（可公开，能放前端）。**绝不用 service_role** key（最高权限，不能暴露）。

---

## 第 4 步：在工作台填写并保存

1. 打开部署链接，点右上角同步徽标（显示「未配置云同步」），弹出配置框。
2. 填入：
   - **Project URL**：第 3 步复制的
   - **Anon Key**：第 3 步复制的
   - **同步空间 ID**：已自动生成，可改成你记得住的（**所有设备必须填相同 ID 才能互相同步**）
3. 点 **保存并连接**，1–2 秒后徽标变绿即成功。

> 配置存在本机浏览器，下次打开自动读取，无需重填。

---

## 第 5 步：验证

- 🟢 绿「已连接」：云端正常，改动自动推送
- 🔵 蓝「同步中」：正在上传/下载
- 🔴 红「未连接 · 仅本地」：连不上（断网/配置错），数据仅存本地，顶部有横幅提醒
- ⚪ 灰「未配置」：还没填

多设备测试：手机和电脑开同一链接、填同一组（URL / anon key / 空间 ID），一端加条日报，另一端约 8 秒后自动出现。冲突规则：最后修改优先。

---

## 排错表

| 现象 | 原因 | 解决 |
|---|---|---|
| `PGRST125 Invalid path` | 该项目里**没有 wb_kv 表**（建表跑错项目 / 缓存未刷新） | ① 确认建表 SQL 是在「填的 URL 所属项目」跑的；② 表已存在仍报错 → 执行 `NOTIFY pgrst, 'reload schema';`；③ 点「测试连接」会自动复制 SQL |
| `401 / Invalid API key` | anon key 错了或复制不全 | 重新从第 3 步复制 anon key，检查无空格 |
| `Failed to fetch` | URL 填错 / 网络不通 / 公司防火墙拦截 supabase.co | 核对 Project URL；换网络试试 |
| 徽标一直转圈/不连接 | 项目被 Supabase 暂停（长期未用） | 去 Supabase 控制台 Resume 该项目 |

**30 秒自检**（Mac 终端，换上你自己的地址和 key，不用发我）：
```bash
curl -s "https://你的ref.supabase.co/rest/v1/wb_kv?select=count&space=eq.guyi147258" \
  -H "apikey: 你的anonKey" -H "Authorization: Bearer 你的anonKey"
```
- 返回 `[{"count":0}]` → 表存在 ✓（还报错就刷缓存）
- 返回 `PGRST125` → 那个项目真没表（跑错项目了）

---

## 常见问题

**Q：换电脑/浏览器数据会丢吗？** 不会。填相同空间 ID 即从云端拉取。建议先在已填内容的设备完成一次同步，确保云端有数据。

**Q：只想单机用？** 完全可以不配云端，数据照常存本机（自动保存），只是不跨设备。

**Q：数据安全？** 数据在你自己的 Supabase 项目里，只有知道 anon key + 空间 ID 的人能读写。
