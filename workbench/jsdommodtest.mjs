import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';

const DIST = path.resolve('dist');
const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf-8');

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? '  [OK]  ' : '  [FAIL]'} ${name}${detail ? ' — ' + detail : ''}`);
}

const dom = await JSDOM.fromFile(path.join(DIST, 'index.html'), {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/',
  beforeParse(window) {
    window.XLSX = {};
    window.fetch = () => Promise.reject(new Error('offline test'));
    window.scrollTo = () => {};
    window.confirm = () => true;
    window.alert = () => {};
    window.open = () => null;
  },
});
const { window } = dom;
const { document } = window;

// 等待 DOMContentLoaded 后的渲染
await new Promise(r => setTimeout(r, 600));

// 1) 面板与标签存在
check('panel-radar 存在', !!document.getElementById('panel-radar'));
check('panel-cases 存在', !!document.getElementById('panel-cases'));
check('两个新 tab 按钮', document.querySelectorAll('.tab-btn[data-tab="radar"], .tab-btn[data-tab="cases"]').length === 2);

// 2) 雷达：来源卡 / 巡检 / 关键词
check('雷达来源卡 7 张', document.querySelectorAll('#radarSources .source-card').length === 7, '实际 ' + document.querySelectorAll('#radarSources .source-card').length);
check('巡检清单 6 项', document.querySelectorAll('#radarChecklist .check-item').length === 6);
check('关键词 chips 已渲染', document.querySelectorAll('#radarKwChips .kw-chip').length > 10, 'chips=' + document.querySelectorAll('#radarKwChips .kw-chip').length);
check('默认关键词已落库', (window.localStorage.getItem('wb_radar_kw') || '').includes('职工运动会'));

// 3) 新增商机台账
document.getElementById('rfUnit').value = '成都高新区某街道办';
document.getElementById('rfName').value = '中秋游园会采购';
document.getElementById('rfType').value = '招标公告';
document.getElementById('rfBudget').value = '15万';
document.getElementById('rfDeadline').value = '2026-08-15';
document.getElementById('rfContact').value = '王科长';
document.getElementById('rfStatus').value = '待跟进';
window.addRadarItem();
await new Promise(r => setTimeout(r, 100));
check('台账新增 1 行', document.querySelectorAll('#radarLedger tbody tr').length === 1, 'rows=' + document.querySelectorAll('#radarLedger tbody tr').length);
check('客户画像生成 1 卡', document.querySelectorAll('#radarProfile .profile-card').length === 1);
check('台账已存入 localStorage', JSON.parse(window.localStorage.getItem('wb_radar')).length === 1);

// 4) 巡检勾选
const cb = document.querySelector('#radarChecklist input[type=checkbox]');
cb.checked = true;
window.toggleRadarCheck('tfyg', true);
await new Promise(r => setTimeout(r, 50));
check('巡检进度更新', /1 \/ 6|已巡检/.test(document.getElementById('radarCheckProgress').textContent));

// 5) 案例库
document.getElementById('cfTitle').value = '上海趣味运动会爆款案例';
document.getElementById('cfType').value = '职工运动会';
document.getElementById('cfIndustry').value = '金融银行';
document.getElementById('cfBudget').value = '20-50万';
document.getElementById('cfTags').value = '互动,破圈';
document.getElementById('cfNote').value = '用闯关打卡替代传统拔河';
window.addCase();
await new Promise(r => setTimeout(r, 100));
check('案例库新增 1 卡', document.querySelectorAll('#caseLibrary .case-card').length === 1, 'cards=' + document.querySelectorAll('#caseLibrary .case-card').length);

// 6) 灵感早报（自动汇总）
window.genCaseBrief();
check('灵感早报已生成', !!document.querySelector('#caseBrief .brief-box') && /灵感早报/.test(document.getElementById('caseBrief').textContent));

// 7) 场景化推荐
document.getElementById('caseSuggestType').value = '职工运动会';
window.genCaseSuggest();
check('场景推荐命中', document.querySelectorAll('#caseSuggest .case-card').length === 1, 'matched=' + document.querySelectorAll('#caseSuggest .case-card').length);

// 8) 同步键已纳入（setStorage 包装会把新键写进 localStorage；此处验证键存在）
check('wb_radar 已生成', !!window.localStorage.getItem('wb_radar'));
check('wb_cases 已生成', !!window.localStorage.getItem('wb_cases'));

// 汇总
const failed = results.filter(r => !r.pass);
console.log('\n===== 模块功能测试：' + (results.length - failed.length) + '/' + results.length + ' 通过 =====');
process.exit(failed.length ? 1 : 0);
