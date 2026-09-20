import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const SERVE = '/Users/mianmian/WorkBuddy/2026-08-08-16-13-19/workbench/serve';
const SHOTS = '/Users/mianmian/WorkBuddy/2026-08-08-16-13-19/workbench/shots';
fs.mkdirSync(SHOTS, { recursive: true });

// 使用 file:// 加载预剥离 CDN 的 serve 目录：完全本地、不触发代理、无请求拦截竞态
const PAGE_URL = 'file://' + SERVE + '/index.html';

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? '  [OK]  ' : '  [FAIL]'} ${name}${detail ? ' — ' + detail : ''}`);
}

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  userDataDir: '/tmp/wb-test-profile-' + Date.now(),
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--allow-file-access-from-files'],
});

const errors = [];
async function newPage(viewport) {
  const p = await browser.newPage();
  await p.setViewport(viewport);
  p.on('console', m => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
  p.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  return p;
}

// ============ 桌面端 ============
console.log('\n=== 桌面端 1440x900 ===');
let page = await newPage({ width: 1440, height: 900 });
await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
await new Promise(r => setTimeout(r, 1200));

check('页面无 JS 报错', errors.length === 0, errors.slice(0, 3).join(' | '));
check('XLSX 库本地加载成功', await page.evaluate(() => typeof XLSX !== 'undefined'));

// 同步徽标
const badge = await page.evaluate(() => {
  const b = document.getElementById('syncBadge');
  return b ? { state: b.dataset.state, text: b.textContent.trim() } : null;
});
check('未配置时显示灰色「未配置云同步」', badge && badge.state === 'unconfigured' && badge.text.includes('未配置'), JSON.stringify(badge));

// 9 个标签页都能打开
const tabs = ['daily', 'weekly', 'monthly', 'projects', 'clients', 'stat', 'annual', 'history', 'recycle'];
for (const t of tabs) {
  await page.evaluate(t => document.querySelector(`.tab-btn[data-tab="${t}"]`).click(), t);
  await new Promise(r => setTimeout(r, 220));
}
const tabErrCount = errors.length;
check('9 个标签页全部可切换且无报错', tabErrCount === 0, errors.slice(0, 3).join(' | '));

// ============ 草稿自动保存 ============
console.log('\n=== 草稿自动保存 ===');
await page.evaluate(() => document.querySelector('.tab-btn[data-tab="daily"]').click());
await new Promise(r => setTimeout(r, 500));

await page.evaluate(() => {
  document.getElementById('d-date').value = '2026-08-08';
  document.getElementById('d-date').dispatchEvent(new Event('change', { bubbles: true }));
});
await new Promise(r => setTimeout(r, 500));

const MARK = '成都工会新春嘉年华-方案对接';
await page.evaluate(m => {
  const set = (id, v) => {
    const el = document.getElementById(id);
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  set('d-follow', '7');
  set('d-interview', '3');
  set('d-call', '18');
  set('d-today-other', m);
  set('d-tomorrow', '明日：拜访市总工会');
}, MARK);
await new Promise(r => setTimeout(r, 1600));

const draftSaved = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('wb_drafts') || '{}');
  return Object.keys(d);
});
check('输入后生成草稿', draftSaved.includes('daily::2026-08-08'), JSON.stringify(draftSaved));

// 重新加载，验证内容还在
await page.reload({ waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 1500));
const restored = await page.evaluate(() => ({
  date: document.getElementById('d-date').value,
  other: document.getElementById('d-today-other').value,
  follow: document.getElementById('d-follow').value,
  call: document.getElementById('d-call').value,
  tip: !!document.querySelector('#panel-daily .draft-tip'),
}));
check('刷新后日期保持', restored.date === '2026-08-08', restored.date);
check('刷新后文本内容未丢失', restored.other === MARK, restored.other);
check('刷新后数字内容未丢失', restored.follow === '7' && restored.call === '18', `follow=${restored.follow} call=${restored.call}`);
check('显示「已恢复未保存的草稿」提示', restored.tip);

// 正式保存后草稿应清除
page.once('dialog', async d => await d.accept());
await page.evaluate(() => saveDaily());
await new Promise(r => setTimeout(r, 700));
const afterSave = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('wb_drafts') || '{}');
  const list = JSON.parse(localStorage.getItem('sport_daily_list') || '[]');
  return { draftKeys: Object.keys(d), saved: list.length, other: (list[0] || {}).todayOther };
});
check('正式保存后草稿自动清除', !afterSave.draftKeys.includes('daily::2026-08-08'), JSON.stringify(afterSave.draftKeys));
check('日报已正式入库', afterSave.saved === 1 && afterSave.other === MARK, JSON.stringify(afterSave));

// ============ 历史按日期折叠 ============
console.log('\n=== 历史记录按日期折叠 ===');
await page.evaluate(() => {
  const daily = [];
  const months = ['2026-06', '2026-07', '2026-08'];
  months.forEach((m, mi) => {
    for (let i = 1; i <= 4; i++) {
      const day = String(i * 5).padStart(2, '0');
      const raw = `${m}-${day}`;
      daily.push({
        date: raw.replace(/-/g, '/'), dateRaw: raw, week: `2026-W${20 + mi * 4 + i}`, month: m, year: 2026,
        follow: i, interview: 1, newdemand: 1, lost: 0, lostReason: '',
        demandList: [], assistList: [], projectList: [],
        call: 10 + i, newcus: 1, marketing: 0, visit: 2, trainNum: 0, trainText: '',
        todayOther: `${m} 第${i}条记录`, tomorrowPlan: '计划'
      });
    }
  });
  localStorage.setItem('sport_daily_list', JSON.stringify(daily));

  const weekly = [];
  [['2026-06', 24], ['2026-07', 28], ['2026-08', 32]].forEach(([m, w]) => {
    for (let i = 0; i < 2; i++) {
      weekly.push({ week: `2026-W${w + i}`, month: m, year: 2026, follow: 1, interview: 1 });
    }
  });
  localStorage.setItem('sport_weekly_list', JSON.stringify(weekly));

  const monthly = [];
  ['2025-11', '2025-12', '2026-01', '2026-07', '2026-08'].forEach(m => {
    monthly.push({ month: m, year: parseInt(m.slice(0, 4)), target: 10, finish: 8 });
  });
  localStorage.setItem('sport_monthly_list', JSON.stringify(monthly));
});
await page.reload({ waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 1200));
await page.evaluate(() => document.querySelector('.tab-btn[data-tab="history"]').click());
await new Promise(r => setTimeout(r, 400));
// 清掉默认月份筛选，才能看到多组
await page.evaluate(() => {
  document.getElementById('history-daily-month').value = '';
  document.getElementById('history-weekly-week').value = '';
  document.getElementById('history-monthly-month').value = '';
  renderAllHistory();
});
await new Promise(r => setTimeout(r, 500));

const hist = await page.evaluate(() => {
  const read = id => Array.from(document.querySelectorAll(`#${id} .hist-group`)).map(g => ({
    label: g.querySelector('.hist-group-head span:nth-child(2)').textContent,
    count: g.querySelector('.cnt').textContent,
    collapsed: g.classList.contains('collapsed'),
  }));
  return { daily: read('history-daily'), weekly: read('history-weekly'), monthly: read('history-monthly') };
});
check('日报按月分组', hist.daily.length === 3, JSON.stringify(hist.daily.map(g => g.label + g.count)));
check('周报按月分组', hist.weekly.length === 3, JSON.stringify(hist.weekly.map(g => g.label + g.count)));
check('月报按年分组', hist.monthly.length === 2, JSON.stringify(hist.monthly.map(g => g.label + g.count)));
check('默认只展开最新一组', hist.daily[0] && !hist.daily[0].collapsed && hist.daily[1].collapsed,
  JSON.stringify(hist.daily.map(g => g.collapsed)));

