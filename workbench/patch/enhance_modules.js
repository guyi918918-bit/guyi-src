/* ============================================================
 * 升级模块：川内商机雷达 + 案例智库
 * 数据全部存 localStorage，并通过 enhance.js 的 setStorage 包装自动接入 Supabase 同步。
 * 所有外部信息均走「公开免费搜索」（百度 site 检索），不依赖任何付费/授权接口。
 * ============================================================ */

/* ---------- 数据源定义 ---------- */
var RADAR_SOURCES = [
  { id: 'ccgp',   name: '四川省政府采购网', type: 'gov', site: 'ccgp-sichuan.gov.cn', desc: '事业单位/文旅体育局/总工会项目核心来源；重点看「采购意向」板块' },
  { id: 'ggzy',   name: '四川省公共资源交易信息网', type: 'gov', site: 'ggzyjy.sc.gov.cn', desc: '千万级城市赛事、国企文体外包集中发布' },
  { id: 'tfyg',   name: '天府阳光采购服务平台', type: 'gov', site: 'tfygcgfw.com', desc: '省国资委统一平台，蜀道/川发/川航等国企全在这' },
  { id: 'shudao', name: '蜀道集团集采平台', type: 'gov', site: 'zb.shudaojt.com', desc: '交通基建国企，常年工会文体/党建赛事' },
  { id: 'ceb',    name: '中国招标投标公共服务平台', type: 'gov', site: 'cebpubservice.com', desc: '央企驻川大额项目强制公示，补充校验' },
  { id: 'sczb',   name: '四川招标网', type: 'agg', site: '', desc: '地域精准锁定各市州活动比选公告（公开浏览）' },
  { id: 'baidu',  name: '百度通用检索', type: 'agg', site: '', desc: '固定句式：四川XX国企 职工活动策划招标' }
];

var CASE_SOURCES = [
  { id: 'socialbeta', name: '数英网 Digitaling', type: 'case', site: 'socialbeta.com', desc: '整合营销/品牌案例，策划灵感首选' },
  { id: 'adquan',     name: '广告门', type: 'case', site: 'adquan.com', desc: '4A/品牌公关/活动案例' },
  { id: 'huodongxing',name: '活动行', type: 'case', site: 'huodongxing.com', desc: '线下活动/发布会/沙龙' },
  { id: 'meihua',     name: '梅花网', type: 'case', site: 'meihua.info', desc: '营销案例库/作品集' },
  { id: 'topys',      name: 'Topys', type: 'case', site: 'topys.cn', desc: '创意/文案/设计案例' },
  { id: 'baidu',      name: '百度通用检索', type: 'case', site: '', desc: '四川 活动 策划 案例' }
];

var CHECK_SOURCES = [
  { id: 'tfyg',  name: '天府阳光采购服务平台', hint: '省属国企核心标源' },
  { id: 'ccgp',  name: '四川省政府采购网', hint: '事业单位/文旅体育局' },
  { id: 'ggzy',  name: '四川省公共资源交易信息网', hint: '大额城市赛事/国企外包' },
  { id: 'shudao',name: '蜀道集团集采平台', hint: '交通基建国企工会' },
  { id: 'agg',   name: '四川招标网 / 聚合平台', hint: '补充零散比选' },
  { id: 'case',  name: '案例平台扫一眼', hint: '看同行新案例（灵感）' }
];

var DEFAULT_KW = [
  '活动策划全案', '活动执行服务', '赛事运营', '体育赛事承办', '团建拓展',
  '职工文体服务', '年度员工活动', '年会策划搭建', '庆典仪式', '新品发布会',
  '品牌路演', '文旅推广', '公益跑', '城市定向赛', '党建主题活动',
  '客户答谢私享会', '职工运动会', '工会年度文体外包', '企业周年庆典',
  '产业招商论坛', '职工技能竞赛', '企业IP趣味跑', '城市文旅节',
  '全民健身活动', '体育嘉年华', '惠民文艺演出', '城市IP赛事'
];

