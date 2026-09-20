// 冒烟测试：用 jsdom 加载产物，确认驾驶舱渲染出真实卡片
import { JSDOM } from "jsdom";
import path from "path";
import { readFileSync } from "fs";

const file = path.resolve("dist/index.html");
const html = readFileSync(file, "utf-8");

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  resources: undefined,
  url: "https://example.com/",
  pretendToBeVisual: true,
});
const { window } = dom;

// 提供最小 fetch 桩，使 loadFeed 走 /feed.json 分支并回落种子
window.fetch = (u) => Promise.reject(new Error("no network in test: " + u));

let failed = 0;
function check(name, cond) {
  console.log((cond ? "  [OK] " : "  [FAIL] ") + name);
  if (!cond) failed++;
}

window.addEventListener("load", () => {
  setTimeout(() => {
    const d = window.document;
    check("panel-dash 存在", !!d.getElementById("panel-dash"));
    const gt = d.getElementById("gridTenders");
    const ga = d.getElementById("gridActs");
    const gi = d.getElementById("gridIns");
    check("招投标卡片已渲染(≥10)", gt && gt.querySelectorAll(".dash-card").length >= 10);
    check("活动案例卡片已渲染(≥4)", ga && ga.querySelectorAll(".dash-card").length >= 4);
    check("灵感卡片已渲染(≥4)", gi && gi.querySelectorAll(".dash-card").length >= 4);
    check("统计-招投标数=17", d.getElementById("statTenders").textContent === "17");
    check("统计-活动数=6", d.getElementById("statActs").textContent === "6");
    check("统计-灵感数=6", d.getElementById("statIns").textContent === "6");
    // 筛选：点“招投标”应隐藏活动/灵感区块
    const chips = d.getElementById("dashChips");
    const tenderChip = [...chips.querySelectorAll(".dash-chip")].find(c => c.dataset.f === "tender");
    tenderChip.click();
    const secs = d.querySelectorAll("#panel-dash .dash-section");
    check("筛选‘招投标’后活动区块隐藏", secs[1].style.display === "none");
    check("筛选‘招投标’后灵感区块隐藏", secs[2].style.display === "none");
    // 区域筛选：点“区县”
    const regionChip = [...chips.querySelectorAll(".dash-chip")].find(c => c.dataset.r === "区县");
    regionChip.click();
    const regionCards = gt.querySelectorAll(".dash-card");
    const allRegion = [...regionCards].every(c => /区县/.test(c.textContent));
    check("区域‘区县’筛选生效(卡片均含区县)", regionCards.length > 0 && allRegion);
    console.log(failed === 0 ? "\n===== 驾驶舱冒烟测试全部通过 =====" : "\n===== 有失败项 =====");
    process.exit(failed === 0 ? 0 : 1);
  }, 400);
});
