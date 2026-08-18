/* ===== V3.3 扩展模块：情报检索入口 ===== */
(function () {
  "use strict";

  var LINK_KEY = "wb_intel_links";
  var LINK_ORDER_KEY = "wb_intel_link_order";  // 检索入口分组（大项）的排列顺序

  /* ---------- 工具 ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  var toast = window.toast || function () {};
  function getArr(key, seed) {
    try {
      var s = localStorage.getItem(key);
      if (s) {
        try {
          var p = JSON.parse(s);
          // 云同步若把空数组「[]」写回 localSync，字符串为真值会导致下面的种子兜底永不触发、
          // 列表永久空白。因此把「空数组」也视为未初始化，回退到种子（仅当种子非空时）。
          if (!(Array.isArray(p) && p.length === 0 && seed && Array.isArray(seed) && seed.length)) {
            return p;
          }
        } catch (e) {}
      }
    } catch (e) {}
    var v = JSON.parse(JSON.stringify(seed));
    try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {}
    return v;
  }
  function setArr(key, arr) {
    try { localStorage.setItem(key, JSON.stringify(arr)); } catch (e) {}
    if (window.markDirty) window.markDirty(key);
  }

  /* ====================================================================
   * 情报检索入口（按地区分类的采集 / 检索链接）
   * ==================================================================== */
  var SEED_LINKS = [
    // 国家级
    { id: "lk-ccgp", region: "国家级", name: "中国政府采购网", url: "https://www.ccgp.gov.cn/", note: "全国政府采购法定发布媒体，职工活动类项目最多" },
    { id: "lk-ggzy", region: "国家级", name: "全国公共资源交易平台", url: "https://www.ggzy.gov.cn/", note: "国务院平台，汇聚各省交易数据" },
    { id: "lk-ceb", region: "国家级", name: "中国招标投标公共服务平台", url: "http://cebpubservice.cn/", note: "工程建设项目招投标法定发布媒体" },
    { id: "lk-chinabid", region: "国家级", name: "中国采购与招标网", url: "http://www.chinabidding.cn/", note: "综合性招标信息平台，覆盖国企/央企" },
    { id: "lk-qianlima", region: "国家级", name: "千里马招标网", url: "https://www.qianlima.com/", note: "第三方聚合，收录国企/央企/政府各类采购" },
    // 四川·省级
    { id: "lk-ccgp-sc", region: "四川·省级", name: "四川省政府采购一体化平台", url: "https://www.ccgp-sichuan.gov.cn/", note: "四川政府采购法定平台，职工运动会/游园最集中" },
    { id: "lk-ggzy-sc", region: "四川·省级", name: "四川省公共资源交易信息网", url: "https://ggzyjy.sc.gov.cn/", note: "四川工程招投标法定媒介，覆盖国企/央企驻川" },
    { id: "lk-scbid", region: "四川·省级", name: "四川招投标网", url: "http://www.scbid.net/", note: "省级综合招投标信息聚合" },
    // 四川·省属国企集采
    { id: "lk-tfyg", region: "四川·国企集采", name: "天府阳光采购服务平台", url: "http://www.tfygcgfw.com/cggg/index.jhtml", note: "省国资委统一管控，省属国企文体服务招标核心来源" },
    { id: "lk-shudao", region: "四川·国企集采", name: "蜀道集采平台", url: "https://zb.shudaojt.com/zbgg/index.jhtml", note: "蜀道集团统一招标采购，可按子公司分站检索" },
    { id: "lk-scny-tfyg", region: "四川·国企集采", name: "四川能投天府阳光", url: "http://scnyw.tfygcgfw.com", note: "四川能投集团采购平台" },
    // 四川·市级
    { id: "lk-cd", region: "四川·市级", name: "成都市公共资源交易服务中心", url: "https://www.cdggzy.com/", note: "" },
    { id: "lk-zigong", region: "四川·市级", name: "自贡市公共资源交易信息网", url: "https://www.zg.gov.cn/", note: "市政府网站集约化平台" },
    { id: "lk-pzh", region: "四川·市级", name: "攀枝花市公共资源交易服务中心", url: "https://www.panzhihua.gov.cn/", note: "市政府网站" },
    { id: "lk-lz", region: "四川·市级", name: "泸州市公共资源交易(全国平台泸州)", url: "https://www.lzsggzy.com/", note: "" },
    { id: "lk-dy", region: "四川·市级", name: "德阳市公共资源交易(全国平台德阳)", url: "https://www.deyang.gov.cn/", note: "市政府网站" },
    { id: "lk-my", region: "四川·市级", name: "绵阳市公共资源交易服务中心", url: "https://www.my.gov.cn/", note: "市政府网站" },
    { id: "lk-gy", region: "四川·市级", name: "广元市公共资源交易信息中心", url: "https://www.gyggzyjy.cn/", note: "" },
    { id: "lk-sn", region: "四川·市级", name: "遂宁市公共资源交易网", url: "https://www.snsggzy.com/", note: "" },
    { id: "lk-nj", region: "四川·市级", name: "内江市公共资源交易(全国平台内江)", url: "https://www.neijiang.gov.cn/", note: "市政府网站" },
    { id: "lk-ls", region: "四川·市级", name: "乐山公共资源交易平台", url: "https://www.lsggzy.com.cn/", note: "" },
    { id: "lk-nc", region: "四川·市级", name: "南充公共资源交易中心", url: "https://www.scncggzy.com.cn/", note: "" },
    { id: "lk-yb", region: "四川·市级", name: "宜宾市公共资源交易信息网", url: "https://www.yibin.gov.cn/", note: "市政府网站" },
    { id: "lk-ga", region: "四川·市级", name: "广安市公共资源交易网", url: "https://www.guang-an.gov.cn/", note: "市政府网站" },
    { id: "lk-dz", region: "四川·市级", name: "达州市公共资源交易中心", url: "https://www.dzggzy.cn/", note: "" },
    { id: "lk-ms", region: "四川·市级", name: "眉山市政务服务和公共资源交易服务中心", url: "https://www.msggzy.org.cn/", note: "" },
    { id: "lk-ya", region: "四川·市级", name: "雅安市公共资源交易(全国平台雅安)", url: "https://www.yaggzy.org.cn/", note: "" },
    { id: "lk-bz", region: "四川·市级", name: "巴中市公共资源交易平台", url: "https://www.bazhong.gov.cn/", note: "市政府网站集约化平台" },
    { id: "lk-zy", region: "四川·市级", name: "资阳市公共资源交易中心", url: "https://www.ziyang.gov.cn/", note: "市政府网站" },
    { id: "lk-gz", region: "四川·市级", name: "甘孜州政务服务和公共资源交易服务中心", url: "https://www.scgzzg.cn/", note: "" },
    { id: "lk-ab", region: "四川·市级", name: "阿坝州公共资源交易中心", url: "https://www.abazhou.gov.cn/", note: "州政府网站" },
    { id: "lk-lszhou", region: "四川·市级", name: "凉山州公共资源交易服务中心", url: "https://www.lsz.gov.cn/", note: "州政府网站" },
    // 重庆
    { id: "lk-ccgp-cq", region: "重庆", name: "重庆市政府采购网", url: "https://www.ccgp-chongqing.gov.cn/", note: "重庆政府采购法定平台" },
    { id: "lk-cqggzy", region: "重庆", name: "重庆市公共资源交易网", url: "https://www.cqggzy.com/", note: "重庆统一平台，覆盖各区县(可筛选)" },
    { id: "lk-cqzb", region: "重庆", name: "重庆市招标投标综合网", url: "http://www.cqzb.gov.cn/", note: "重庆招投标综合信息发布" },
    { id: "lk-cqgh", region: "重庆", name: "重庆市总工会职工服务网", url: "http://www.cqgh.org/", note: "发布工会系统职工活动采购公告" },
    { id: "lk-yongchuan", region: "重庆", name: "重庆市永川区公共资源交易网", url: "https://www.yczyjy.cn/", note: "" },
    // 陕西
    { id: "lk-ccgp-shaanxi", region: "陕西", name: "陕西省政府采购网", url: "https://www.ccgp-shaanxi.gov.cn/", note: "职工运动会/跳绳等项目集中" },
    { id: "lk-sxggzy", region: "陕西", name: "陕西省公共资源交易中心", url: "https://www.sxggzyjy.cn/", note: "全省统一平台(按地市筛选)" },
    { id: "lk-sxbid", region: "陕西", name: "陕西采购与招标网", url: "http://www.sxbid.com/", note: "省级综合招投标聚合" },
    // 云南
    { id: "lk-ccgp-yn", region: "云南", name: "云南省政府采购网", url: "https://www.ccgp-yunnan.gov.cn/", note: "职工运动会经政采云平台交易" },
    { id: "lk-ggzy-yn", region: "云南", name: "云南省公共资源交易信息网", url: "https://ggzy.yn.gov.cn/", note: "全省统一平台(按州市筛选)" },
    { id: "lk-zcy", region: "云南", name: "政采云(云南)", url: "https://www.zcygov.cn/", note: "政府采购电子化交易系统" },
    // 贵州
    { id: "lk-ccgp-gz", region: "贵州", name: "贵州省政府采购网", url: "https://www.ccgp-guizhou.gov.cn/", note: "" },
    { id: "lk-ggzy-gz", region: "贵州", name: "贵州省公共资源交易云", url: "https://ggzy.guizhou.gov.cn/", note: "国企/银行职工运动会集中发布" },
    { id: "lk-ztb-gz", region: "贵州", name: "贵州省招标投标公共服务平台", url: "https://ztb.guizhou.gov.cn/", note: "" },
    { id: "lk-qyebid", region: "贵州", name: "黔云招采电子招标采购交易平台", url: "https://www.qyebid.com/", note: "贵州国企/央企采购专用(贵州农商行等)" },
    // 国企/央企/机关自有平台
    { id: "lk-ecp", region: "国企/央企自有平台", name: "国家电网电子商务平台(ECP)", url: "https://ecp.sgcc.com.cn/", note: "国网及各省电力公司职工运动会项目" },
    { id: "lk-csg", region: "国企/央企自有平台", name: "南方电网供应链统一服务平台", url: "https://www.bidding.csg.cn/", note: "南网及下属工会活动/竞赛" },
    { id: "lk-post", region: "国企/央企自有平台", name: "中国邮政电子采购与供应平台", url: "https://caigou.chinapost.com.cn/", note: "邮储银行重庆分行工会活动等" },
    { id: "lk-cqtobacco", region: "国企/央企自有平台", name: "重庆烟草网", url: "https://www.cq.tobacco.gov.cn/", note: "重庆烟草系统职工运动会项目" },
    { id: "lk-gec", region: "国企/央企自有平台", name: "行采家(电子竞采平台)", url: "https://www.gec123.com/", note: "重庆市总工会及重庆部分国企采购" },
    { id: "lk-cdxc", region: "国企/央企自有平台", name: "成都兴城投资集团采购平台", url: "https://www.cdxcjt.com/", note: "成都兴城集团及下属企业" },
    { id: "lk-zcy2", region: "国企/央企自有平台", name: "政采云(全国多省)", url: "https://www.zcygov.cn/", note: "政府采购云平台" }
  ];

  var linkBatchMode = false;

  /* 读取/计算分组（大项）的展示顺序：已保存顺序优先，未记录的新分组按 SEED 原顺序补在末尾 */
  function orderRegions(regions) {
    var order = null;
    try { order = JSON.parse(localStorage.getItem(LINK_ORDER_KEY)); } catch (e) {}
    if (!order || !Array.isArray(order)) {
      // 首次使用：保留 SEED 里 region 的原始出现顺序，而不是按字母重排
      var first = [];
      SEED_LINKS.forEach(function (l) { if (first.indexOf(l.region) < 0) first.push(l.region); });
      return regions.slice().sort(function (a, b) {
        var ia = first.indexOf(a), ib = first.indexOf(b);
        if (ia >= 0 && ib >= 0) return ia - ib;
        if (ia >= 0) return -1;
        if (ib >= 0) return 1;
        return a.localeCompare(b);
      });
    }
    // 清理 order 中重复或已被删除的分组
    var seen = [], cleanOrder = [];
    order.forEach(function (r) { if (seen.indexOf(r) < 0) { seen.push(r); cleanOrder.push(r); } });
    var known = regions.filter(function (r) { return cleanOrder.indexOf(r) >= 0; })
      .sort(function (a, b) { return cleanOrder.indexOf(a) - cleanOrder.indexOf(b); });
    var unknown = regions.filter(function (r) { return cleanOrder.indexOf(r) < 0; })
      .sort(function (a, b) { return a.localeCompare(b); });
    return known.concat(unknown);
  }

  function renderIntelLinks() {
    var box = $("intelLinks"); if (!box) return;
    var list = getArr(LINK_KEY, SEED_LINKS);
    if ($("nLinks")) $("nLinks").textContent = list.length;
    var groups = {};
    list.forEach(function (l) { (groups[l.region] = groups[l.region] || []).push(l); });
    var regions = Object.keys(groups);
    var keys = orderRegions(regions);
    if (!keys.length) { box.innerHTML = '<div class="dash-empty">暂无检索入口，点「➕ 新增检索」添加你常用的平台</div>'; return; }
    box.innerHTML = keys.map(function (k, idx) {
      var up = idx > 0 ? '<button class="grp-mv" data-region="' + esc(k) + '" data-dir="up" title="上移该分组">▲</button>' : '';
      var down = idx < keys.length - 1 ? '<button class="grp-mv" data-region="' + esc(k) + '" data-dir="down" title="下移该分组">▼</button>' : '';
      return '<div class="link-cat"><div class="link-cat-h">' + esc(k) + ' <span class="cnt">' + groups[k].length + '</span>' +
        '<span class="grp-mv-grp">' + up + down + '</span></div>' +
        '<div class="link-list">' + groups[k].map(function (l) {
          var chk = linkBatchMode ? '<input type="checkbox" class="link-chk" data-id="' + esc(l.id) + '" />' : '';
          return '<div class="link-item">' + chk +
            '<a class="link-name" href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.name) + '</a>' +
            (l.note ? '<span class="link-note">' + esc(l.note) + '</span>' : '') +
            '</div>';
        }).join("") + '</div></div>';
    }).join("");
    if (linkBatchMode) box.classList.add("batch"); else box.classList.remove("batch");
    box.querySelectorAll(".grp-mv").forEach(function (b) {
      b.addEventListener("click", function () { moveGroup(b.getAttribute("data-region"), b.getAttribute("data-dir")); });
    });
  }

  /* 调整「分组（大项）」整体的上下顺序，持久化保存，下次打开仍是你排好的顺序 */
  function moveGroup(region, dir) {
    var list = getArr(LINK_KEY, SEED_LINKS);
    var regions = [];
    list.forEach(function (l) { if (regions.indexOf(l.region) < 0) regions.push(l.region); });
    var keys = orderRegions(regions);
    var i = keys.indexOf(region);
    if (i < 0) return;
    var j = i + (dir === "up" ? -1 : 1);
    if (j < 0 || j >= keys.length) return; // 已到顶部/底部
    var tmp = keys[i]; keys[i] = keys[j]; keys[j] = tmp;
    setArr(LINK_ORDER_KEY, keys);  // 持久化 + 标记 dirty，确保云同步也保留自定义顺序
    renderIntelLinks();
  }

  function bindLinkForm() {
    var addBtn = $("lkAddBtn"); if (!addBtn) return;
    if (bindLinkForm._b) return; bindLinkForm._b = true; // 幂等：避免重复绑定
    var form = $("lkAddForm");
    var sel = $("lk-region-sel");
    var newInp = $("lk-region-new");
    function refreshRegionOptions() {
      var list = getArr(LINK_KEY, SEED_LINKS);
      var regions = [];
      list.forEach(function (l) { if (regions.indexOf(l.region) < 0) regions.push(l.region); });
      regions.sort();
      sel.innerHTML = '<option value="__new__">➕ 新建分组…</option>' + regions.map(function (r) {
        return '<option value="' + esc(r) + '">' + esc(r) + '</option>';
      }).join("");
    }
    refreshRegionOptions();
    addBtn.addEventListener("click", function () {
      var open = form.style.display === "none";
      form.style.display = open ? "block" : "none";
      addBtn.textContent = open ? "✕ 收起" : "➕ 新增检索";
      if (open) refreshRegionOptions();
    });
    sel.addEventListener("change", function () {
      newInp.style.display = sel.value === "__new__" ? "inline-block" : "none";
    });
    var cancel = $("lk-cancel"); if (cancel) cancel.addEventListener("click", function () {
      form.style.display = "none"; addBtn.textContent = "➕ 新增检索"; newInp.style.display = "none";
    });
    var save = $("lk-save"); if (save) save.addEventListener("click", function () {
      var region = sel.value === "__new__" ? newInp.value.trim() : sel.value;
      var name = $("lk-name").value.trim();
      var url = $("lk-url").value.trim();
      if (!name || !url) { alert("请填写名称与链接"); return; }
      if (!/^https?:\/\//i.test(url)) { alert("链接需以 http:// 或 https:// 开头"); return; }
      if (!region) { alert("请选择或填写分组"); return; }
      var list = getArr(LINK_KEY, SEED_LINKS);
      list.push({ id: "lk_" + Date.now(), region: region, name: name, url: url, note: "" });
      setArr(LINK_KEY, list);
      $("lk-name").value = ""; $("lk-url").value = ""; newInp.value = ""; sel.value = "__new__"; newInp.style.display = "none";
      form.style.display = "none"; addBtn.textContent = "➕ 新增检索";
      renderIntelLinks();
    });
    var batchBtn = $("lkBatchBtn");
    if (batchBtn) batchBtn.addEventListener("click", function () {
      if (!linkBatchMode) {
        linkBatchMode = true;
        batchBtn.textContent = "✅ 删除选中";
        renderIntelLinks();
        return;
      }
      var box = $("intelLinks");
      var checked = Array.prototype.slice.call(box.querySelectorAll(".link-chk:checked"));
      if (!checked.length) {
        linkBatchMode = false;
        batchBtn.textContent = "🗑️ 批量删除";
        renderIntelLinks();
        return;
      }
      if (!confirm("确认删除选中的 " + checked.length + " 个检索入口？")) return;
      var ids = checked.map(function (c) { return c.getAttribute("data-id"); });
      var list = getArr(LINK_KEY, SEED_LINKS).filter(function (l) { return ids.indexOf(l.id) < 0; });
      setArr(LINK_KEY, list);
      linkBatchMode = false;
      batchBtn.textContent = "🗑️ 批量删除";
      renderIntelLinks();
      toast("已删除 " + checked.length + " 个检索入口");
    });
  }

  /* ====================================================================
   * 灵感早报 · 创意入口（活动策划 / 行业资讯 / 设计灵感 / 文案工具）
   * ==================================================================== */
  var INSP_LINK_KEY = "wb_insp_links";
  var INSP_LINK_ORDER_KEY = "wb_insp_link_order";

  var SEED_INSP_LINKS = [
    // 活动策划案例库
    { id: "ilk-eventwang", region: "活动策划案例库", name: "活动汪", url: "https://www.eventwang.cn/", note: "活动人社区，10000+ 全行业优质活动案例、资源与课程" },
    { id: "ilk-osogoo", region: "活动策划案例库", name: "元素谷", url: "https://www.osogoo.com/", note: "活动人互动社区，含活动资讯、资源、策划方案、课程" },
    { id: "ilk-onsiteclub", region: "活动策划案例库", name: "现场俱乐部", url: "http://www.onsiteclub.com/", note: "国内外公关活动现场案例分享" },
    { id: "ilk-opp2", region: "活动策划案例库", name: "青瓜传媒", url: "https://www.opp2.com/", note: "活动策划方案、营销策划方案、思维导图学习" },
    // 行业资讯 / 营销媒体
    { id: "ilk-digitaling", region: "行业资讯 / 营销媒体", name: "数英网", url: "https://www.digitaling.com/", note: "数字媒体及职业招聘社交，营销/广告/创意设计" },
    { id: "ilk-adquan", region: "行业资讯 / 营销媒体", name: "广告门", url: "https://www.adquan.com/", note: "广告创意与营销案例平台" },
    { id: "ilk-topys", region: "行业资讯 / 营销媒体", name: "TOPYS", url: "https://www.topys.cn/", note: "全球顶尖创意分享与课程学习" },
    { id: "ilk-meihua", region: "行业资讯 / 营销媒体", name: "梅花网", url: "http://www.meihua.info", note: "营销作品合集，案例/资讯/情报/线下活动" },
    { id: "ilk-socialbeta", region: "行业资讯 / 营销媒体", name: "SocialBeta", url: "https://socialbeta.com/", note: "社交媒体与数字营销资讯" },
    { id: "ilk-madisonboom", region: "行业资讯 / 营销媒体", name: "麦迪逊邦", url: "http://www.madisonboom.com/", note: "资讯和策划案例分享，每日更新" },
    { id: "ilk-36kr", region: "行业资讯 / 营销媒体", name: "36氪", url: "http://36kr.com/", note: "科技创业与商业资讯" },
    { id: "ilk-tmtpost", region: "行业资讯 / 营销媒体", name: "钛媒体", url: "http://www.tmtpost.com/", note: "TMT 行业资讯与深度报道" },
    // 设计灵感
    { id: "ilk-zcool", region: "设计灵感", name: "站酷", url: "http://www.zcool.com.cn/", note: "中国设计师互动社区，可联系原创者获取案例" },
    { id: "ilk-huaban", region: "设计灵感", name: "花瓣网", url: "https://huaban.com/", note: "设计灵感采集平台，超 20 亿素材" },
    { id: "ilk-gtn9", region: "设计灵感", name: "古田路9号", url: "https://www.gtn9.com/index.aspx", note: "品牌创意与包装设计平台" },
    { id: "ilk-bigbigwork", region: "设计灵感", name: "大作", url: "http://www.bigbigwork.com/", note: "国际网站灵感库" },
    { id: "ilk-behance", region: "设计灵感", name: "Behance", url: "https://www.behance.net/", note: "设计师创意灵感平台" },
    // 文案工具
    { id: "ilk-wenangou", region: "文案工具", name: "文案狗", url: "http://www.wenangou.com/", note: "自媒体文案大全，创意/广告语/谐音" },
    { id: "ilk-wenanmi", region: "文案工具", name: "文案迷", url: "http://www.wenanmi.com/", note: "收集各种创意文案" },
    { id: "ilk-ju1", region: "文案工具", name: "句易网", url: "http://www.ju1.cn/", note: "在线广告禁用词查询平台" },
    { id: "ilk-azrhymes", region: "文案工具", name: "押韵词典", url: "http://zh.azrhymes.com", note: "自动押韵工具，辅助文案押韵" },
    { id: "ilk-mingdawoo", region: "文案工具", name: "近邻词汇检索", url: "http://tool.mingdawoo.com", note: "查询近似短语与相关术语" },
    // 视频 / 素材
    { id: "ilk-xinpianchang", region: "视频 / 素材", name: "新片场", url: "https://www.xinpianchang.com/square", note: "视频创作人社区与素材平台" },
    { id: "ilk-vmovier", region: "视频 / 素材", name: "场库", url: "https://www.vmovier.com/", note: "高品质短片分享平台" },
    { id: "ilk-tvcbook", region: "视频 / 素材", name: "优视云集", url: "https://www.tvcbook.com/", note: "视频制作与分发平台，TVC 案例" },
    { id: "ilk-vcg", region: "视频 / 素材", name: "视觉中国", url: "https://www.vcg.com/", note: "正版图片视频音乐素材交易" },
    { id: "ilk-canva", region: "视频 / 素材", name: "Canva 可画", url: "https://www.canva.cn/", note: "在线作图与平面设计模板" },
    // 活动发布平台
    { id: "ilk-huodongxing", region: "活动发布平台", name: "活动行", url: "https://www.huodongxing.com/", note: "活动发布与报名平台" },
    // 实用工具 / 协作
    { id: "ilk-docsqq", region: "实用工具 / 协作", name: "腾讯文档", url: "https://docs.qq.com", note: "在线文档多人协作" },
    { id: "ilk-shimo", region: "实用工具 / 协作", name: "石墨文档", url: "https://shimo.im/", note: "云端 Office 多人协作" },
    { id: "ilk-mubu", region: "实用工具 / 协作", name: "幕布", url: "https://mubu.com/", note: "一键生成思维导图" },
    { id: "ilk-wjx", region: "实用工具 / 协作", name: "问卷星", url: "https://www.wjx.cn/", note: "调查问卷生成工具" },
    { id: "ilk-cli", region: "实用工具 / 协作", name: "草料二维码", url: "https://cli.im/", note: "在线二维码生成器" },
    { id: "ilk-eqxiu", region: "实用工具 / 协作", name: "易企秀", url: "https://store.eqxiu.com/index/", note: "H5 制作平台" }
  ];

  var inspLinkBatchMode = false;

  function orderInspireGroups(groups) {
    var order = null;
    try { order = JSON.parse(localStorage.getItem(INSP_LINK_ORDER_KEY)); } catch (e) {}
    if (!order || !Array.isArray(order)) {
      var first = [];
      SEED_INSP_LINKS.forEach(function (l) { if (first.indexOf(l.region) < 0) first.push(l.region); });
      return groups.slice().sort(function (a, b) {
        var ia = first.indexOf(a), ib = first.indexOf(b);
        if (ia >= 0 && ib >= 0) return ia - ib;
        if (ia >= 0) return -1;
        if (ib >= 0) return 1;
        return a.localeCompare(b);
      });
    }
    var seen = [], cleanOrder = [];
    order.forEach(function (r) { if (seen.indexOf(r) < 0) { seen.push(r); cleanOrder.push(r); } });
    var known = groups.filter(function (r) { return cleanOrder.indexOf(r) >= 0; })
      .sort(function (a, b) { return cleanOrder.indexOf(a) - cleanOrder.indexOf(b); });
    var unknown = groups.filter(function (r) { return cleanOrder.indexOf(r) < 0; })
      .sort(function (a, b) { return a.localeCompare(b); });
    return known.concat(unknown);
  }

  function renderInspireLinks() {
    var box = $("inspLinks"); if (!box) return;
    var list = getArr(INSP_LINK_KEY, SEED_INSP_LINKS);
    if ($("nInspLinks")) $("nInspLinks").textContent = list.length;
    var groups = {};
    list.forEach(function (l) { (groups[l.region] = groups[l.region] || []).push(l); });
    var keys = orderInspireGroups(Object.keys(groups));
    if (!keys.length) { box.innerHTML = '<div class="dash-empty">暂无创意入口，点「➕ 新增链接」添加你常用的策划网站</div>'; return; }
    box.innerHTML = keys.map(function (k, idx) {
      var up = idx > 0 ? '<button class="grp-mv" data-region="' + esc(k) + '" data-dir="up" title="上移该分组">▲</button>' : '';
      var down = idx < keys.length - 1 ? '<button class="grp-mv" data-region="' + esc(k) + '" data-dir="down" title="下移该分组">▼</button>' : '';
      return '<div class="link-cat"><div class="link-cat-h">' + esc(k) + ' <span class="cnt">' + groups[k].length + '</span>' +
        '<span class="grp-mv-grp">' + up + down + '</span></div>' +
        '<div class="link-list">' + groups[k].map(function (l) {
          var chk = inspLinkBatchMode ? '<input type="checkbox" class="link-chk" data-id="' + esc(l.id) + '" />' : '';
          return '<div class="link-item">' + chk +
            '<a class="link-name" href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.name) + '</a>' +
            (l.note ? '<span class="link-note">' + esc(l.note) + '</span>' : '') +
            '</div>';
        }).join("") + '</div></div>';
    }).join("");
    if (inspLinkBatchMode) box.classList.add("batch"); else box.classList.remove("batch");
    box.querySelectorAll(".grp-mv").forEach(function (b) {
      b.addEventListener("click", function () { moveInspireGroup(b.getAttribute("data-region"), b.getAttribute("data-dir")); });
    });
  }

  function moveInspireGroup(region, dir) {
    var list = getArr(INSP_LINK_KEY, SEED_INSP_LINKS);
    var regions = [];
    list.forEach(function (l) { if (regions.indexOf(l.region) < 0) regions.push(l.region); });
    var keys = orderInspireGroups(regions);
    var i = keys.indexOf(region);
    if (i < 0) return;
    var j = i + (dir === "up" ? -1 : 1);
    if (j < 0 || j >= keys.length) return;
    var tmp = keys[i]; keys[i] = keys[j]; keys[j] = tmp;
    setArr(INSP_LINK_ORDER_KEY, keys);
    renderInspireLinks();
  }

  function bindInspireLinkForm() {
    var addBtn = $("inspLkAddBtn"); if (!addBtn) return;
    if (bindInspireLinkForm._b) return; bindInspireLinkForm._b = true; // 幂等：避免重复绑定导致 batch 按钮挂多个 handler
    var form = $("inspLkAddForm");
    var sel = $("inspLk-region-sel");
    var newInp = $("inspLk-region-new");
    function refreshRegionOptions() {
      var list = getArr(INSP_LINK_KEY, SEED_INSP_LINKS);
      var regions = [];
      list.forEach(function (l) { if (regions.indexOf(l.region) < 0) regions.push(l.region); });
      regions.sort();
      sel.innerHTML = '<option value="__new__">➕ 新建分组…</option>' + regions.map(function (r) {
        return '<option value="' + esc(r) + '">' + esc(r) + '</option>';
      }).join("");
    }
    refreshRegionOptions();
    addBtn.addEventListener("click", function () {
      var open = form.style.display === "none";
      form.style.display = open ? "block" : "none";
      addBtn.textContent = open ? "✕ 收起" : "➕ 新增链接";
      if (open) refreshRegionOptions();
    });
    sel.addEventListener("change", function () {
      newInp.style.display = sel.value === "__new__" ? "inline-block" : "none";
    });
    var cancel = $("inspLk-cancel"); if (cancel) cancel.addEventListener("click", function () {
      form.style.display = "none"; addBtn.textContent = "➕ 新增链接"; newInp.style.display = "none";
    });
    var save = $("inspLk-save"); if (save) save.addEventListener("click", function () {
      var region = sel.value === "__new__" ? newInp.value.trim() : sel.value;
      var name = $("inspLk-name").value.trim();
      var url = $("inspLk-url").value.trim();
      if (!name || !url) { alert("请填写名称与链接"); return; }
      if (!/^https?:\/\//i.test(url)) { alert("链接需以 http:// 或 https:// 开头"); return; }
      if (!region) { alert("请选择或填写分组"); return; }
      var list = getArr(INSP_LINK_KEY, SEED_INSP_LINKS);
      list.push({ id: "ilk_" + Date.now(), region: region, name: name, url: url, note: "" });
      setArr(INSP_LINK_KEY, list);
      $("inspLk-name").value = ""; $("inspLk-url").value = ""; newInp.value = ""; sel.value = "__new__"; newInp.style.display = "none";
      form.style.display = "none"; addBtn.textContent = "➕ 新增链接";
      renderInspireLinks();
    });
    var batchBtn = $("inspLkBatchBtn");
    if (batchBtn) batchBtn.addEventListener("click", function () {
      if (!inspLinkBatchMode) {
        inspLinkBatchMode = true;
        batchBtn.textContent = "✅ 删除选中";
        renderInspireLinks();
        return;
      }
      var box = $("inspLinks");
      var checked = Array.prototype.slice.call(box.querySelectorAll(".link-chk:checked"));
      if (!checked.length) {
        inspLinkBatchMode = false;
        batchBtn.textContent = "🗑️ 批量删除";
        renderInspireLinks();
        return;
      }
      if (!confirm("确认删除选中的 " + checked.length + " 个创意入口？")) return;
      var ids = checked.map(function (c) { return c.getAttribute("data-id"); });
      var list = getArr(INSP_LINK_KEY, SEED_INSP_LINKS).filter(function (l) { return ids.indexOf(l.id) < 0; });
      setArr(INSP_LINK_KEY, list);
      inspLinkBatchMode = false;
      batchBtn.textContent = "🗑️ 批量删除";
      renderInspireLinks();
      toast("已删除 " + checked.length + " 个创意入口");
    });
  }

  window.renderInspireLinks = renderInspireLinks;
  window.bindInspireLinks = function () { bindInspireLinkForm(); renderInspireLinks(); };
  window.renderIntelLinks = renderIntelLinks;
  window.bindIntelLinks = function () { bindLinkForm(); renderIntelLinks(); };

  /* ---------- 初始化 ---------- */
  function initExtra() {
    try { if ($("intelLinks")) window.bindIntelLinks(); } catch (e) { console.warn("[extra links]", e); }
    try { if ($("inspLinks")) window.bindInspireLinks(); } catch (e) { console.warn("[extra inspire links]", e); }
    try { initUI(); } catch (e) { console.warn("[ui]", e); }
  }

  /* ---------- UI 微交互：进入视口时极轻量淡入（不改变排版/位置，尊重 reduce-motion） ---------- */
  function initUI() {
    var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    var nodes = document.querySelectorAll(".dash-section, .cfg-box, .dash-stat, .win-toolbar, .link-cat, .dash-card");
    if (!("IntersectionObserver" in window)) return; // 不支持则保持原样，不破坏布局
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.05 });
    nodes.forEach(function (n) { n.classList.add("reveal"); io.observe(n); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initExtra);
  else initExtra();

  /* ====================== [V4] 内置版本更新检查 ====================== */
  (function () {
    function showUpdateBanner() {
      if (document.getElementById('app-update-banner')) return;
      var b = document.createElement('div');
      b.id = 'app-update-banner';
      b.className = 'app-update-banner';
      b.innerHTML = '🎉 发现新版本（含新功能），<a href="javascript:void(0)" onclick="appDoUpdate()">点击刷新</a>';
      document.body.appendChild(b);
    }
    window.appDoUpdate = function () {
      try { location.reload(true); } catch (e) { location.reload(); }
    };
    window.checkAppUpdate = function () {
      try {
        var url = new URL('version.json', location.href);
        url.searchParams.set('_', String(Date.now()));
        fetch(url.toString(), { cache: 'no-store' }).then(function (r) {
          if (!r.ok) return null;
          return r.json();
        }).then(function (data) {
          if (data && data.version && window.APP_VERSION && data.version !== window.APP_VERSION) {
            showUpdateBanner();
          }
        }).catch(function () {});
      } catch (e) {}
    };
    window.addEventListener('load', function () {
      setTimeout(window.checkAppUpdate, 3000);
      setInterval(window.checkAppUpdate, 5 * 60 * 1000);
    });
  })();
})();