// 点击折叠头，验证展开/收起 + 状态持久化
await page.evaluate(() => document.querySelector('#history-daily .hist-group:nth-of-type(2) .hist-group-head').click());
await new Promise(r => setTimeout(r, 300));
const afterClick = await page.evaluate(() => {
  const gs = document.querySelectorAll('#history-daily .hist-group');
  return { second: gs[1].classList.contains('collapsed'), store: localStorage.getItem('wb_hist_collapse') };
});
check('点击可展开折叠分组', afterClick.second === false);
check('折叠状态已持久化', (afterClick.store || '').includes('history-daily::'));

// ============ 已完成待办折叠 ============
console.log('\n=== 已完成待办按日期折叠 ===');
await page.evaluate(() => {
  const now = new Date();
  const iso = d => new Date(d).toISOString();
  const todos = [
    { id: 'a1', text: '未完成：对接工会活动方案', important: 3, done: false, order: 1, type: 'daily', source: 'manual', createdAt: iso(now), images: [] },
    { id: 'a2', text: '已完成：提交报价单', important: 2, done: true, order: 2, type: 'daily', source: 'manual', createdAt: iso(now), doneAt: iso(now), images: [] },
    { id: 'a3', text: '已完成：昨天的对账', important: 1, done: true, order: 3, type: 'daily', source: 'manual', createdAt: iso(now - 86400000), doneAt: new Date(Date.now() - 86400000).toISOString(), images: [] },
  ];
  localStorage.setItem('sport_todos', JSON.stringify(todos));
  renderTodos();
});
await new Promise(r => setTimeout(r, 400));
const todoGrp = await page.evaluate(() => {
  const g = document.querySelector('#todoDailyList .todo-done-group');
  return g ? {
    head: g.querySelector('.todo-done-head').textContent.trim(),
    collapsed: g.classList.contains('collapsed'),
    dates: Array.from(g.querySelectorAll('.todo-done-date')).map(d => d.textContent),
    undone: document.querySelectorAll('#todoDailyList > li.todo-item:not(.done)').length,
  } : null;
});
check('已完成待办生成折叠分组', !!todoGrp && todoGrp.head.includes('已完成（2）'), JSON.stringify(todoGrp && todoGrp.head));
check('已完成待办按日期二级分组', todoGrp && todoGrp.dates.length === 2, JSON.stringify(todoGrp && todoGrp.dates));
check('未完成待办仍在顶层正常显示', todoGrp && todoGrp.undone === 1, String(todoGrp && todoGrp.undone));

