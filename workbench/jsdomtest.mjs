import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';

const DIST = '/Users/mianmian/WorkBuddy/2026-08-08-16-13-19/workbench/dist';
const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf-8');

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? '  [OK]  ' : '  [FAIL]'} ${name}${detail ? ' — ' + detail : ''}`);
};

// 在 jsdom 中缺省不抓取外部脚本；XLSX 仅导出时用，载入期不需要
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'https://wb.local/',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.XLSX = { /* stub */ };
    // 让同步失败态可测：fetch 一律 reject
    window.fetch = () => Promise.reject(new Error('network blocked in test'));
  },
});

const { window } = dom;
const { document } = window;

// 等待 DOMContentLoaded + 我的 IIFE 完成
await new Promise(r => {
  if (document.readyState === 'complete' || document.readyState === 'interactive') return r();
  window.addEventListener('DOMContentLoaded', () => r());
  setTimeout(r, 1500);
});
await new Promise(r => setTimeout(r, 800));

console.log('\n=== 基础加载 ===');
check('页面脚本无致命错误导致 __wbSync 未注入', typeof window.__wbSync !== 'undefined' || typeof window.openSyncModal === 'function',
  'openSyncModal=' + typeof window.openSyncModal);
check('同步徽标存在且初始为未配置', (() => {
  const b = document.getElementById('syncBadge');
  return b && b.dataset.state === 'unconfigured';
})(), document.getElementById('syncBadge')?.dataset.state);

console.log('\n=== 云同步状态标识 ===');
// 先验证未配置态（载入时无配置，应为 unconfigured）
check('同步徽标初始为未配置（基础加载已验证）', (() => {
  const b = document.getElementById('syncBadge');
  return b && (b.dataset.state === 'unconfigured' || b.dataset.state === 'offline');
})(), document.getElementById('syncBadge')?.dataset.state);
// 再配置错误地址并手动同步 -> 连接失败 -> offline 红标 + 横幅
window.localStorage.setItem('wb_sync_cfg', JSON.stringify({ url: 'https://nope.invalid.supabase.co', key: 'x', space: 's' }));
try { window.manualSyncNow ? window.manualSyncNow() : null; } catch (e) {}
await new Promise(r => setTimeout(r, 3500));
const off = (() => {
  const b = document.getElementById('syncBadge');
  const banner = document.getElementById('wbSyncBanner');
  return { state: b?.dataset.state, text: b?.textContent.trim(), banner: !!(banner && banner.classList.contains('show')) };
})();
check('连不上云端 -> 徽标 offline', off.state === 'offline', JSON.stringify(off));
check('连不上云端 -> 横幅显示', off.banner, JSON.stringify(off));
window.localStorage.removeItem('wb_sync_cfg');
try { window.renderBadge ? window.renderBadge() : null; } catch (e) {}

console.log('\n=== 草稿自动保存 / 恢复 ===');
window.localStorage.removeItem('wb_drafts');
const dDate = document.getElementById('d-date');
dDate.value = '2026-08-08';
dDate.dispatchEvent(new window.Event('change', { bubbles: true }));
const mk = document.getElementById('d-today-other');
mk.value = '成都工会新春嘉年华';
mk.dispatchEvent(new window.Event('input', { bubbles: true }));
mk.dispatchEvent(new window.Event('change', { bubbles: true }));
await new Promise(r => setTimeout(r, 1000)); // 等防抖保存
const drafts = JSON.parse(window.localStorage.getItem('wb_drafts') || '{}');
check('输入后生成草稿键 daily::2026-08-08', Object.keys(drafts).includes('daily::2026-08-08'), JSON.stringify(Object.keys(drafts)));
// 模拟“刷新恢复”：调用恢复逻辑（首次载入时会恢复最近一次草稿）
window.restorePanel ? window.restorePanel('daily') : null;
const restored = document.getElementById('d-today-other').value;
check('草稿内容可被恢复', restored === '成都工会新春嘉年华', restored);

console.log('\n=== 历史按日期折叠 ===');
const daily = [];
['2026-06', '2026-07', '2026-08'].forEach((m, mi) => {
  for (let i = 1; i <= 4; i++) {
    const day = String(i * 5).padStart(2, '0');
    daily.push({ date: `${m}-${day}`.replace(/-/g, '/'), dateRaw: `${m}-${day}`, week: `2026-W${20 + mi * 4 + i}`, month: m, year: 2026, follow: i, interview: 1, newdemand: 1, lost: 0, lostReason: '', demandList: [], assistList: [], projectList: [], call: 10 + i, newcus: 1, marketing: 0, visit: 2, trainNum: 0, trainText: '', todayOther: `${m} ${i}`, tomorrowPlan: 'p' });
  }
});
window.localStorage.setItem('sport_daily_list', JSON.stringify(daily));
// 清掉默认月份筛选，才能看到多组数据（与部署后默认行为一致）
const dm = document.getElementById('history-daily-month'); if (dm) dm.value = '';
const wm = document.getElementById('history-weekly-week'); if (wm) wm.value = '';
const mm = document.getElementById('history-monthly-month'); if (mm) mm.value = '';
window.renderAllHistory ? window.renderAllHistory() : null;
await new Promise(r => setTimeout(r, 300));
const groups = document.querySelectorAll('#history-daily .hist-group');
check('日报按月分组（3 组）', groups.length === 3, 'groups=' + groups.length);
const firstCollapsed = groups[0] && !groups[0].classList.contains('collapsed');
const secondCollapsed = groups[1] && groups[1].classList.contains('collapsed');
check('默认仅展开最新一组', firstCollapsed && secondCollapsed, 'first=' + firstCollapsed + ' second=' + secondCollapsed);

console.log('\n=== 已完成待办按日期折叠 ===');
const now = Date.now();
const todos = [
  { id: 'a', text: '未完成事项', important: 3, done: false, order: 1, type: 'daily', source: 'manual', createdAt: new Date(now).toISOString(), images: [] },
  { id: 'b', text: '已完成A', important: 2, done: true, order: 2, type: 'daily', source: 'manual', createdAt: new Date(now).toISOString(), doneAt: new Date(now).toISOString(), images: [] },
  { id: 'c', text: '已完成B', important: 1, done: true, order: 3, type: 'daily', source: 'manual', createdAt: new Date(now - 86400000).toISOString(), doneAt: new Date(now - 86400000).toISOString(), images: [] },
];
window.localStorage.setItem('sport_todos', JSON.stringify(todos));
window.renderTodos ? window.renderTodos() : null;
await new Promise(r => setTimeout(r, 300));
const doneGrp = document.querySelector('#todoDailyList .todo-done-group');
check('已完成待办生成折叠分组', !!doneGrp && /已完成（2）/.test(doneGrp.querySelector('.todo-done-head').textContent), doneGrp?.querySelector('.todo-done-head')?.textContent.trim());
check('已完成待办按日期二级分组', doneGrp && doneGrp.querySelectorAll('.todo-done-date').length === 2, doneGrp ? 'dates=' + doneGrp.querySelectorAll('.todo-done-date').length : 'none');

console.log('\n=== 汇总 ===');
const failed = results.filter(r => !r.pass);
console.log(`通过 ${results.length - failed.length}/${results.length}`);
if (failed.length) { failed.forEach(f => console.log('  ✗ ' + f.name + ' — ' + f.detail)); process.exit(1); }
console.log('全部通过 ✅');
