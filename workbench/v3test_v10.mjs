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
    window.confirm = () => true;
    window.alert = () => {};
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

const V = id => { const el = document.getElementById(id); return el ? el.value : null; };

console.log('── Bug1：周报保存后再次打开能回填（原来保存了看不到）──');
window.localStorage.setItem('sport_weekly_list', JSON.stringify([{
  week: '2026-W38', target: 100, finish: 80, diff: '-20.00',
  debt: '欠款A', cusmanage: '客情B', trainText: '培训C', nextPlan: '下周计划D'
}]));
document.getElementById('w-week').value = '2026-W38';
window.loadWeekAutoData();
await new Promise(r => setTimeout(r, 200));
ok(V('w-debt') === '欠款A', '周报「欠款」已回填（' + V('w-debt') + '）');
ok(V('w-cusmanage') === '客情B', '周报「客情」已回填');
ok(V('w-train-text') === '培训C', '周报「培训内容」已回填');
ok(V('w-nextplan') === '下周计划D', '周报「下周计划」已回填');
ok(V('w-target') === '100' && V('w-finish') === '80', '周报「目标/完成」已回填');
ok(V('w-diff') === '-20.00', '回填后「差额」自动重算（' + V('w-diff') + '）');

console.log('\n── Bug2：月报保存后再次打开能回填 ──');
window.localStorage.setItem('sport_monthly_list', JSON.stringify([{
  month: '2026-09', target: 200, finish: 260, debt: '月欠款', analysis: '业绩分析X', nextPlan: '下月计划Y'
}]));
document.getElementById('m-month').value = '2026-09';
window.loadMonthAutoData();
await new Promise(r => setTimeout(r, 200));
ok(V('m-debt') === '月欠款', '月报「欠款」已回填');
ok(V('m-analysis') === '业绩分析X', '月报「业绩分析」已回填');
ok(V('m-nextplan') === '下月计划Y', '月报「下月计划」已回填');
ok(V('m-diff') === '60.00', '月报「差额」自动重算（' + V('m-diff') + '）');

console.log('\n── 升级：刷新汇总时保留手工补充的「其他」行（不被清空）──');
window.localStorage.setItem('sport_weekly_list', '[]');
document.getElementById('w-week-other-mon').value = '手工补充的一行';
window.loadWeekAutoData();
await new Promise(r => setTimeout(r, 200));
ok(/手工补充的一行/.test(V('w-week-other-mon') || ''), '刷新汇总后手工补充行仍保留（' + V('w-week-other-mon') + '）');

console.log('\n── Bug3：编辑历史弹窗 改「完成」后差额实时重算 ──');
document.body.insertAdjacentHTML('beforeend',
  '<input id="edit-target" value="100"><input id="edit-finish" value="100"><input id="edit-diff" value="0">');
const fin = document.getElementById('edit-finish');
fin.value = '250';
fin.dispatchEvent(new window.Event('input', { bubbles: true }));
await new Promise(r => setTimeout(r, 100));
ok(V('edit-diff') === '150.00', '编辑弹窗差额随完成额实时更新（' + V('edit-diff') + '）');

console.log('\n── Bug4：跟进记录点「最新一条」的删除，删的是最新的那条 ──');
window.localStorage.setItem('sport_clients', JSON.stringify([{
  name: '测试客户', role: 'A', closeness: '高', followUps: [
    { time: '2026-01-01 10:00', content: '旧记录' },
    { time: '2026-02-01 10:00', content: '新记录' }
  ]
}]));
window.editClient('测试客户');
await new Promise(r => setTimeout(r, 250));
const items = document.querySelectorAll('#edit-client-followups .followup-item');
ok(items.length === 2, '编辑弹窗渲染 2 条跟进记录');
ok(/新记录/.test(items[0].textContent || ''), '第 1 行显示的是最新记录（倒序）');
window.deleteClientFollowUp(Number(items[0].dataset.idx));
await new Promise(r => setTimeout(r, 250));
const left = JSON.parse(window.localStorage.getItem('sport_clients') || '[]')[0].followUps;
ok(left.length === 1 && left[0].content === '旧记录', '删掉的是「新记录」，保留「旧记录」（实际剩：' + (left[0] || {}).content + '）');

console.log('\n── Bug5：继承昨日 —— 明日计划 / 今日其他 / 丢单原因 / 培训 都能继承 ──');
window.localStorage.setItem('sport_daily_list', JSON.stringify([
  { dateRaw: '2026-09-19', date: '2026-09-19', week: '2026-W38', month: '2026-09',
    tomorrowPlan: '昨日写好的明日计划', todayOther: '昨日其他工作', lostReason: '价格',
    trainNum: 3, trainText: '工会活动培训', follow: 5, newcus: 2 }
]));
document.getElementById('d-date').value = '2026-09-20';
document.getElementById('d-tomorrow').value = '';
document.getElementById('d-today-other').value = '';
window.inheritYesterday();
await new Promise(r => setTimeout(r, 250));
ok(V('d-tomorrow') === '昨日写好的明日计划', '「明日计划」继承成功（' + V('d-tomorrow') + '）');
ok(V('d-today-other') === '昨日其他工作', '「今日其他工作」继承成功');
ok(V('d-lost-reason') === '价格', '「丢单原因」继承成功（原来因 id 拼错不继承）');
ok(V('d-train-text') === '工会活动培训', '「培训内容」继承成功');
ok(V('d-train-num') === '3', '「培训数量」继承成功');

console.log('\n── Bug6：待办勾选/取消 记录时间戳（让多端同步能分辨最新操作）──');
window.localStorage.setItem('sport_todos', JSON.stringify([{ id: 'tt1', text: '待办1', type: 'daily', done: false }]));
window.toggleTodo('tt1');
await new Promise(r => setTimeout(r, 200));
const t1 = JSON.parse(window.localStorage.getItem('sport_todos') || '[]').find(t => t.id === 'tt1');
ok(t1 && t1.done === true, '勾选后变为已完成');
ok(t1 && typeof t1.doneTs === 'number' && t1.doneTs > 0, '勾选记录了 doneTs 时间戳');
window.toggleTodo('tt1');
await new Promise(r => setTimeout(r, 200));
const t2 = JSON.parse(window.localStorage.getItem('sport_todos') || '[]').find(t => t.id === 'tt1');
ok(t2 && t2.done === false, '再次点击可取消完成');
ok(t2 && t2.doneTs >= t1.doneTs, '取消完成也更新时间戳（同步时能分辨最新操作）');

console.log('\n========================');
console.log('通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
