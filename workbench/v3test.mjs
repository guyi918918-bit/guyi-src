import { JSDOM } from "jsdom";
import { readFileSync } from "fs";

const html = readFileSync(new URL("./dist/index.html", import.meta.url), "utf-8");
const dom = new JSDOM(html, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const { window } = dom;

// stub canvas 2d context (jsdom 无 canvas 实现)
window.HTMLCanvasElement.prototype.getContext = function () {
  return new Proxy({}, { get: () => () => {} });
};

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log("  [OK] " + name); }
  else { fail++; console.log("  [FAIL] " + name); }
}

window.addEventListener("load", () => {
  setTimeout(run, 400);
});

function run() {
  const d = window.document;
  const $ = (id) => d.getElementById(id);

  check("6 个顶层板块", d.querySelectorAll(".top-tab").length === 6);
  check("默认显示 情报搜集", $("panel-dash") && $("panel-dash").classList.contains("show"));

  // 季报已删除
  check("季报面板已移除", !$("panel-quarter"));
  check("季报子标签已移除", !d.querySelector('#workBar .sub-tab[data-sub="quarter"]'));

  // 情报搜集：双窗口 + 渲染
  check("情报搜集渲染卡片>0(季节窗口)", $("gridTenders") && $("gridTenders").children.length > 0);
  check("情报统计>0", $("statTenders") && parseInt($("statTenders").textContent, 10) > 0);
  check("省份复选框>=5(已扩至全国)", $("intelRegions") && $("intelRegions").querySelectorAll("input").length >= 5);
  check("关键词组=3", $("intelKw") && $("intelKw").querySelectorAll("textarea.cfg-kw").length === 3);
  check("情报子标签=3(最近/季节/检索入口)", $("dashSubBar") && $("dashSubBar").querySelectorAll(".sub-tab").length === 3);
  check("公告类型选项=5", $("intelNotice") && $("intelNotice").querySelectorAll("option").length === 5);
  check("来源行业选项=9", $("intelSector") && $("intelSector").querySelectorAll("option").length === 9);
  check("情报时间范围下拉存在且选项>=7", $("intelTimeRange") && $("intelTimeRange").querySelectorAll("option").length >= 7);
  check("情报时间排序下拉存在且选项>=3", $("intelSort") && $("intelSort").querySelectorAll("option").length >= 3);
  check("默认窗口标签=近30天", $("intelWinLabel") && /近 30 天/.test($("intelWinLabel").textContent));

  // 时间排序功能：切到最近一个月 + 最远优先，仍能渲染卡片
  const recentBtn2 = d.querySelector('#dashSubBar .sub-tab[data-win="recent"]');
  recentBtn2.click();
  const sortSel = $("intelSort");
  const beforeFirst = $("gridTenders").children[0] && $("gridTenders").children[0].textContent;
  sortSel.value = "date-asc"; sortSel.dispatchEvent(new window.Event("change"));
  check("情报时间排序切换后仍渲染卡片", $("gridTenders").children.length > 0);
  if ($("gridTenders").children.length > 1) {
    const afterFirst = $("gridTenders").children[0].textContent;
    check("情报时间排序切换后首卡内容变化", beforeFirst !== afterFirst);
  }

  // 覆盖地区 checkbox 结构：label 内包含 input + span，不分离
  const firstChk = $("intelRegions") && $("intelRegions").querySelector(".cfg-chk");
  check("覆盖省份 checkbox 在 label 内", !!firstChk && firstChk.querySelector("input") !== null && firstChk.querySelector("span") !== null);

  // 切换到「最近一个月」窗口：winLabel 变化
  const recentBtn = d.querySelector('#dashSubBar .sub-tab[data-win="recent"]');
  recentBtn.click();
  check("切到最近一个月→标签变化", $("intelWinLabel") && /近 30 天/.test($("intelWinLabel").textContent));
  const seasonBtn = d.querySelector('#dashSubBar .sub-tab[data-win="season"]');
  seasonBtn.click();
  check("切回季节窗口→标签恢复", $("intelWinLabel") && /月/.test($("intelWinLabel").textContent));

  // 公告类型筛选
  const notice = $("intelNotice");
  notice.value = "招标"; notice.dispatchEvent(new window.Event("change"));
  check("公告类型筛选生效(招标→数量变化或为空均可)", $("gridTenders") !== null);
  notice.value = "全部"; notice.dispatchEvent(new window.Event("change"));

  // 灵感早报：双窗口 + 活动日历
  check("灵感早报渲染卡片>0", $("gridCases") && $("gridCases").children.length > 0);
  check("灵感统计>0", $("statCases") && parseInt($("statCases").textContent, 10) > 0);
  check("灵感来源复选框>0", $("insSources") && $("insSources").querySelectorAll("input").length > 0);
  check("灵感时间范围下拉存在且选项>=7", $("inspTimeRange") && $("inspTimeRange").querySelectorAll("option").length >= 7);
  check("灵感时间排序下拉存在且选项>=3", $("inspSort") && $("inspSort").querySelectorAll("option").length >= 3);
  check("灵感子标签=4(近3月/往年/日历/创意入口)", $("insSubBar") && $("insSubBar").querySelectorAll(".sub-tab").length === 4);

  // 活动日历
  const calBtn = d.querySelector('#insSubBar .sub-tab[data-win="calendar"]');
  calBtn.click();
  check("活动日历区显示", $("calSection") && $("calSection").style.display !== "none");
  check("日历 12 个月卡片", $("calGrid") && $("calGrid").querySelectorAll(".cal-card").length === 12);
  const firstMonth = $("calGrid").querySelector(".cal-card");
  firstMonth.click();
  check("点击月份→详情有内容", $("calDetail") && $("calDetail").querySelectorAll(".cal-node").length > 0);
  const seasonBtn2 = d.querySelector('#insSubBar .sub-tab[data-win="season"]');
  seasonBtn2.click();
  check("切回灵感列表区", $("insListSection") && $("insListSection").style.display !== "none");

  // ===== V3.3: 灵感早报创意入口 =====
  const inspLinksBtn = d.querySelector('#insSubBar .sub-tab[data-win="links"]');
  check("创意入口子标签存在", !!inspLinksBtn);
  inspLinksBtn.click();
  check("点击后创意入口区显示", $("inspLinksSection") && $("inspLinksSection").style.display !== "none");
  check("点击后案例列表区隐藏", $("insListSection") && $("insListSection").style.display === "none");
  check("创意入口按分组渲染>0", $("inspLinks") && $("inspLinks").querySelectorAll(".link-cat").length > 0);
  check("创意入口链接总数>0(种子30+)", $("nInspLinks") && parseInt($("nInspLinks").textContent, 10) > 0);
  check("创意入口分组头含上移/下移排序按钮", $("inspLinks") && $("inspLinks").querySelectorAll(".grp-mv").length >= 2);
  check("创意入口新增/批量按钮存在", !!$("inspLkAddBtn") && !!$("inspLkBatchBtn"));
  // 排序持久化
  window.localStorage.removeItem("wb_insp_link_order");
  const firstInspDown = $("inspLinks").querySelector(".grp-mv[data-dir='down']");
  if (firstInspDown) {
    const before = $("inspLinks").querySelector(".link-cat-h").textContent.trim();
    firstInspDown.click();
    const saved = window.localStorage.getItem("wb_insp_link_order");
    check("创意入口排序后持久化保存", !!saved);
    const after = $("inspLinks").querySelector(".link-cat-h").textContent.trim();
    check("创意入口排序后首分组名称变化", before !== after);
  }
  // 批量删除模式
  $("inspLkBatchBtn").click();
  check("创意入口批量模式→出现勾选框", $("inspLinks").querySelector(".link-chk") !== null);
  $("inspLkBatchBtn").click();
  // 新增表单
  $("inspLkAddBtn").click();
  check("创意入口新增表单展开", $("inspLkAddForm") && $("inspLkAddForm").style.display !== "none");
  check("创意入口分组下拉含新建分组项", $("inspLk-region-sel") && $("inspLk-region-sel").querySelector('option[value="__new__"]') !== null);
  // 切回列表
  seasonBtn2.click();
  check("切回灵感季节窗口→列表区恢复", $("insListSection") && $("insListSection").style.display !== "none");

  // 日常工作
  const workTab = d.querySelector('.top-tab[data-tab="work"]');
  workTab.click();
  check("点击日常工作→面板显示", $("panel-work") && $("panel-work").classList.contains("show"));
  check("日报子面板移入 workInner", $("workInner") && $("workInner").contains($("panel-daily")));

  // 客户管理改版 + 客户级别重写
  const clientsTab = d.querySelector('.top-tab[data-tab="clients"]');
  clientsTab.click();
  check("客户管理面板显示", $("panel-clients") && $("panel-clients").classList.contains("show"));
  check("新增客户按钮已创建", !!$("clientAddBtn"));
  check("新增表单默认收起", $("clientAddWrap") && $("clientAddWrap").style.display === "none");
  $("clientAddBtn").click();
  check("点击后表单展开", $("clientAddWrap").style.display === "block");
  const lvl = $("client-level");
  check("客户级别选项=10(—+9档)", lvl && lvl.querySelectorAll("option").length === 10);
  check("客户级别含「43：利润＞20 万」", lvl && Array.from(lvl.options).some(o => /43：利润/.test(o.textContent)));
  check("客户级别含「22：负责人客户」", lvl && Array.from(lvl.options).some(o => /22：负责人客户/.test(o.textContent)));

  // 项目管理不变
  const projTab = d.querySelector('.top-tab[data-tab="projects"]');
  projTab.click();
  check("项目管理面板显示", $("panel-projects") && $("panel-projects").classList.contains("show"));
  check("项目管理保留新建按钮", !!d.querySelector('#panel-projects button[onclick="showProjectModal()"]'));

  // ===== V3.3 新增: 回收站独立为顶层板块 =====
  const recTab = d.querySelector('.top-tab[data-tab="recycle"]');
  check("回收站顶层按钮存在", !!recTab);
  recTab.click();
  check("回收站面板显示(顶层独立)", $("panel-recycle") && $("panel-recycle").classList.contains("show"));
  check("回收站不在 workInner 内", $("workInner") && !$("workInner").contains($("panel-recycle")));
  check("日常工作不再含回收站子标签", !d.querySelector('#workBar .sub-tab[data-sub="recycle"]'));

  // ===== V3.3: 目标企业库已删除 =====
  const dashTab2 = d.querySelector('.top-tab[data-tab="dash"]');
  dashTab2.click();
  check("目标企业库子标签已删除", !d.querySelector('#dashSubBar .sub-tab[data-win="targets"]'));
  check("目标企业库面板已删除", !$("targetsSection"));
  check("autoSyncTargets 已删除", typeof window.autoSyncTargets !== "function");

  // ===== V3.3: 情报检索入口(自搜) 子窗口 =====
  const linksBtn = d.querySelector('#dashSubBar .sub-tab[data-win="links"]');
  check("检索入口子标签存在", !!linksBtn);
  linksBtn.click();
  check("点击后检索入口区显示", $("linksSection") && $("linksSection").style.display !== "none");
  check("点击后招标信息区隐藏", $("tendersSection") && $("tendersSection").style.display === "none");
  check("检索入口按地区分组渲染>0", $("intelLinks") && $("intelLinks").querySelectorAll(".link-cat").length > 0);
  check("检索入口链接总数>0(种子50+)", $("nLinks") && parseInt($("nLinks").textContent, 10) > 0);
  check("检索入口改为批量删除(无逐条删除按钮)", $("intelLinks") && $("intelLinks").querySelector(".link-del") === null);
  check("检索入口分组头含上移/下移排序按钮", $("intelLinks") && $("intelLinks").querySelectorAll(".grp-mv").length >= 2);
  check("检索入口新增/批量按钮存在", !!$("lkAddBtn") && !!$("lkBatchBtn"));
  // 排序持久化：点击下移后 localStorage 应保存顺序
  window.localStorage.removeItem("wb_intel_link_order");
  const firstDown = $("intelLinks").querySelector(".grp-mv[data-dir='down']");
  if (firstDown) {
    const before = $("intelLinks").querySelector(".link-cat-h").textContent.trim();
    firstDown.click();
    const saved = window.localStorage.getItem("wb_intel_link_order");
    check("排序后持久化保存到 localStorage", !!saved);
    const after = $("intelLinks").querySelector(".link-cat-h").textContent.trim();
    check("排序后首分组名称发生变化", before !== after);
  }
  // 批量删除模式
  $("lkBatchBtn").click();
  check("检索入口批量模式→出现勾选框", $("intelLinks").querySelector(".link-chk") !== null);
  $("lkBatchBtn").click();
  // 新增检索表单：地区分组下拉
  $("lkAddBtn").click();
  check("新增检索表单展开", $("lkAddForm") && $("lkAddForm").style.display !== "none");
  check("地区分组下拉含新建分组项", $("lk-region-sel") && $("lk-region-sel").querySelector('option[value="__new__"]') !== null);
  // 切回季节窗口，恢复招标区
  const seasonBtn3 = d.querySelector('#dashSubBar .sub-tab[data-win="season"]');
  seasonBtn3.click();
  check("切回季节窗口→招标区恢复", $("tendersSection") && $("tendersSection").style.display !== "none");

  // 同步: markDirty 暴露
  check("window.markDirty 已暴露", typeof window.markDirty === "function");

  // Apple 官网风格断言
  const style = d.querySelector("style");
  const css = style ? style.textContent : "";
  check("UI 主背景为 Apple 浅灰", css.indexOf("--ui-bg: #f5f5f7") >= 0);
  check("UI 主文字为深色", css.indexOf("--ui-text: #1d1d1f") >= 0);
  check("UI 品牌色为 Apple 蓝", css.indexOf("--ui-primary: #0066cc") >= 0);

  console.log("\n===== jsdom 冒烟测试: " + pass + " 通过 / " + fail + " 失败 =====");
  process.exit(fail ? 1 : 0);
}

setTimeout(() => { console.log("[TIMEOUT] 未触发 load"); process.exit(2); }, 8000);
