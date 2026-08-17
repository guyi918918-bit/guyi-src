// 回归测试：模拟「云同步把空数组 [] 写回 localStorage」导致检索入口链接库清零的场景，
// 验证 getArr 空数组回落到种子、列表能自愈恢复。
// 注：目标企业库(wb_target_orgs / data-win="targets")已在 V3.2 中删除，
// 相关断言于 2026-08-10 移除；此处仍写入该键以确保历史残留数据不会影响自愈逻辑。
import { JSDOM } from "jsdom";
import { readFileSync } from "fs";

const html = readFileSync(new URL("./dist/index.html", import.meta.url), "utf-8");

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log("  [OK] " + name); }
  else { fail++; console.log("  [FAIL] " + name); }
}

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  url: "http://localhost/",
  beforeParse(window) {
    // 关键：在应用脚本执行前，把一个空数组写进 localStorage，
    // 复现「云同步拉到空数组后本地被清空」的现场。
    try {
      window.localStorage.setItem("wb_target_orgs", "[]");
      window.localStorage.setItem("wb_intel_links", "[]");
    } catch (e) {}
  },
});
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = function () {
  return new Proxy({}, { get: () => () => {} });
};

window.addEventListener("load", () => {
  setTimeout(run, 400);
});

function run() {
  const d = window.document;
  const $ = (id) => d.getElementById(id);

  const tgtTab = d.querySelector('.top-tab[data-tab="dash"]');
  tgtTab.click();
  check("目标企业库子窗口已删除（不应再出现 targets 子标签）",
    d.querySelector('#dashSubBar .sub-tab[data-win="targets"]') === null);

  const linksWin = d.querySelector('#dashSubBar .sub-tab[data-win="links"]');
  linksWin.click();
  const nLinks = $("nLinks") ? parseInt($("nLinks").textContent, 10) : 0;
  check("空数组兜底：检索入口自愈恢复>0", nLinks > 0);

  console.log("\n===== 数据自愈回归测试: " + pass + " 通过 / " + fail + " 失败 =====");
  process.exit(fail ? 1 : 0);
}

setTimeout(() => { console.log("[TIMEOUT] 未触发 load"); process.exit(2); }, 8000);
