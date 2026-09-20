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
await new Promise(r => setTimeout(r, 1500));

console.log('── V9：放大编辑推广到「计划 / 欠款 / 分析 / 客户历史」等全部小框 ──');
const TAS = ['d-tomorrow', 'w-debt', 'w-nextplan', 'm-analysis', 'm-debt', 'm-nextplan', 'client-history'];
let bound = 0, chipped = 0;
TAS.forEach(id => {
  const el = document.getElementById(id);
  if (el && el.classList.contains('zoomable-ta')) bound++;
  const lab = el && el.previousElementSibling;
  if (lab && lab.querySelector && lab.querySelector('.zoom-chip')) chipped++;
});
ok(bound === TAS.length, '计划/欠款/分析/客户历史 共 7 个框全部支持放大，实际 ' + bound);
ok(chipped === TAS.length, '这些框的标签旁都加了「⤢ 放大」按钮，实际 ' + chipped);

// 原本的 10 个「其他」框仍然可用（回归）
const OTHERS = ['d-today-other', 'w-week-other-mon', 'w-week-other-tue', 'w-week-other-wed',
  'w-week-other-thu', 'w-week-other-fri', 'm-month-other-week1', 'm-month-other-week2',
  'm-month-other-week3', 'm-month-other-week4'];
let oldBound = 0;
OTHERS.forEach(id => {
  const el = document.getElementById(id);
  if (el && el.classList.contains('zoomable-ta')) oldBound++;
});
ok(oldBound === 10, '原有 10 个「其他」框放大功能未受影响，实际 ' + oldBound);

console.log('\n── 排除项：CSV 批量导入框不劫持 ──');
const csv = document.getElementById('clientCsvInput');
ok(csv && !csv.classList.contains('zoomable-ta') && csv.dataset.zoomBound !== '1', 'CSV 导入框未被绑定放大（保持原样输入）');

console.log('\n── 打开「明日计划」大框，编辑并保存 ──');
const plan = document.getElementById('d-tomorrow');
plan.value = '拜访 A 客户';
plan.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise(r => setTimeout(r, 150));
const ov = document.querySelector('.zoom-overlay');
ok(!!ov && ov.style.display === 'flex', '点击「明日计划」小框弹出放大层');
const bigTa = ov.querySelector('.zoom-ta');
ok(bigTa && bigTa.value === '拜访 A 客户', '大框载入原有内容');

const title = ov.querySelector('.zoom-title').textContent;
ok(/明日计划/.test(title), '大框标题显示来源字段名（' + title.trim() + '）');

const cnt0 = ov.querySelector('.zoom-count');
ok(!!cnt0 && /\d+\s*字/.test(cnt0.textContent), '大框显示实时字数统计（' + (cnt0 ? cnt0.textContent : '无') + '）');

bigTa.value = '拜访 A 客户\n整理报价方案\n跟进工会需求';
bigTa.dispatchEvent(new window.Event('input', { bubbles: true }));
await new Promise(r => setTimeout(r, 60));
ok(/3\s*行/.test(ov.querySelector('.zoom-count').textContent), '字数统计随输入更新为 3 行');

// Ctrl + Enter 保存
bigTa.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
await new Promise(r => setTimeout(r, 150));
ok(plan.value === '拜访 A 客户\n整理报价方案\n跟进工会需求', 'Ctrl + Enter 保存并写回小框');
ok(ov.style.display === 'none', 'Ctrl + Enter 后放大层关闭');

console.log('\n── 单行输入框：只加放大按钮，不劫持单击 ──');
const inp = document.getElementById('d-train-text');
const inpLab = inp && inp.previousElementSibling;
ok(inp && inp.dataset.zoomBound === '1' && inpLab.querySelector('.zoom-chip'), '单行文本字段（培训内容）加了「⤢ 放大」按钮');
inp.value = '原本的输入';
inp.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise(r => setTimeout(r, 150));
ok(document.querySelector('.zoom-overlay').style.display !== 'flex', '单行输入框单击不弹大框（不影响直接输入）');
inpLab.querySelector('.zoom-chip').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise(r => setTimeout(r, 150));
ok(document.querySelector('.zoom-overlay').style.display === 'flex', '点「⤢ 放大」才弹出大框');
document.querySelector('.zoom-overlay .zoom-ta').value = '培训：工会活动执行流程';
document.querySelector('.zoom-overlay [data-act="save"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise(r => setTimeout(r, 150));
ok(inp.value === '培训：工会活动执行流程', '单行字段保存后内容写回');

console.log('\n── 动态生成的编辑框也能放大（模拟弹窗后重新扫描）──');
const dyn = document.createElement('textarea');
dyn.id = 'edit-dynamic-test';
const dynLab = document.createElement('label');
dynLab.textContent = '动态备注';
document.body.appendChild(dynLab);
document.body.appendChild(dyn);
await new Promise(r => setTimeout(r, 900)); // 等待扫描（MutationObserver 节流 250ms / 兜底 5s）
ok(dyn.classList.contains('zoomable-ta'), '新增的编辑框被自动发现并绑定放大');

console.log('\n── 不破坏原有功能：日报草稿联动仍在 ──');
window.localStorage.setItem('wb_drafts', '{}');
const other = document.getElementById('d-today-other');
other.value = '';
other.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise(r => setTimeout(r, 150));
document.querySelector('.zoom-overlay .zoom-ta').value = 'V9 草稿联动';
document.querySelector('.zoom-overlay [data-act="save"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise(r => setTimeout(r, 1200));
const drafts = JSON.parse(window.localStorage.getItem('wb_drafts') || '{}');
const dk = Object.keys(drafts).find(k => k.startsWith('daily::'));
ok(dk && (drafts[dk].fields['d-today-other'] || '').includes('V9 草稿联动'), '大框保存仍触发原有草稿自动保存');

console.log('\n========================');
console.log('通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