// ============ 云同步失败态 ============
console.log('\n=== 云同步状态标识 ===');
await page.evaluate(() => {
  localStorage.setItem('wb_sync_cfg', JSON.stringify({
    url: 'https://invalid-project-does-not-exist.supabase.co', key: 'fake-key', space: 'test-space'
  }));
});
await page.reload({ waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 6000));
const offline = await page.evaluate(() => {
  const b = document.getElementById('syncBadge');
  const banner = document.getElementById('wbSyncBanner');
  return {
    state: b.dataset.state, text: b.textContent.trim(),
    banner: !!(banner && banner.classList.contains('show')),
  };
});
check('连不上云端时徽标变红「未连接」', offline.state === 'offline' && offline.text.includes('未连接'), JSON.stringify(offline));
check('连不上云端时顶部显示醒目横幅', offline.banner);

await page.screenshot({ path: `${SHOTS}/01-desktop-offline.png`, fullPage: false });

// 清掉配置，恢复未配置态并截图
await page.evaluate(() => localStorage.removeItem('wb_sync_cfg'));
await page.reload({ waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: `${SHOTS}/02-desktop-daily.png`, fullPage: false });

await page.evaluate(() => {
  document.querySelector('.tab-btn[data-tab="history"]').click();
  document.getElementById('history-daily-month').value = '';
  document.getElementById('history-weekly-week').value = '';
  document.getElementById('history-monthly-month').value = '';
  renderAllHistory();
});
await new Promise(r => setTimeout(r, 600));
await page.screenshot({ path: `${SHOTS}/03-desktop-history.png`, fullPage: false });

await page.evaluate(() => openSyncModal());
await new Promise(r => setTimeout(r, 400));
await page.screenshot({ path: `${SHOTS}/04-desktop-sync-modal.png`, fullPage: false });
await page.evaluate(() => closeSyncModal());

// ============ 移动端 ============
console.log('\n=== 移动端 390x844 (iPhone) ===');
const mobile = await newPage({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await mobile.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
await new Promise(r => setTimeout(r, 1500));

const mob = await mobile.evaluate(() => {
  const tb = document.querySelector('.tab-bar');
  return {
    hOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
    scrollW: document.documentElement.scrollWidth, winW: window.innerWidth,
    tabScrollable: tb.scrollWidth > tb.clientWidth,
    badgeVisible: document.getElementById('syncBadge').getBoundingClientRect().width > 0,
    inputFont: getComputedStyle(document.getElementById('d-follow')).fontSize,
  };
});
check('移动端无横向溢出', mob.hOverflow, `scrollW=${mob.scrollW} winW=${mob.winW}`);
check('标签栏横向滚动可用', mob.tabScrollable);
check('同步徽标在手机端可见', mob.badgeVisible);
check('输入框 16px（避免 iOS 缩放）', mob.inputFont === '16px', mob.inputFont);

await mobile.screenshot({ path: `${SHOTS}/05-mobile-daily.png`, fullPage: false });
await mobile.evaluate(() => document.querySelector('.tab-btn[data-tab="history"]').click());
await new Promise(r => setTimeout(r, 500));
await mobile.screenshot({ path: `${SHOTS}/06-mobile-history.png`, fullPage: false });
await mobile.evaluate(() => openSyncModal());
await new Promise(r => setTimeout(r, 400));
await mobile.screenshot({ path: `${SHOTS}/07-mobile-sync-modal.png`, fullPage: false });

// 暗色模式
await mobile.evaluate(() => { closeSyncModal(); toggleDarkMode(); });
await new Promise(r => setTimeout(r, 400));
await mobile.screenshot({ path: `${SHOTS}/08-mobile-dark.png`, fullPage: false });

await browser.close();

console.log('\n================ 汇总 ================');
const failed = results.filter(r => !r.pass);
console.log(`通过 ${results.length - failed.length}/${results.length}`);
if (failed.length) {
  failed.forEach(f => console.log(`  ✗ ${f.name} — ${f.detail}`));
  process.exit(1);
}
if (errors.length) {
  console.log('\n控制台报错：');
  errors.slice(0, 10).forEach(e => console.log('  ' + e));
}
console.log('全部通过 ✅');
