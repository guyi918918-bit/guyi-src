import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';

const DIST = '/Users/mianmian/WorkBuddy/2026-08-08-16-13-19/workbench/dist';
const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf-8');

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ✅ ' + l); } else { fail++; console.log('  ❌ ' + l); } };

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'https://wb.local/',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.XLSX = {};
    window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => {} });
    window.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
  },
});
const { window, window: { document } } = dom;

await new Promise(r => {
  if (document.readyState === 'complete' || document.readyState === 'interactive') return r();
  window.addEventListener('DOMContentLoaded', () => r());
  setTimeout(r, 2500);
});
await new Promise(r => setTimeout(r, 1200));

console.log('── 需求2：进入页面默认显示「日常工作」──');
const workPanel = document.getElementById('panel-work');
const dashPanel = document.getElementById('panel-dash');
ok(workPanel && workPanel.classList.contains('show'), '日常工作板块默认显示（panel-work 有 show）');
ok(dashPanel && !dashPanel.classList.contains('show'), '情报搜集板块默认不显示');
const todoBoard = document.getElementById('todoBoard');
ok(todoBoard && todoBoard.style.display !== 'none', '待办看板默认可见（随日常工作显示）');
const activeTab = document.querySelector('.top-tab.active');
ok(activeTab && activeTab.dataset.tab === 'work', '顶部导航高亮为「日常工作」');
const dailySub = document.getElementById('panel-daily');
ok(dailySub && dailySub.classList.contains('show'), '日常工作内默认展开「日报」子页');

console.log('\n── 需求1：「其他」框点击放大编辑 ──');
const FIELDS = ['d-today-other', 'w-week-other-mon', 'w-week-other-tue', 'w-week-other-wed',
  'w-week-other-thu', 'w-week-other-fri', 'm-month-other-week1', 'm-month-other-week2',
  'm-month-other-week3', 'm-month-other-week4'];
let bound = 0, chipped = 0;
FIELDS.forEach(id => {
  const el = document.getElementById(id);
  if (el && el.classList.contains('zoomable-ta')) bound++;
  const lab = el && el.previousElementSibling;
  if (lab && lab.querySelector && lab.querySelector('.zoom-chip')) chipped++;
});
ok(bound === 10, '10 个「其他」框均已绑定放大（日报1+周报5+月报4），实际 ' + bound);
ok(chipped === 10, '每个框的标签旁都加了「⤢ 放大」按钮，实际 ' + chipped);

// 点击日报「今日其他工作」→ 弹出大框
const ta = document.getElementById('d-today-other');
ta.value = '原始内容';
ta.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise(r => setTimeout(r, 120));
const ov = document.querySelector('.zoom-overlay');
ok(!!ov && ov.style.display === 'flex', '点击小框后弹出放大编辑层');
const bigTa = ov && ov.querySelector('.zoom-ta');
ok(bigTa && bigTa.value === '原始内容', '大框载入原有内容');

// 在大框里编辑 → 保存 → 写回小框
bigTa.value = '原始内容\n新增一行内容';
const saveBtn = ov.querySelector('[data-act="save"]');
saveBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise(r => setTimeout(r, 120));
ok(ta.value === '原始内容\n新增一行内容', '保存后内容写回小框');
ok(ov.style.display === 'none', '保存后放大层关闭');

// 取消 → 不改动
ta.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise(r => setTimeout(r, 120));
const big2 = document.querySelector('.zoom-overlay .zoom-ta');
big2.value = '不该被保存的内容';
document.querySelector('.zoom-overlay [data-act="cancel"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise(r => setTimeout(r, 120));
ok(ta.value === '原始内容\n新增一行内容', '取消后小框内容保持不变');

// Esc 关闭且保存
ta.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise(r => setTimeout(r, 120));
document.querySelector('.zoom-overlay .zoom-ta').value = 'Esc 保存的内容';
document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
await new Promise(r => setTimeout(r, 120));
ok(ta.value === 'Esc 保存的内容', 'Esc 关闭时保存内容');

console.log('\n── 不破坏原有功能：写回触发草稿自动保存 ──');
window.localStorage.setItem('wb_drafts', '{}');
ta.value = '';
ta.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise(r => setTimeout(r, 120));
document.querySelector('.zoom-overlay .zoom-ta').value = '草稿联动测试';
document.querySelector('.zoom-overlay [data-act="save"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise(r => setTimeout(r, 1200)); // 草稿自动保存防抖 700ms
const drafts = JSON.parse(window.localStorage.getItem('wb_drafts') || '{}');
const dk = Object.keys(drafts).find(k => k.startsWith('daily::'));
ok(dk && (drafts[dk].fields['d-today-other'] || '').includes('草稿联动测试'), '大框保存后草稿自动同步（原有草稿机制未被破坏）');

console.log('\n========================');
console.log('通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
