// 存储自维护策略回归测试：
// 1) 回收站超过上限时仅保留最近 N 条（更早的自动清理）
// 2) 日报超过 1 年自动「归档」到本地键 sport_daily_archive（移出云同步键，释放云空间）
import { JSDOM } from "jsdom";
import { readFileSync } from "fs";

const html = readFileSync(new URL("./dist/index.html", import.meta.url), "utf-8");
const dom = new JSDOM(html, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const { window } = dom;

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log("  [OK] " + name); }
  else { fail++; console.log("  [FAIL] " + name); }
}

function fmt(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

window.addEventListener("load", () => setTimeout(run, 500));

function run() {
  const DAY = 86400000;
  const keepDate = fmt(new Date(Date.now() - 30 * DAY));   // 近期日报：保留
  const oldDate = fmt(new Date(Date.now() - 400 * DAY));   // 超 1 年日报：应归档

  // 准备 305 条回收站记录（deletedAt 由新到旧），上限 300 应自动清理最早的 5 条
  const bin = [];
  const now = Date.now();
  for (let i = 0; i < 305; i++) {
    bin.push({ type: "daily", key: "r" + i, data: { date: "r" + i }, deletedAt: new Date(now - i * 1000).toISOString() });
  }
  window.localStorage.setItem("sport_recycle_bin", JSON.stringify(bin));

  // 准备日报：1 条超期 + 1 条近期
  const daily = [
    { dateRaw: oldDate, follow: "old" },
    { dateRaw: keepDate, follow: "new" }
  ];
  window.localStorage.setItem("sport_daily_list", JSON.stringify(daily));

  // 执行维护（手动触发，忽略每日节流）
  const res = window.runStorageMaintenance(true);
  console.log("  runStorageMaintenance ->", JSON.stringify(res));

  setTimeout(() => {
    // 1) 回收站裁剪
    const rec = JSON.parse(window.localStorage.getItem("sport_recycle_bin") || "[]");
    check("回收站裁剪到上限 300 条", rec.length === 300);
    check("回收站最早的 5 条已清理（r304 不在）", !rec.some((x) => x.key === "r304"));
    check("回收站最新的记录保留（r0 仍在）", rec.some((x) => x.key === "r0"));
    check("返回 removed=5", res.removed === 5);

    // 2) 日报归档
    const dl = JSON.parse(window.localStorage.getItem("sport_daily_list") || "[]");
    check("日报列表已移除超期项", dl.length === 1 && dl[0].dateRaw === keepDate);
    const arch = JSON.parse(window.localStorage.getItem("sport_daily_archive") || "[]");
    check("超期日报已归档到本地键", arch.length === 1 && arch[0].dateRaw === oldDate);
    check("返回 archived=1", res.archived === 1);

    // 3) 幂等：再次运行不应重复删除/归档
    const res2 = window.runStorageMaintenance(true);
    const rec2 = JSON.parse(window.localStorage.getItem("sport_recycle_bin") || "[]");
    const dl2 = JSON.parse(window.localStorage.getItem("sport_daily_list") || "[]");
    const arch2 = JSON.parse(window.localStorage.getItem("sport_daily_archive") || "[]");
    check("二次运行回收站仍为 300（幂等）", rec2.length === 300);
    check("二次运行日报仍仅 1 条（未重复归档）", dl2.length === 1);
    check("二次运行归档仍仅 1 条（未重复）", arch2.length === 1);

    console.log("\n===== 存储自维护回归测试: " + pass + " 通过 / " + fail + " 失败 =====");
    process.exit(fail ? 1 : 0);
  }, 300);
}
