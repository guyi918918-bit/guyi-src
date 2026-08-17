/* ===== 工作台 V3.2：五大板块导航 + 情报搜集/灵感早报双窗口 + 活动日历 + 日常工作二级架构 + 客户管理改版 ===== */
(function () {
  "use strict";
  var SEED = window.__SEED_FEED__ || { tenders: [], cases: [], config: {}, updatedAt: "" };
  var FEED = SEED;
  var POLL_MS = 60000;
  var TOP = ["dash", "inspire", "work", "projects", "clients", "recycle"];
  var WORK_SUBS = ["daily", "weekly", "monthly", "annual", "stat", "history"];
  var currentSub = null;

  var intelCfg = loadCfg("wb_intel_cfg", SEED.config && SEED.config.intel);
  var inspireCfg = loadCfg("wb_insp_cfg", SEED.config && SEED.config.inspire);

  // ---- 双窗口 / 筛选状态 ----
  var intelWin = "recent";      // recent(近1月) | season(往年同时段) | links(检索入口自搜)
  var inspWin = "recent";       // recent(近3月) | season(往年同时段) | calendar(活动日历) | links(创意入口)
  var intelNotice = "全部";
  var intelSector = "全部";
  var intelProv = "all";
  var intelTimeRange = "default"; // default | 7d | 30d | 90d | 180d | 1y | all
  var intelSort = "date-desc";    // default | date-desc | date-asc

  var inspTimeRange = "default";  // default | 7d | 30d | 90d | 180d | 1y | all
  var inspSort = "date-desc";     // default | date-desc | date-asc

  var CLIENT_LEVELS = [
    "43：利润＞20 万",
    "42：利润 10 万–20 万",
    "41：利润 5 万–10 万",
    "40：利润 5 万以下",
    "34：危机客户",
    "33：两年以上未成交老客户",
    "32：需求客户",
    "31：手微客户",
    "22：负责人客户（仅有座机、登记负责人姓名）"
  ];

  /* ===== 工具 ===== */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function highlight(text, query) {
    if (!query || !text) return esc(text);
    var q = esc(query).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var re = new RegExp("(" + q + ")", "gi");
    return esc(text).replace(re, '<mark class="hl">$1</mark>');
  }
  function cardHL(text, q) {
    if (!q) return esc(text);
    return highlight(text, q);
  }
  function clearFilters(type) {
    if (type === "intel") {
      intelNotice = "全部"; intelSector = "全部"; intelProv = "all"; intelTimeRange = "default"; intelSort = "date-desc";
      $("intelNotice").value = "全部"; $("intelSector").value = "全部"; $("intelTimeRange").value = "default"; $("intelSort").value = "date-desc";
      d.querySelectorAll('#dashChips .dash-chip').forEach(function (c) { c.classList.toggle("active", c.dataset.r === "all"); });
      intelCfg.search = ""; $("intelSearch").value = "";
      renderIntel();
    } else {
      inspTimeRange = "default"; inspSort = "date-desc";
      $("inspTimeRange").value = "default"; $("inspSort").value = "date-desc";
      inspireCfg.search = ""; $("insSearch").value = "";
      renderInspire();
    }
  }
  function emptyState(type) {
    var msg = type === "intel"
      ? "该筛选下暂无招投标情报。试试清除筛选，或放宽时间范围 / 省份 / 关键词。"
      : "该筛选下暂无案例。试试清除筛选，或放宽时间范围 / 地区 / 来源 / 关键词。";
    return '<div class="dash-empty">' + msg + '<br><button class="dash-btn" onclick="window.clearWbFilters(\'' + type + '\')" style="margin-top:12px;">清除筛选</button></div>';
  }
  window.clearWbFilters = clearFilters;
  function $(id) { return document.getElementById(id); }
  function fmtTime(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d)) return iso;
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  function toast(msg) {
    var w = $("wbToastWrap");
    if (!w) {
      w = document.createElement("div");
      w.id = "wbToastWrap";
      w.style.cssText = "position:fixed;left:50%;top:24px;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:8px;";
      document.body.appendChild(w);
    }
    var t = document.createElement("div");
    t.textContent = msg;
    t.style.cssText = "background:rgba(29,29,31,.92);color:#fff;padding:10px 18px;border-radius:12px;font-size:13px;box-shadow:0 8px 28px rgba(0,0,0,.15);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);";
    w.appendChild(t);
    setTimeout(function () { t.style.opacity = "0"; t.style.transition = "opacity .4s"; setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 400); }, 1800);
  }
  window.toast = toast;
  function syncThemeBtn() {
    var b = document.querySelector(".theme-toggle");
    if (b) b.textContent = document.body.classList.contains("dark-mode") ? "☀️ 亮色" : "🌓 暗色";
  }
  window.syncThemeBtn = syncThemeBtn;

  function loadCfg(key, def) {
    try {
      var s = localStorage.getItem(key);
      if (s) return JSON.parse(s);
    } catch (e) {}
    return JSON.parse(JSON.stringify(def || {}));
  }
  function saveCfg(key, cfg) { try { localStorage.setItem(key, JSON.stringify(cfg)); } catch (e) {} }

  /* ===== 日期 / 季节窗口 ===== */
  function parseMonth(s) {
    if (!s) return 0;
    var m = String(s).match(/(\d{4})[-/](\d{1,2})/);
    if (m) return parseInt(m[2], 10);
    return 0; // 仅年份或无法解析 -> 未知月份
  }
  function isRecent(s, days) {
    if (!s) return false;
    var d = new Date(String(s).replace(/-/g, "/"));
    if (isNaN(d)) return false;
    var diff = (new Date() - d) / 86400000;
    return diff >= 0 && diff <= days;
  }
  function withinDays(s, range) {
    if (!s) return false;
    var map = { "7d": 7, "30d": 30, "90d": 90, "180d": 180, "1y": 365, "all": -1 };
    var days = map[range] || 30;
    if (days < 0) return true;
    var d = new Date(String(s).replace(/-/g, "/"));
    if (isNaN(d)) return false;
    var diff = (new Date() - d) / 86400000;
    return diff >= 0 && diff <= days;
  }
  function sortByDate(list, dir) {
    if (!dir || dir === "default") return list;
    return list.slice().sort(function (a, b) {
      var x = (a.date || "").localeCompare(b.date || "");
      return dir === "date-asc" ? x : -x;
    });
  }
  function seasonMonths(offsetStart, span) {
    var m = new Date().getMonth() + 1; // 1-12
    var out = [];
    for (var i = offsetStart; i < offsetStart + span; i++) {
      out.push(((m + i - 1) % 12 + 12) % 12 + 1);
    }
    return out;
  }
  function intelSeason() { return seasonMonths(-3, 7); }   // 当前月 ±3 个月（同日同时段）
  function inspSeason() { return seasonMonths(-3, 7); }    // 当前月 ±3 个月（同日同时段）

  /* ===== 配置 UI ===== */
  function buildChecks(container, values, selected, onToggle) {
    container.innerHTML = "";
    values.forEach(function (v) {
      var lab = document.createElement("label");
      lab.className = "cfg-chk" + (selected.indexOf(v) >= 0 ? " on" : "");
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = v;
      cb.checked = selected.indexOf(v) >= 0;
      cb.addEventListener("change", function () {
        if (cb.checked) { if (selected.indexOf(v) < 0) selected.push(v); lab.classList.add("on"); }
        else { selected = selected.filter(function (x) { return x !== v; }); lab.classList.remove("on"); }
        onToggle(selected);
      });
      var span = document.createElement("span");
      span.textContent = v;
      lab.appendChild(cb);
      lab.appendChild(span);
      container.appendChild(lab);
    });
  }
  function buildKeywordGroups(container, keywordsObj, cfg) {
    container.innerHTML = "";
    Object.keys(keywordsObj || {}).forEach(function (group) {
      var box = document.createElement("div");
      box.className = "cfg-group";
      var b = document.createElement("b"); b.textContent = group; box.appendChild(b);
      var ta = document.createElement("textarea");
      ta.className = "cfg-kw";
      var arr = (cfg && cfg.keywords && cfg.keywords[group]) || keywordsObj[group] || [];
      ta.value = arr.join("、");
      ta.dataset.group = group;
      box.appendChild(ta);
      container.appendChild(box);
    });
  }
  function gatherKeywords(container) {
    var out = {};
    container.querySelectorAll("textarea.cfg-kw").forEach(function (ta) {
      var arr = ta.value.split(/[、,，\s]+/).map(function (s) { return s.trim(); }).filter(Boolean);
      out[ta.dataset.group] = arr;
    });
    return out;
  }

  function setupIntelConfig() {
    var regions = (SEED.config && SEED.config.intel && SEED.config.intel.regions) || ["四川", "云南", "贵州", "重庆", "陕西"];
    if (!intelCfg.regions) intelCfg.regions = regions.slice();
    if (intelCfg.search === undefined) intelCfg.search = "";
    buildChecks($("intelRegions"), regions, intelCfg.regions, function (sel) { intelCfg.regions = sel; renderIntel(); });
    buildKeywordGroups($("intelKw"), (SEED.config && SEED.config.intel && SEED.config.intel.keywords) || {}, intelCfg);
    $("intelSearch").value = intelCfg.search || "";
    $("intelSearch").addEventListener("input", function () { intelCfg.search = this.value.trim(); renderIntel(); });
    $("intelCfgToggle").addEventListener("click", function () {
      var b = $("intelCfgBox"); b.style.display = b.style.display === "none" ? "block" : "none";
    });
    $("intelSave").addEventListener("click", function () {
      intelCfg.keywords = gatherKeywords($("intelKw"));
      saveCfg("wb_intel_cfg", intelCfg);
      $("intelSaved").textContent = "已保存 ✓";
      setTimeout(function () { $("intelSaved").textContent = ""; }, 2000);
      renderIntel();
    });
  }
  function setupInspireConfig() {
    var regions = (SEED.config && SEED.config.inspire && SEED.config.inspire.regions) || ["四川", "云南", "贵州", "重庆", "陕西", "北京", "上海", "广东", "江苏", "湖南", "其他"];
    var sources = (SEED.config && SEED.config.inspire && SEED.config.inspire.sources) || ["花瓣网", "活动方案网", "小红书", "微信公众号", "抖音", "官网", "今日头条"];
    if (!inspireCfg.regions) inspireCfg.regions = regions.slice();
    if (!inspireCfg.sources) inspireCfg.sources = sources.slice();
    if (inspireCfg.search === undefined) inspireCfg.search = "";
    buildChecks($("insRegions"), regions, inspireCfg.regions, function (sel) { inspireCfg.regions = sel; renderInspire(); });
    buildChecks($("insSources"), sources, inspireCfg.sources, function (sel) { inspireCfg.sources = sel; renderInspire(); });
    $("insSearch").value = inspireCfg.search || "";
    $("insSearch").addEventListener("input", function () { inspireCfg.search = this.value.trim(); renderInspire(); });
    $("insCfgToggle").addEventListener("click", function () {
      var b = $("insCfgBox"); b.style.display = b.style.display === "none" ? "block" : "none";
    });
    $("insSave").addEventListener("click", function () {
      saveCfg("wb_insp_cfg", inspireCfg);
      $("insSaved").textContent = "已保存 ✓";
      setTimeout(function () { $("insSaved").textContent = ""; }, 2000);
      renderInspire();
    });
  }

  /* ===== 筛选 ===== */
  function matchIntel(t) {
    if (intelCfg.regions && intelCfg.regions.length && intelCfg.regions.indexOf(t.province) < 0) return false;
    if (intelProv !== "all" && t.province !== intelProv) return false;
    if (intelNotice !== "全部" && (t.notice || "") !== intelNotice) return false;
    if (intelSector !== "全部" && (t.sector || "") !== intelSector) return false;
    if (intelCfg.search) {
      var s = intelCfg.search.toLowerCase();
      var hay = (String(t.title || "") + " " + String(t.buyer || "") + " " + String(t.type || "") + " " + String(t.learn || "") + " " + String(t.area || "") + " " + String(t.sector || "")).toLowerCase();
      if (hay.indexOf(s) < 0) return false;
    }
    if (intelTimeRange !== "default") {
      if (intelTimeRange === "all") {
        // 不限制时间
      } else if (!withinDays(t.date, intelTimeRange)) {
        return false;
      }
    } else if (intelWin === "recent") {
      if (!isRecent(t.date, 30)) return false;
    } else {
      var dm = parseMonth(t.date);
      if (dm === 0 || intelSeason().indexOf(dm) < 0) return false;
    }
    return true;
  }
  function matchInspire(c) {
    if (inspireCfg.regions && inspireCfg.regions.length && inspireCfg.regions.indexOf(c.province) < 0) return false;
    if (inspireCfg.sources && inspireCfg.sources.length) {
      var hit = inspireCfg.sources.some(function (s) { return (c.source || "").indexOf(s) >= 0; });
      if (!hit) return false;
    }
    if (inspireCfg.search) {
      var s = inspireCfg.search.toLowerCase();
      var hay = (String(c.title || "") + " " + String(c.host || "") + " " + String(c.type || "") + " " + String(c.highlight || "") + " " + String(c.learn || "")).toLowerCase();
      if (hay.indexOf(s) < 0) return false;
    }
    if (inspTimeRange !== "default") {
      if (inspTimeRange === "all") {
        // 不限制时间
      } else if (!withinDays(c.date, inspTimeRange)) {
        return false;
      }
    } else if (inspWin === "recent") {
      if (!isRecent(c.date, 90)) return false;
    } else if (inspWin === "season") {
      if (isRecent(c.date, 90)) return false;          // 近 3 月不算"往年"
      var dm = parseMonth(c.date);
      if (dm !== 0 && inspSeason().indexOf(dm) < 0) return false; // 未知月份归入档案
    }
    return true;
  }

  function tenderCard(t) {
    return '<div class="dash-card">' +
      '<h4>' + cardHL(t.title, intelCfg.search) + '</h4>' +
      '<div class="dash-badges"><span class="dash-badge prov">' + esc(t.province) + '</span><span class="dash-badge area">' + esc(t.area) + '</span><span class="dash-badge">' + esc(t.type) + '</span><span class="dash-badge">' + esc(t.notice || "") + '</span><span class="dash-badge src">' + esc(t.sector || "") + '</span></div>' +
      '<div class="row"><b>采购人：</b>' + cardHL(t.buyer, intelCfg.search) + '</div>' +
      '<div class="row"><b>中标金额：</b><span class="dash-amt">' + esc(t.amount) + '</span></div>' +
      '<div class="row"><b>中标方：</b>' + esc(t.winner) + '</div>' +
      '<div class="row"><b>发布：</b>' + esc(t.date) + '</div>' +
      '<div class="dash-learn"><b>可借鉴：</b>' + cardHL(t.learn, intelCfg.search) + '</div>' +
      '<a class="dash-link" href="' + esc(t.url) + '" target="_blank" rel="noopener">查看公告 / 原文 ↗</a>' +
      '</div>';
  }
  function caseCard(c) {
    return '<div class="dash-card">' +
      '<h4>' + cardHL(c.title, inspireCfg.search) + '</h4>' +
      '<div class="dash-badges"><span class="dash-badge prov">' + esc(c.province) + '</span><span class="dash-badge src">' + esc(c.source) + '</span><span class="dash-badge">' + esc(c.type) + '</span></div>' +
      '<div class="row"><b>主办：</b>' + cardHL(c.host, inspireCfg.search) + '</div>' +
      '<div class="row"><b>时间：</b>' + esc(c.date) + '</div>' +
      '<div class="dash-learn"><b>亮点：</b>' + cardHL(c.highlight, inspireCfg.search) + '</div>' +
      '<div class="dash-learn"><b>可学 / 可复制：</b>' + cardHL(c.learn, inspireCfg.search) + '</div>' +
      '<a class="dash-link" href="' + esc(c.url) + '" target="_blank" rel="noopener">查看案例 ↗</a>' +
      '</div>';
  }

  function renderIntel() {
    // 招标专属区（检索设置框 / 统计 / 筛选 / 列表）仅在「招标信息」窗口显示
    function hideChrome() {
      ["intelCfgWrap", "dashStats", "dashFilters", "tendersSection"].forEach(function (id) {
        var e = $(id); if (e) e.style.display = "none";
      });
    }
    function showChrome() {
      ["intelCfgWrap", "dashStats", "dashFilters", "tendersSection"].forEach(function (id) {
        var e = $(id); if (e) e.style.display = "";
      });
    }
    if (intelWin === "links") {
      hideChrome();
      var ls = $("linksSection"); if (ls) ls.style.display = "block";
      if (window.renderIntelLinks) window.renderIntelLinks();
      return;
    }
    showChrome();
    var lsx = $("linksSection"); if (lsx) lsx.style.display = "none";
    var list = sortByDate((FEED.tenders || []).filter(matchIntel), intelSort);
    var notice = "";
    if (!list.length && intelWin === "recent" && intelTimeRange === "default") {
      list = sortByDate((FEED.tenders || []).slice(), intelSort).slice(0, 12);
      notice = '<div class="dash-note">近 30 天该筛选暂无新标，已为你展示库中最新 12 条招投标情报（可切换「季节窗口」查看往年同时段）。</div>';
    }
    $("gridTenders").innerHTML = notice + (list.length ? list.map(tenderCard).join("") : '<div class="dash-empty">该筛选下暂无招投标情报，调整地区/关键词/窗口试试</div>');
    $("nTenders").textContent = list.length;
    $("statTenders").textContent = list.length;
    var provs = {}; list.forEach(function (t) { provs[t.province] = 1; });
    $("statProv").textContent = Object.keys(provs).length;
    var groups = intelCfg.keywords || (SEED.config.intel && SEED.config.intel.keywords) || {};
    var gcount = Object.keys(groups).filter(function (k) { return (groups[k] || []).length; }).length;
    $("statNew").textContent = gcount;
    var lbl = intelWin === "recent" ? "近 30 天" : ("季节窗口 " + intelSeason().join("/") + " 月");
    if ($("intelWinLabel")) $("intelWinLabel").textContent = lbl;
  }
  function renderInspire() {
    if (inspWin === "calendar") {
      if ($("insListSection")) $("insListSection").style.display = "none";
      if ($("inspLinksSection")) $("inspLinksSection").style.display = "none";
      if ($("calSection")) $("calSection").style.display = "block";
      renderCalendar();
      return;
    }
    if (inspWin === "links") {
      if ($("insListSection")) $("insListSection").style.display = "none";
      if ($("calSection")) $("calSection").style.display = "none";
      if ($("inspLinksSection")) $("inspLinksSection").style.display = "block";
      if (window.renderInspireLinks) window.renderInspireLinks();
      return;
    }
    if ($("insListSection")) $("insListSection").style.display = "block";
    if ($("calSection")) $("calSection").style.display = "none";
    if ($("inspLinksSection")) $("inspLinksSection").style.display = "none";
    var list = sortByDate((FEED.cases || []).filter(matchInspire), inspSort);
    var notice = "";
    if (!list.length && inspWin === "recent" && inspTimeRange === "default") {
      list = sortByDate((FEED.cases || []).slice(), inspSort).slice(0, 12);
      notice = '<div class="dash-note">近 90 天该筛选暂无案例，已为你展示库中最新 12 个活动案例（可切换「季节窗口」查看往年同时段）。</div>';
    }
    $("gridCases").innerHTML = notice + (list.length ? list.map(caseCard).join("") : emptyState("inspire"));
    $("nCases").textContent = list.length;
    $("statCases").textContent = list.length;
    var srcs = {}, provs = {};
    list.forEach(function (c) { srcs[c.source] = 1; provs[c.province] = 1; });
    $("statSrc").textContent = Object.keys(srcs).length;
    $("statProv2").textContent = Object.keys(provs).length;
    var lbl = inspWin === "recent" ? "近 90 天" : ("季节窗口 " + inspSeason().join("/") + " 月");
    if ($("insWinLabel")) $("insWinLabel").textContent = lbl;
  }

  /* ===== 活动日历（固定策划参考） ===== */
  var CALENDAR = [
    { m: 1, name: "1月", nodes: [
      { d: "1.1", n: "元旦", ind: "全行业", act: "新年开门红、年度启动会", tip: "月初即可启动年度规划类活动" },
      { d: "腊八", n: "腊八节", ind: "文化", act: "暖粥派送、社区关爱", tip: "" },
      { d: "春节前", n: "春节前游园会", ind: "工会/社区", act: "游园会、写春联、送温暖慰问", tip: "务必提前 1 个月对接场地与物料" }
    ] },
    { m: 2, name: "2月", nodes: [
      { d: "春节", n: "春节", ind: "工会/社区", act: "团圆宴、暖心慰问、留守关爱", tip: "" },
      { d: "元宵", n: "元宵节", ind: "文化", act: "灯会、猜灯谜、汤圆会", tip: "" },
      { d: "开工", n: "开工日", ind: "企业", act: "开工仪式、开门红团建", tip: "节后首周是团建黄金期" }
    ] },
    { m: 3, name: "3月", nodes: [
      { d: "3.8", n: "三八妇女节", ind: "工会/女工", act: "女职工插花、瑜伽、沙龙、关爱礼包", tip: "提前 2 周备货礼包" },
      { d: "3.12", n: "植树节", ind: "户外/环保", act: "户外植树、生态团建", tip: "" },
      { d: "3.15", n: "消费者权益日", ind: "金融/消费", act: "诚信主题、客户回馈", tip: "" }
    ] },
    { m: 4, name: "4月", nodes: [
      { d: "清明", n: "清明节", ind: "文化", act: "踏青、缅怀、春游", tip: "" },
      { d: "4.7", n: "世界卫生日", ind: "医疗", act: "健康义诊、养生讲座", tip: "" },
      { d: "4.23", n: "世界读书日", ind: "工会/教育", act: "职工书屋、阅读分享", tip: "" }
    ] },
    { m: 5, name: "5月", nodes: [
      { d: "5.1", n: "劳动节", ind: "工会", act: "表彰大会、趣味运动会、技能大赛", tip: "五一前后是职工活动最高峰" },
      { d: "5.4", n: "青年节", ind: "团委/青年", act: "青年联谊、拓展", tip: "" },
      { d: "5.12", n: "护士节", ind: "医疗", act: "致敬医护、关怀活动", tip: "" },
      { d: "母亲节", n: "母亲节", ind: "全行业", act: "亲子、感恩活动", tip: "" }
    ] },
    { m: 6, name: "6月", nodes: [
      { d: "6.1", n: "儿童节", ind: "工会/职工子女", act: "亲子嘉年华、职工子女开放日", tip: "" },
      { d: "6月", n: "安全生产月", ind: "全行业", act: "技能大赛、应急演练、安全知识竞赛", tip: "全行业必办，提前对接安监部门" },
      { d: "端午", n: "端午节", ind: "文化", act: "划龙舟、包粽子、安康慰问", tip: "" },
      { d: "6月", n: "父亲节", ind: "全行业", act: "父爱主题、亲子", tip: "" }
    ] },
    { m: 7, name: "7月", nodes: [
      { d: "7.1", n: "建党节", ind: "党建", act: "红歌赛、党史学习、主题党日", tip: "党建活动集中月" },
      { d: "暑期", n: "职工子女暑期托管", ind: "工会", act: "夏令营、托管班、研学", tip: "" }
    ] },
    { m: 8, name: "8月", nodes: [
      { d: "8.1", n: "建军节", ind: "军民/国企", act: "拥军慰问、军民共建", tip: "" },
      { d: "8.8", n: "全民健身日", ind: "工会/体育", act: "趣味运动会、健步走", tip: "" },
      { d: "8.19", n: "医师节", ind: "医疗", act: "致敬医师、健康义诊", tip: "医疗行业重点节点" },
      { d: "七夕", n: "七夕联谊", ind: "工会/单身", act: "单身青年联谊、交友派对", tip: "农历七月初七约在 8 月，提前 1 月策划" }
    ] },
    { m: 9, name: "9月", nodes: [
      { d: "9.10", n: "教师节", ind: "教育", act: "尊师活动、教职工团建", tip: "" },
      { d: "9月", n: "质量月", ind: "制造/国企", act: "质量技能比武", tip: "" },
      { d: "中秋", n: "中秋节", ind: "工会/文化", act: "游园、赏月、月饼礼、慰问", tip: "农历八月十五约在 9 月" },
      { d: "9.23", n: "中国农民丰收节", ind: "农业/国企", act: "丰收庆典、助农", tip: "" }
    ] },
    { m: 10, name: "10月", nodes: [
      { d: "10.1", n: "国庆节", ind: "工会/爱国", act: "爱国主题、趣味赛、文艺汇演", tip: "" },
      { d: "重阳", n: "重阳节", ind: "养老/社区", act: "敬老登高、关爱老人", tip: "农历九月初九约在 10 月" }
    ] },
    { m: 11, name: "11月", nodes: [
      { d: "11.8", n: "记者节", ind: "媒体", act: "媒体联谊、行业交流", tip: "" },
      { d: "11.9", n: "消防宣传日", ind: "全行业", act: "消防演练、安全培训", tip: "" },
      { d: "双11", n: "电商购物节", ind: "零售/营销", act: "营销活动、直播", tip: "" }
    ] },
    { m: 12, name: "12月", nodes: [
      { d: "12.4", n: "国家宪法日", ind: "机关/国企", act: "普法宣传", tip: "" },
      { d: "12.13", n: "国家公祭日", ind: "机关", act: "缅怀纪念", tip: "" },
      { d: "年末", n: "年终表彰 / 年会", ind: "全行业", act: "年会、表彰、答谢", tip: "11 月就要启动策划与场地" },
      { d: "冬至", n: "冬至", ind: "文化", act: "包饺子、团圆", tip: "" }
    ] }
  ];
  function renderCalendar() {
    var grid = $("calGrid"); if (!grid) return;
    var season = inspSeason();
    grid.innerHTML = CALENDAR.map(function (mo) {
      var star = season.indexOf(mo.m) >= 0 ? '<span class="star">⭐</span>' : "";
      var chips = mo.nodes.slice(0, 3).map(function (n) { return '<span class="cal-chip">' + esc(n.n) + "</span>"; }).join("");
      return '<div class="cal-card" data-m="' + mo.m + '"><div class="cal-month">' + mo.name + star + '</div><div class="cal-chips">' + chips + "</div></div>";
    }).join("");
    grid.querySelectorAll(".cal-card").forEach(function (card) {
      card.addEventListener("click", function () {
        grid.querySelectorAll(".cal-card").forEach(function (x) { x.classList.remove("active"); });
        card.classList.add("active");
        var mo = CALENDAR[parseInt(card.dataset.m, 10) - 1];
        $("calDetail").innerHTML = "<h4>" + mo.name + " 活动节点（共 " + mo.nodes.length + " 项）</h4>" + mo.nodes.map(function (n) {
          return '<div class="cal-node"><div><span class="nd-date">' + esc(n.d) + '</span><span class="nd-ind">' + esc(n.ind) + "</span> " + esc(n.n) + "</div>" +
            (n.act ? '<div class="nd-act">建议活动：' + esc(n.act) + "</div>" : "") +
            (n.tip ? '<div class="nd-tip">💡 ' + esc(n.tip) + "</div>" : "") + "</div>";
        }).join("");
      });
    });
  }

  /* ===== 客户管理：新增按钮 + 客户级别重写 ===== */
  function restructureClients() {
    var panel = $("panel-clients"); if (!panel) return;
    var rows = Array.prototype.slice.call(panel.children).filter(function (c) { return c.classList && c.classList.contains("form-row"); });
    if (!rows.length) return;
    var wrap = document.createElement("div");
    wrap.id = "clientAddWrap";
    rows.forEach(function (r) { wrap.appendChild(r); });
    var btn = document.createElement("button");
    btn.className = "btn-primary"; btn.id = "clientAddBtn"; btn.textContent = "➕ 新增客户"; btn.style.marginBottom = "12px";
    var listContainer = panel.querySelector("#client-list-container");
    if (listContainer) { panel.insertBefore(btn, listContainer); panel.insertBefore(wrap, listContainer); }
    else { panel.appendChild(btn); panel.appendChild(wrap); }
    wrap.style.display = "none";
    btn.addEventListener("click", function () {
      var open = wrap.style.display === "none";
      wrap.style.display = open ? "block" : "none";
      btn.textContent = open ? "✕ 收起" : "➕ 新增客户";
      if (open) {
        var ab = panel.querySelector('button[onclick="addClient()"]');
        if (ab) ab.addEventListener("click", function () {
          setTimeout(function () { wrap.style.display = "none"; btn.textContent = "➕ 新增客户"; }, 500);
        });
      }
    });
  }
  function setupClientLevels() {
    CLIENT_LEVELS.forEach(function (lv) { /* noop, 仅保留引用 */ });
    ["client-level", "edit-client-level"].forEach(function (id) {
      var sel = $(id); if (!sel) return;
      sel.innerHTML = '<option value="">—</option>' + CLIENT_LEVELS.map(function (l) {
        return '<option value="' + esc(l) + '">' + esc(l) + "</option>";
      }).join("");
    });
  }

  /* ===== 双窗口子导航 ===== */
  function bindSubBar(barId, setter, render) {
    var bar = $(barId); if (!bar) return;
    bar.addEventListener("click", function (e) {
      var b = e.target.closest(".sub-tab"); if (!b) return;
      bar.querySelectorAll(".sub-tab").forEach(function (x) { x.classList.remove("active"); });
      b.classList.add("active");
      setter(b.dataset.win);
      render();
    });
  }

  /* ===== 数据加载 ===== */
  function setUpdated(feed) {
    var t = fmtTime(feed.updatedAt);
    var label = "内置情报（系统每日更新）· " + t;
    if ($("dashUpdated")) $("dashUpdated").textContent = label;
    if ($("insUpdated")) $("insUpdated").textContent = label;
  }
  function applyFeed(feed) {
    if (feed && (feed.tenders || feed.cases)) {
      FEED = feed;
      window.__WB_FEED__ = FEED;
      setUpdated(FEED);
      renderIntel();
      renderInspire();
    }
  }
  function loadAll() {
    if (typeof fetch !== "function") { applyFeed(SEED); return; }
    fetch("/feed.json", { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (j) { applyFeed(j); })
      .catch(function () { applyFeed(SEED); });
  }

  /* ===== 导航 ===== */
  function moveWorkPanels() {
    var inner = $("workInner");
    if (!inner) return;
    WORK_SUBS.forEach(function (id) {
      var p = $("panel-" + id);
      if (p && p.parentNode !== inner) inner.appendChild(p);
    });
  }
  function showTop(tab) {
    TOP.forEach(function (t) { var p = $("panel-" + t); if (p) p.classList.remove("show"); });
    if (tab !== "work") {
      WORK_SUBS.forEach(function (s) { var p = $("panel-" + s); if (p) p.classList.remove("show"); });
    }
    var p = $("panel-" + tab); if (p) p.classList.add("show");
    document.querySelectorAll(".top-tab").forEach(function (b) { b.classList.toggle("active", b.dataset.tab === tab); });
    try {
      if (tab === "work") { if (!currentSub) showSub("daily"); }
      if (tab === "projects" && typeof renderProjects === "function") renderProjects();
      if (tab === "clients" && typeof renderClients === "function") renderClients();
      if (tab === "dash") loadAll();
      if (tab === "inspire") loadAll();
      if (tab === "recycle" && typeof renderRecycleBin === "function") renderRecycleBin();
    } catch (e) { /* 个别渲染异常不阻断导航 */ }
  }
  function showSub(sub) {
    WORK_SUBS.forEach(function (s) { var p = $("panel-" + s); if (p) p.classList.remove("show"); });
    var p = $("panel-" + sub); if (p) p.classList.add("show");
    document.querySelectorAll("#workBar .sub-tab").forEach(function (b) { b.classList.toggle("active", b.dataset.sub === sub); });
    currentSub = sub;
    try {
      if (sub === "history" && typeof renderAllHistory === "function") renderAllHistory();
      if (sub === "stat") { if (typeof calcAllStat === "function") calcAllStat(); if (typeof drawTrendChart === "function") drawTrendChart(); }
      if (sub === "annual") { if (typeof loadAnnualAutoData === "function") loadAnnualAutoData(); if (typeof renderAnnualTable === "function") renderAnnualTable(); if (typeof calcAnnualTotal === "function") calcAnnualTotal(); }
      if (sub === "daily") { if (typeof initDailyDate === "function") initDailyDate(); if (typeof updateLevelStats === "function") updateLevelStats(); }
      if (sub === "weekly") { if (typeof loadWeekAutoData === "function") loadWeekAutoData(); if (typeof updateLevelStats === "function") updateLevelStats(); }
      if (sub === "monthly") { if (typeof loadMonthAutoData === "function") loadMonthAutoData(); if (typeof updateLevelStats === "function") updateLevelStats(); }
      if (sub === "recycle" && typeof renderRecycleBin === "function") renderRecycleBin();
    } catch (e) { /* 个别渲染异常不阻断导航 */ }
  }

  /* ===== 初始化 ===== */
  function init() {
    setupIntelConfig();
    setupInspireConfig();
    moveWorkPanels();
    restructureClients();
    setupClientLevels();

    // 情报搜集：双窗口 + 公告类型 + 来源行业 + 省份 chips
    bindSubBar("dashSubBar", function (w) { intelWin = w; renderIntel(); }, renderIntel);
    var inSel = $("intelNotice"); if (inSel) inSel.addEventListener("change", function () { intelNotice = this.value; renderIntel(); });
    var isSel = $("intelSector"); if (isSel) isSel.addEventListener("change", function () { intelSector = this.value; renderIntel(); });
    var itSel = $("intelTimeRange"); if (itSel) itSel.addEventListener("change", function () { intelTimeRange = this.value; renderIntel(); });
    var isortSel = $("intelSort"); if (isortSel) isortSel.addEventListener("change", function () { intelSort = this.value; renderIntel(); });
    var rc = $("dashChips"); if (rc) rc.addEventListener("click", function (e) {
      var c = e.target.closest(".dash-chip"); if (!c) return;
      rc.querySelectorAll(".dash-chip").forEach(function (x) { x.classList.remove("active"); });
      c.classList.add("active");
      intelProv = c.dataset.r;
      renderIntel();
    });

    // 灵感早报：双窗口 + 活动日历 + 创意入口
    bindSubBar("insSubBar", function (w) { inspWin = w; renderInspire(); }, renderInspire);
    var intSel = $("inspTimeRange"); if (intSel) intSel.addEventListener("change", function () { inspTimeRange = this.value; renderInspire(); });
    var insortSel = $("inspSort"); if (insortSel) insortSel.addEventListener("change", function () { inspSort = this.value; renderInspire(); });
    try { if (window.bindInspireLinks) window.bindInspireLinks(); } catch (e) { console.warn("[bindInspireLinks]", e); }

    // 待办输入框按回车直接添加
    ["daily", "weekly", "monthly"].forEach(function (type) {
      var id = "todo" + type.charAt(0).toUpperCase() + type.slice(1) + "Input";
      var inp = $(id);
      if (inp) {
        inp.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.keyCode === 13) {
            e.preventDefault();
            if (typeof addTodoWithImage === "function") addTodoWithImage(type);
          }
        });
      }
    });

    document.querySelectorAll(".top-tab").forEach(function (b) {
      b.addEventListener("click", function () { showTop(b.dataset.tab); });
    });
    document.querySelectorAll("#workBar .sub-tab").forEach(function (b) {
      b.addEventListener("click", function () { showSub(b.dataset.sub); });
    });
    var dr = $("dashRefresh"); if (dr) dr.addEventListener("click", function () { dr.textContent = "刷新中…"; loadAll(); setTimeout(function () { dr.textContent = "↻ 立即刷新"; }, 800); });
    var ir = $("insRefresh"); if (ir) ir.addEventListener("click", function () { ir.textContent = "刷新中…"; loadAll(); setTimeout(function () { ir.textContent = "↻ 立即刷新"; }, 800); });

    // 暗色模式手动切换：同步按钮文案（跟随系统或已保存偏好）
    try {
      syncThemeBtn();
      var themeBtn = document.querySelector(".theme-toggle");
      if (themeBtn) themeBtn.addEventListener("click", function () { setTimeout(syncThemeBtn, 0); });
    } catch (e) {}

    setUpdated(SEED);
    renderIntel();
    renderInspire();
    showTop("dash");
    loadAll();
    setInterval(loadAll, POLL_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