/* ---------- 存储 helper ---------- */
function toast(msg, type) {
  var wrap = document.getElementById('wbToastWrap');
  if (!wrap) return;
  var el = document.createElement('div');
  el.className = 'wb-toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(function () {
    el.style.transition = 'opacity .3s'; el.style.opacity = '0';
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 350);
  }, 1800);
}
function rget(key, def) {
  try { var v = localStorage.getItem(key); return v == null ? def : JSON.parse(v); }
  catch (e) { return def; }
}
function rset(key, val) {
  // 复用 enhance.js 包装后的 setStorage，自动标记脏数据并触发云同步
  if (typeof setStorage === 'function') setStorage(key, val);
  else { localStorage.setItem(key, JSON.stringify(val)); }
}

/* ---------- 通用工具 ---------- */
function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text); toast('已复制到剪贴板', 'ok'); return;
    }
  } catch (e) {}
  var ta = document.createElement('textarea');
  ta.value = text; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toast('已复制到剪贴板', 'ok'); }
  catch (e) { toast('复制失败，请手动选择', 'err'); }
  document.body.removeChild(ta);
}
function buildSearch(site, kw) {
  kw = (kw || '').trim();
  if (!kw) kw = '活动 赛事 团建';
  var q;
  if (site) q = kw + ' site:' + site;
  else q = '四川 ' + kw + ' 招标 采购 活动';
  return 'https://www.baidu.com/s?wd=' + encodeURIComponent(q);
}
function todayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function parseBudgetNum(s) {
  if (!s) return 0;
  var m = String(s).match(/(\d+(?:\.\d+)?)\s*万?/);
  return m ? parseFloat(m[1]) : 0;
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

/* ============================================================
 *  商机雷达
 * ============================================================ */
function renderRadarSources() {
  var box = document.getElementById('radarSources');
  if (!box) return;
  box.innerHTML = RADAR_SOURCES.map(function (s) {
    var badge = s.type === 'gov' ? '<span class="src-badge gov">官方</span>' : '<span class="src-badge agg">聚合</span>';
    return '<div class="source-card">' +
      '<div class="sc-top"><span class="sc-name">' + esc(s.name) + '</span>' + badge + '</div>' +
      '<div class="sc-desc">' + esc(s.desc) + '</div>' +
      '<div class="sc-actions">' +
        '<button class="btn-mod go" onclick="openRadarSearch(\'' + s.id + '\')">🔍 搜这个词</button>' +
      '</div></div>';
  }).join('');
}
function openRadarSearch(id) {
  var src = RADAR_SOURCES.filter(function (s) { return s.id === id; })[0];
  if (!src) return;
  var kw = document.getElementById('radarSearchKw').value;
  window.open(buildSearch(src.site, kw), '_blank');
}
function radarSearchAll() {
  var kw = document.getElementById('radarSearchKw').value;
  window.open(buildSearch('', kw), '_blank');
  toast('已在浏览器新标签打开全网搜索', 'ok');
}

/* 关键词库 */
function renderRadarKw() {
  var ta = document.getElementById('radarKw');
  if (!ta) return;
  var saved = rget('wb_radar_kw', null);
  if (saved == null) { saved = DEFAULT_KW.join('\n'); rset('wb_radar_kw', saved); }
  ta.value = saved;
  var chips = document.getElementById('radarKwChips');
  chips.innerHTML = saved.split('\n').map(function (w) {
    w = w.trim(); if (!w) return '';
    return '<span class="kw-chip" onclick="useKwChip(this)">' + esc(w) + '</span>';
  }).join('');
}
function saveRadarKw() {
  var v = document.getElementById('radarKw').value;
  rset('wb_radar_kw', v); renderRadarKw(); toast('关键词已保存', 'ok');
}
function copyRadarKw() {
  copyText(document.getElementById('radarKw').value);
}
function resetRadarKw() {
  rset('wb_radar_kw', DEFAULT_KW.join('\n')); renderRadarKw(); toast('已恢复默认词库', 'ok');
}
function useKwChip(el) {
  document.getElementById('radarSearchKw').value = el.textContent;
  document.getElementById('radarSearchKw').focus();
  toast('已填入搜索框，去点「搜这个词」', 'ok');
}
function genRadarQuery() {
  var lines = document.getElementById('radarKw').value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
  if (!lines.length) { toast('关键词为空', 'err'); return; }
  var qs = lines.map(function (w) { return '四川 ' + w + ' 招标 采购 活动'; });
  var html = '<div class="brief-box"><h4>🧩 可直接粘贴到百度/各平台搜索框的句式（' + qs.length + ' 条）</h4>' +
    '<textarea class="kw-area" style="min-height:160px;" readonly>' + esc(qs.join('\n')) + '</textarea>' +
    '<div class="mod-row" style="margin-top:10px;"><button class="btn-mod primary" onclick="copyText(document.querySelector(\'#radarQueryOut textarea\').value)">📋 复制全部句式</button></div></div>';
  document.getElementById('radarQueryOut').innerHTML = html;
}

/* 每日巡检清单 */
function renderRadarChecklist() {
  var box = document.getElementById('radarChecklist');
  var prog = document.getElementById('radarCheckProgress');
  if (!box) return;
  var st = rget('wb_radar_check', { date: '', done: {} });
  if (st.date !== todayStr()) { st = { date: todayStr(), done: {} }; rset('wb_radar_check', st); }
  box.innerHTML = CHECK_SOURCES.map(function (s) {
    var done = !!st.done[s.id];
    return '<label class="check-item' + (done ? ' done' : '') + '">' +
      '<input type="checkbox" ' + (done ? 'checked' : '') + ' onchange="toggleRadarCheck(\'' + s.id + '\', this.checked)">' +
      '<span class="ci-name">' + esc(s.name) + '</span>' +
      '<span class="ci-hint">' + esc(s.hint) + '</span></label>';
  }).join('');
  var n = CHECK_SOURCES.filter(function (s) { return st.done[s.id]; }).length;
  prog.innerHTML = '今日已巡检 <b>' + n + ' / ' + CHECK_SOURCES.length + '</b> 　点击勾选即记录，每日 0 点自动重置';
}
function toggleRadarCheck(id, checked) {
  var st = rget('wb_radar_check', { date: todayStr(), done: {} });
  if (st.date !== todayStr()) st = { date: todayStr(), done: {} };
  st.done[id] = checked;
  rset('wb_radar_check', st); renderRadarChecklist();
}
function resetRadarCheck() {
  rset('wb_radar_check', { date: todayStr(), done: {} }); renderRadarChecklist(); toast('今日清单已重置', 'ok');
}

/* 商机台账 */
var radarEditing = null;
function toggleRadarForm() {
  var f = document.getElementById('radarForm');
  if (f.style.display === 'none') {
    f.style.display = 'block'; radarEditing = null;
    ['rfUnit','rfName','rfBudget','rfDeadline','rfContact','rfPhone','rfLink','rfNote'].forEach(function (i) { document.getElementById(i).value = ''; });
    document.getElementById('rfUnit').focus();
  } else { f.style.display = 'none'; }
}
function addRadarItem() {
  var unit = document.getElementById('rfUnit').value.trim();
  var name = document.getElementById('rfName').value.trim();
  if (!unit || !name) { toast('单位名称和项目名称为必填', 'err'); return; }
  var item = {
    id: radarEditing || ('r' + Date.now()),
    unit: unit, name: name,
    type: document.getElementById('rfType').value,
    budget: document.getElementById('rfBudget').value.trim(),
    deadline: document.getElementById('rfDeadline').value,
    contact: document.getElementById('rfContact').value.trim(),
    phone: document.getElementById('rfPhone').value.trim(),
    link: document.getElementById('rfLink').value.trim(),
    status: document.getElementById('rfStatus').value,
    note: document.getElementById('rfNote').value.trim(),
    addedAt: radarEditing ? (rget('wb_radar', []).filter(function (x) { return x.id === radarEditing; })[0] || {}).addedAt : new Date().toISOString()
  };
  var list = rget('wb_radar', []);
  if (radarEditing) {
    list = list.map(function (x) { return x.id === radarEditing ? item : x; });
  } else { list.unshift(item); }
  rset('wb_radar', list);
  radarEditing = null;
  document.getElementById('radarForm').style.display = 'none';
  renderRadarLedger(); renderRadarProfile();
  toast('商机已保存', 'ok');
}
function editRadarItem(id) {
  var item = rget('wb_radar', []).filter(function (x) { return x.id === id; })[0];
  if (!item) return;
  radarEditing = id;
  document.getElementById('radarForm').style.display = 'block';
  document.getElementById('rfUnit').value = item.unit;
  document.getElementById('rfName').value = item.name;
  document.getElementById('rfType').value = item.type;
  document.getElementById('rfBudget').value = item.budget;
  document.getElementById('rfDeadline').value = item.deadline || '';
  document.getElementById('rfContact').value = item.contact;
  document.getElementById('rfPhone').value = item.phone;
  document.getElementById('rfLink').value = item.link;
  document.getElementById('rfStatus').value = item.status;
  document.getElementById('rfNote').value = item.note;
  window.scrollTo({ top: document.getElementById('radarForm').offsetTop - 80, behavior: 'smooth' });
}
function delRadarItem(id) {
  if (!confirm('确定删除这条商机？')) return;
  rset('wb_radar', rget('wb_radar', []).filter(function (x) { return x.id !== id; }));
  renderRadarLedger(); renderRadarProfile(); toast('已删除', 'ok');
}
function setRadarStatus(id, status) {
  var list = rget('wb_radar', []).map(function (x) { if (x.id === id) x.status = status; return x; });
  rset('wb_radar', list); renderRadarProfile();
}
function renderRadarLedger() {
  var tbl = document.getElementById('radarLedger');
  if (!tbl) return;
  var list = rget('wb_radar', []);
  var f = document.getElementById('radarFilter').value.trim().toLowerCase();
  var ft = document.getElementById('radarFilterType').value;
  var fs = document.getElementById('radarFilterStatus').value;
  list = list.filter(function (x) {
    if (ft && x.type !== ft) return false;
    if (fs && x.status !== fs) return false;
    if (f && (x.unit + x.name + x.contact).toLowerCase().indexOf(f) < 0) return false;
    return true;
  });
  if (!list.length) { tbl.innerHTML = '<tr><td colspan="9"><div class="empty-tip">暂无匹配的商机，点「➕ 新增商机」把搜到的标讯沉淀下来</div></td></tr>'; return; }
  var rows = list.map(function (x) {
    var stcls = { '待跟进': 'st-wait', '跟进中': 'st-doing', '已投标': 'st-bid', '中标': 'st-win', '未中标': 'st-lose', '放弃': 'st-drop' }[x.status] || 'st-wait';
    var link = x.link ? '<a href="' + esc(x.link) + '" target="_blank">链接</a>' : '—';
    return '<tr>' +
      '<td class="lk-unit">' + esc(x.unit) + '</td>' +
      '<td>' + esc(x.name) + '</td>' +
      '<td><span class="lk-tag">' + esc(x.type) + '</span></td>' +
      '<td>' + esc(x.budget || '—') + '</td>' +
      '<td>' + esc(x.deadline || '—') + '</td>' +
      '<td>' + esc(x.contact || '—') + (x.phone ? '<br>' + esc(x.phone) : '') + '</td>' +
      '<td><select class="mod-input" style="min-width:90px;padding:3px 6px;font-size:12px;" onchange="setRadarStatus(\'' + x.id + '\', this.value)">' +
        ['待跟进','跟进中','已投标','中标','未中标','放弃'].map(function (s) { return '<option' + (s === x.status ? ' selected' : '') + '>' + s + '</option>'; }).join('') +
      '</select></td>' +
      '<td class="lk-link">' + link + '</td>' +
      '<td class="row-act"><button class="icon-btn" title="编辑" onclick="editRadarItem(\'' + x.id + '\')">✏️</button><button class="icon-btn" title="删除" onclick="delRadarItem(\'' + x.id + '\')">🗑️</button></td>' +
      '</tr>';
  }).join('');
  tbl.innerHTML = '<thead><tr><th>单位</th><th>项目</th><th>类型</th><th>预算</th><th>截止</th><th>对接人</th><th>状态</th><th>来源</th><th>操作</th></tr></thead><tbody>' + rows + '</tbody>';
}
function renderRadarProfile() {
  var box = document.getElementById('radarProfile');
  if (!box) return;
  var list = rget('wb_radar', []);
  if (!list.length) { box.innerHTML = '<div class="empty-tip">台账里有数据后，这里会自动生成「谁在持续买活动」的客户画像</div>'; return; }
  var map = {};
  list.forEach(function (x) {
    if (!map[x.unit]) map[x.unit] = { unit: x.unit, count: 0, budget: 0, types: {}, last: '' };
    var m = map[x.unit]; m.count++;
    m.budget += parseBudgetNum(x.budget);
    m.types[x.type] = (m.types[x.type] || 0) + 1;
    var d = x.deadline || (x.addedAt ? x.addedAt.slice(0, 10) : '');
    if (d && d > m.last) m.last = d;
  });
  var arr = Object.values(map).sort(function (a, b) { return b.count - a.count; });
  var max = arr[0].count;
  box.innerHTML = arr.map(function (m) {
    var types = Object.keys(m.types).map(function (t) { return '<span class="lk-tag">' + esc(t) + '×' + m.types[t] + '</span>'; }).join('');
    var pct = Math.max(8, Math.round(m.count / max * 100));
    return '<div class="profile-card">' +
      '<div class="pc-name" title="点击筛选该单位商机" onclick="filterRadarByUnit(\'' + esc(m.unit) + '\')">' + esc(m.unit) + '</div>' +
      '<div class="pc-meta">共 ' + m.count + ' 条 · 约 ' + (m.budget ? m.budget + ' 万' : '—') + ' · 最近 ' + esc(m.last || '—') + '</div>' +
      '<div class="pc-types">' + types + '</div>' +
      '<div class="pc-bar"><span style="width:' + pct + '%"></span></div>' +
      '</div>';
  }).join('');
}
function filterRadarByUnit(unit) {
  document.getElementById('radarFilter').value = unit;
  document.getElementById('radarFilterType').value = '';
  document.getElementById('radarFilterStatus').value = '';
  renderRadarLedger();
  toast('已筛选：' + unit, 'ok');
}
function exportRadarCSV() {
  var list = rget('wb_radar', []);
  if (!list.length) { toast('暂无数据', 'err'); return; }
  var head = ['单位','项目','类型','预算','截止','对接人','电话','状态','来源','备注'];
  var rows = list.map(function (x) { return [x.unit,x.name,x.type,x.budget,x.deadline,x.contact,x.phone,x.status,x.link,x.note]; });
  var csv = '﻿' + head.join(',') + '\n' + rows.map(function (r) {
    return r.map(function (c) { c = c == null ? '' : String(c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(',');
  }).join('\n');
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = '商机台账_' + todayStr() + '.csv'; a.click();
  toast('已导出 CSV', 'ok');
}

/* ============================================================
 *  案例智库
 * ============================================================ */
function renderCaseSources() {
  var box = document.getElementById('caseSources');
  if (!box) return;
  box.innerHTML = CASE_SOURCES.map(function (s) {
    return '<div class="source-card">' +
      '<div class="sc-top"><span class="sc-name">' + esc(s.name) + '</span><span class="src-badge case">案例</span></div>' +
      '<div class="sc-desc">' + esc(s.desc) + '</div>' +
      '<div class="sc-actions"><button class="btn-mod go" onclick="openCaseSearch(\'' + s.id + '\')">🔍 搜这个词</button></div>' +
      '</div>';
  }).join('');
}
function openCaseSearch(id) {
  var src = CASE_SOURCES.filter(function (s) { return s.id === id; })[0];
  if (!src) return;
  var kw = document.getElementById('caseSearchKw').value;
  window.open(buildSearch(src.site, kw), '_blank');
}
function caseSearchAll() {
  var kw = document.getElementById('caseSearchKw').value;
  window.open(buildSearch('', kw), '_blank');
  toast('已在浏览器新标签打开全网搜索', 'ok');
}

/* 本地案例库 */
var caseEditing = null;
function toggleCaseForm() {
  var f = document.getElementById('caseForm');
  if (f.style.display === 'none') {
    f.style.display = 'block'; caseEditing = null;
    ['cfTitle','cfLink','cfTags','cfNote'].forEach(function (i) { document.getElementById(i).value = ''; });
    document.getElementById('cfTitle').focus();
  } else { f.style.display = 'none'; }
}
function addCase() {
  var title = document.getElementById('cfTitle').value.trim();
  if (!title) { toast('案例标题为必填', 'err'); return; }
  var item = {
    id: caseEditing || ('c' + Date.now()),
    title: title,
    type: document.getElementById('cfType').value,
    industry: document.getElementById('cfIndustry').value,
    budget: document.getElementById('cfBudget').value,
    link: document.getElementById('cfLink').value.trim(),
    tags: document.getElementById('cfTags').value.trim(),
    note: document.getElementById('cfNote').value.trim(),
    addedAt: caseEditing ? (rget('wb_cases', []).filter(function (x) { return x.id === caseEditing; })[0] || {}).addedAt : new Date().toISOString()
  };
  var list = rget('wb_cases', []);
  if (caseEditing) list = list.map(function (x) { return x.id === caseEditing ? item : x; });
  else list.unshift(item);
  rset('wb_cases', list);
  caseEditing = null;
  document.getElementById('caseForm').style.display = 'none';
  renderCaseLib(); genCaseBrief();
  toast('案例已保存', 'ok');
}
function editCase(id) {
  var item = rget('wb_cases', []).filter(function (x) { return x.id === id; })[0];
  if (!item) return;
  caseEditing = id;
  document.getElementById('caseForm').style.display = 'block';
  document.getElementById('cfTitle').value = item.title;
  document.getElementById('cfType').value = item.type;
  document.getElementById('cfIndustry').value = item.industry;
  document.getElementById('cfBudget').value = item.budget;
  document.getElementById('cfLink').value = item.link;
  document.getElementById('cfTags').value = item.tags;
  document.getElementById('cfNote').value = item.note;
  window.scrollTo({ top: document.getElementById('caseForm').offsetTop - 80, behavior: 'smooth' });
}
function delCase(id) {
  if (!confirm('确定删除这个案例？')) return;
  rset('wb_cases', rget('wb_cases', []).filter(function (x) { return x.id !== id; }));
  renderCaseLib(); genCaseBrief(); toast('已删除', 'ok');
}
function renderCaseLib() {
  var box = document.getElementById('caseLibrary');
  if (!box) return;
  var list = rget('wb_cases', []);
  var f = document.getElementById('caseFilter').value.trim().toLowerCase();
  var ft = document.getElementById('caseFilterType').value;
  list = list.filter(function (x) {
    if (ft && x.type !== ft) return false;
    if (f && (x.title + x.note + x.tags).toLowerCase().indexOf(f) < 0) return false;
    return true;
  });
  if (!list.length) { box.innerHTML = '<div class="empty-tip">还没有案例，去案例平台搜到好案例后点「➕ 新增案例」沉淀下来</div>'; return; }
  box.innerHTML = list.map(function (x) {
    var link = x.link ? '<a class="cc-link" href="' + esc(x.link) + '" target="_blank">查看原文 ↗</a>' : '';
    return '<div class="case-card">' +
      '<div class="cc-title">' + esc(x.title) + '</div>' +
      '<div class="cc-tags"><span class="cc-tag">' + esc(x.type) + '</span><span class="cc-tag ind">' + esc(x.industry) + '</span><span class="cc-tag bud">' + esc(x.budget) + '</span></div>' +
      (x.tags ? '<div class="cc-tags">' + x.tags.split(/[,，]/).map(function (t) { return '<span class="kw-chip">' + esc(t.trim()) + '</span>'; }).join('') + '</div>' : '') +
      (x.note ? '<div class="cc-note">' + esc(x.note) + '</div>' : '') +
      '<div class="cc-actions"><span>' + link + '</span><span class="icon-btn" onclick="editCase(\'' + x.id + '\')">✏️</span><span class="icon-btn" onclick="delCase(\'' + x.id + '\')">🗑️</span></div>' +
      '</div>';
  }).join('');
}

/* 场景化智能推荐 */
function genCaseSuggest() {
  var box = document.getElementById('caseSuggest');
  if (!box) return;
  var list = rget('wb_cases', []);
  var ft = document.getElementById('caseSuggestType').value;
  var kw = document.getElementById('caseSuggestKw').value.trim().toLowerCase();
  var res = list.filter(function (x) {
    if (ft && x.type !== ft) return false;
    if (kw && (x.title + x.note + x.tags + x.industry).toLowerCase().indexOf(kw) < 0) return false;
    return true;
  });
  if (!list.length) { box.innerHTML = '<div class="empty-tip">案例库还是空的——先去各平台搜几个好案例存进来，推荐才会生效</div>'; return; }
  if (!res.length) { box.innerHTML = '<div class="empty-tip">没有匹配「' + esc(ft || kw || '') + '」的案例，换个类型或关键词试试</div>'; return; }
  box.innerHTML = '<div class="empty-tip" style="border-style:solid;margin-bottom:10px;">为你匹配到 ' + res.length + ' 个相关案例 ✨</div>' + res.map(function (x) {
    return '<div class="case-card"><div class="cc-title">' + esc(x.title) + '</div>' +
      '<div class="cc-tags"><span class="cc-tag">' + esc(x.type) + '</span><span class="cc-tag ind">' + esc(x.industry) + '</span></div>' +
      (x.note ? '<div class="cc-note">' + esc(x.note) + '</div>' : '') +
      (x.link ? '<div class="cc-actions"><a class="cc-link" href="' + esc(x.link) + '" target="_blank">查看原文 ↗</a></div>' : '') + '</div>';
  }).join('');
}

/* 灵感早报（从你的案例库自动汇总） */
function genCaseBrief() {
  var box = document.getElementById('caseBrief');
  if (!box) return;
  var list = rget('wb_cases', []);
  if (!list.length) {
    box.innerHTML = '<div class="empty-tip">案例库为空，早报暂无可汇总内容。去案例平台搜几个存进来，每天点这里就能生成灵感早报。</div>';
    return;
  }
  var byType = {};
  list.forEach(function (x) { byType[x.type] = (byType[x.type] || 0) + 1; });
  var max = Math.max.apply(null, Object.values(byType));
  var bars = Object.keys(byType).map(function (t) {
    return '<div class="bb" style="height:' + Math.max(12, Math.round(byType[t] / max * 70)) + 'px;" title="' + t + '：' + byType[t] + '"><span>' + esc(t) + '</span></div>';
  }).join('');
  var latest = list.slice().sort(function (a, b) { return (b.addedAt || '').localeCompare(a.addedAt || ''); }).slice(0, 3);
  var latestHtml = latest.map(function (x) {
    return '<li><b>' + esc(x.title) + '</b> <span style="color:#6b7280;">（' + esc(x.type) + (x.link ? ' · <a style="color:var(--btn-refresh)" href="' + esc(x.link) + '" target="_blank">原文</a>' : '') + '）</span></li>';
  }).join('');
  var pick = list[Math.floor(Math.random() * list.length)];
  box.innerHTML = '<div class="brief-box"><h4>🌅 ' + todayStr() + ' 灵感早报 · 共 ' + list.length + ' 个案例在库</h4>' +
    '<div style="font-size:12px;color:#6b7280;">类型分布</div><div class="brief-bar">' + bars + '</div>' +
    '<div style="font-size:12px;color:#6b7280;">最近存入</div><ul>' + latestHtml + '</ul>' +
    '<div style="font-size:12px;color:#6b7280;margin-top:10px;">今日随机灵感</div>' +
    '<div class="brief-pick">💡 ' + esc(pick.title) + ' —— ' + esc(pick.note || pick.tags || '值得借鉴其创意') + '</div>' +
    '</div>';
}

/* ---------- 顶层渲染 + 标签委托 ---------- */
function renderRadar() {
  renderRadarSources(); renderRadarKw(); renderRadarChecklist(); renderRadarLedger(); renderRadarProfile();
}
function renderCases() {
  renderCaseSources(); renderCaseLib(); genCaseBrief();
}
document.addEventListener('DOMContentLoaded', function () {
  var bar = document.querySelector('.tab-bar');
  if (bar) {
    bar.addEventListener('click', function (e) {
      var btn = e.target.closest('.tab-btn'); if (!btn) return;
      var t = btn.dataset.tab;
      if (t === 'radar') renderRadar();
      if (t === 'cases') renderCases();
    });
  }
  // 进入页面时预渲染一次（标签未显示也不影响，打开即最新）
  renderRadar(); renderCases();
});
