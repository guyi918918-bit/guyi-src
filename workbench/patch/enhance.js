  <!-- ==================================================================
       增强模块：Supabase 云同步 · 草稿自动保存 · 历史按日期折叠
       ================================================================== -->
  <script>
    (function () {
      'use strict';

      /* ============================================================
       * 0. 基础工具
       * ============================================================ */
      var CFG_KEY = 'wb_sync_cfg';
      var COLLAPSE_KEY = 'wb_hist_collapse';
      var DRAFT_KEY = 'wb_drafts';
      var BACKUP_KEY = 'wb_pre_sync_backup';
      var TABLE = 'wb_kv';

      // 参与云同步的 localStorage 键
      var SYNC_KEYS = [
        'sport_daily_list', 'sport_weekly_list', 'sport_monthly_list',
        'sport_annual_stat', 'sport_clients', 'sport_projects',
        'sport_recycle_bin', 'sport_todos', DRAFT_KEY,
        'wb_radar', 'wb_radar_kw', 'wb_radar_check', 'wb_cases',
        'wb_intel_links', 'wb_intel_link_order',
        'wb_insp_links', 'wb_insp_link_order'
      ];

      function $(id) { return document.getElementById(id); }

      function debounce(fn, ms) {
        var t;
        return function () {
          var self = this, args = arguments;
          clearTimeout(t);
          t = setTimeout(function () { fn.apply(self, args); }, ms);
        };
      }

      function toast(msg, type) {
        var wrap = $('wbToastWrap');
        if (!wrap) return;
        var el = document.createElement('div');
        el.className = 'wb-toast' + (type ? ' ' + type : '');
        el.textContent = msg;
        wrap.appendChild(el);
        setTimeout(function () {
          el.style.transition = 'opacity .3s';
          el.style.opacity = '0';
          setTimeout(function () { el.remove(); }, 320);
        }, type === 'err' ? 4200 : 2400);
      }

      // [UX] 统一反馈：原生 alert 重定向为非阻塞 toast（审查优化）
      (function () {
        var OK_RE = /✅|成功|已保存|已添加|已连接|已完成|已恢复|已导出|已导入|已更新|拉取成功|同步成功|已复制|已生成|已写入|已应用/;
        var ERR_RE = /失败|错误|不存在|无效|不能为空|请(输入|选择|填写)|无法|异常|冲突|超时|网络|拒绝|未配置|不正确|已存在|为空|不完整/;
        window.alert = function (msg) {
          msg = String(msg == null ? '' : msg);
          var type = 'info';
          if (OK_RE.test(msg)) type = 'ok';
          else if (ERR_RE.test(msg)) type = 'err';
          toast(msg, type);
        };
      })();

      // 静默执行：临时屏蔽 alert，用于自动保存复用原有保存函数
      function silent(fn) {
        var a = window.alert, c = window.confirm;
        window.alert = function () {};
        window.confirm = function () { return true; };
        try { fn(); } catch (e) { console.warn('[silent]', e); }
        finally { window.alert = a; window.confirm = c; }
      }

      function readRaw(key) {
        var s = localStorage.getItem(key);
        if (s === null) return null;
        try { return JSON.parse(s); } catch (e) { return null; }
      }

      /* ============================================================
       * 0b. 图片压缩（防止 base64 原图撑爆 Supabase 免费云空间）
       *     - 仅对写入云端的「图片型」键生效：sport_todos / sport_recycle_bin
       *     - 最长边缩到 1280px、JPEG q0.72；<250KB 的原图直接跳过（无损）
       *     - 幂等：压缩后再次进入不会二次处理，绝不死循环
       *     - 显示功能不受影响（仍按压缩后的 dataURL 渲染 / 查看大图）
       * ============================================================ */
      var IMAGE_KEYS = ['sport_todos', 'sport_recycle_bin'];
      var _shrinking = {};
      var COMPRESS_MAX = 1280;
      var COMPRESS_QUALITY = 0.72;
      var COMPRESS_THRESHOLD = 250 * 1024; // 估算字节；仅压缩明显偏大的图片

      function hasCanvas() {
        try { var c = document.createElement('canvas'); return !!(c && c.getContext && c.getContext('2d')); }
        catch (e) { return false; }
      }

      function compressDataUrl(dataUrl) {
        return new Promise(function (resolve) {
          if (!/^data:image\//.test(dataUrl)) { resolve(dataUrl); return; }
          if (dataUrl.length * 0.75 < COMPRESS_THRESHOLD) { resolve(dataUrl); return; }
          if (!hasCanvas()) { resolve(dataUrl); return; }
          var done = false;
          var finish = function (v) { if (!done) { done = true; resolve(v); } };
          var timer = setTimeout(function () { finish(dataUrl); }, 2500); // jsdom/异常兜底，绝不卡死
          var img = new Image();
          img.onload = function () {
            try {
              var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
              if (!w || !h) { clearTimeout(timer); finish(dataUrl); return; }
              var scale = Math.min(1, COMPRESS_MAX / Math.max(w, h));
              var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
              var c = document.createElement('canvas');
              c.width = cw; c.height = ch;
              var ctx = c.getContext('2d');
              ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cw, ch); // PNG 透明转白底
              ctx.drawImage(img, 0, 0, cw, ch);
              var out = c.toDataURL('image/jpeg', COMPRESS_QUALITY);
              clearTimeout(timer);
              finish(out && out.length < dataUrl.length ? out : dataUrl);
            } catch (e) { clearTimeout(timer); finish(dataUrl); }
          };
          img.onerror = function () { clearTimeout(timer); finish(dataUrl); };
          img.src = dataUrl;
        });
      }

      // 压缩数组内每条记录的 images（原地替换）；返回 {arr, changed} 或 null
      function shrinkImages(arr) {
        if (!arr || !arr.length) return Promise.resolve(null);
        var jobs = [];
        for (var i = 0; i < arr.length; i++) {
          var item = arr[i];
          if (item && Array.isArray(item.images) && item.images.length) {
            for (var j = 0; j < item.images.length; j++) {
              if (typeof item.images[j] === 'string' && item.images[j].indexOf('data:image') === 0) {
                jobs.push({ item: item, idx: j, val: item.images[j] });
              }
            }
          }
        }
        if (!jobs.length) return Promise.resolve(null);
        return jobs.reduce(function (p, job) {
          return p.then(function () {
            return compressDataUrl(job.val).then(function (out) {
              if (out !== job.val) { job.item.images[job.idx] = out; job.changed = true; }
            });
          });
        }, Promise.resolve()).then(function () {
          var changed = jobs.some(function (j) { return j.changed; });
          return changed ? { arr: arr, changed: true } : null;
        });
      }

      // 迁移：压缩某个图片键当前在 localStorage 中的数据，并触发一次同步回写云端
      function migrateShrinkStored() {
        IMAGE_KEYS.forEach(function (key) {
          if (_shrinking[key]) return;
          var arr = readRaw(key);
          if (!arr || !arr.length) return;
          _shrinking[key] = true;
          shrinkImages(arr).then(function (res) {
            _shrinking[key] = false;
            if (res && res.changed) {
              _origSetStorage(key, res.arr);
              if (!Sync.applying) { Sync.dirty[key] = true; schedulePush(); }
            }
          }).catch(function () { _shrinking[key] = false; });
        });
      }

      /* ============================================================
       * 0c. 存储自维护策略（防止免费云空间随时间无限膨胀）
       *     - 回收站：超过上限时仅保留「最近 N 条」，更早的自动清理
       *     - 日报：超过 dailyArchiveYears 年的自动「归档」到本地独立键
       *       （移出云同步键，云端不再保存 → 释放云空间；本地仍保留）
       *     幂等、可手动触发，也会每日自动运行一次（节流）。
       * ============================================================ */
      var MAINT = {
        recycleCap: 300,                 // 回收站最多保留的最近条数（更早的自动清理）
        dailyArchiveYears: 1,            // 日报超过该年数自动归档到本机
        archiveKey: 'sport_daily_archive', // 本地归档键（不参与云同步）
        lastRunKey: 'wb_maint_ts',
        minGapMs: 24 * 3600 * 1000,      // 自动运行最小间隔：1 天
        // ⚠️ 受保护的核心业务数据：绝不被任何归档/清理策略触碰，始终完整保留在云端
        protectedKeys: ['sport_clients', 'sport_projects']
      };

      function dateRawToTs(d) {
        if (!d) return 0;
        var s = String(d).trim().replace(/\//g, '-');
        var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
        if (m) return Date.parse(m[1] + '-' + m[2] + '-' + m[3] + 'T00:00:00');
        var t = Date.parse(s);
        return isNaN(t) ? 0 : t;
      }

      // 回收站裁剪：超过上限时仅保留最近的 recycleCap 条（按 deletedAt）
      function trimRecycle() {
        var SRC_KEY = 'sport_recycle_bin';
        if (MAINT.protectedKeys.indexOf(SRC_KEY) >= 0) return 0; // 刚性保护：受保护键绝不清理
        var bin = readRaw(SRC_KEY);
        if (!Array.isArray(bin) || bin.length <= MAINT.recycleCap) return 0;
        bin.sort(function (a, b) {
          var ta = a && a.deletedAt ? Date.parse(a.deletedAt) : 0;
          var tb = b && b.deletedAt ? Date.parse(b.deletedAt) : 0;
          if (isNaN(ta)) ta = 0;
          if (isNaN(tb)) tb = 0;
          return ta - tb; // 老的在前
        });
        var removed = bin.length - MAINT.recycleCap;
        setStorage('sport_recycle_bin', bin.slice(bin.length - MAINT.recycleCap));
        return removed;
      }

      // 日报归档：超过 N 年的日报移出云同步键，存入本地归档键（释放云空间，本地仍保留）
      // ⚠️ 仅处理 sport_daily_list；客户管理(sport_clients)/项目(sport_projects) 永不归档，始终保留在云端
      function archiveOldDaily() {
        var SRC_KEY = 'sport_daily_list';
        if (MAINT.protectedKeys.indexOf(SRC_KEY) >= 0) return 0; // 刚性保护：受保护键绝不归档
        var list = readRaw(SRC_KEY);
        if (!Array.isArray(list) || !list.length) return 0;
        var cutoff = Date.now() - MAINT.dailyArchiveYears * 365 * 24 * 3600 * 1000;
        var keep = [], old = [];
        list.forEach(function (d) {
          var t = dateRawToTs(d.dateRaw || d.date);
          if (t && t < cutoff) old.push(d); else keep.push(d);
        });
        if (!old.length) return 0;
        var arch = readRaw(MAINT.archiveKey);
        if (!Array.isArray(arch)) arch = [];
        var seen = {};
        arch.forEach(function (d) { var k = d.dateRaw || d.date; if (k) seen[k] = true; });
        old.forEach(function (d) { var k = d.dateRaw || d.date; if (!seen[k]) { arch.push(d); seen[k] = true; } });
        try { localStorage.setItem(MAINT.archiveKey, JSON.stringify(arch)); } catch (e) { /* 本地归档失败不影响主流程 */ }
        setStorage('sport_daily_list', keep); // 移出云端同步键中超期部分，释放云空间
        return old.length;
      }

      function runStorageMaintenance(manual) {
        try {
          var removed = trimRecycle();
          var archived = archiveOldDaily();
          try { localStorage.setItem(MAINT.lastRunKey, String(Date.now())); } catch (e) {}
          var msg = [];
          if (removed) msg.push('清理回收站 ' + removed + ' 条旧记录');
          if (archived) msg.push('归档 ' + archived + ' 条超 1 年日报（已移至本机）');
          if (msg.length) {
            toast('🧹 ' + msg.join('，'), 'ok');
            try { if (window.renderRecycleBin) window.renderRecycleBin(); } catch (e) {}
            try { if (window.renderAllHistory) window.renderAllHistory(); } catch (e) {}
            renderStatusBox();
          } else if (manual) {
            toast('✅ 云空间已是最优状态，无需整理', 'ok');
          }
          return { removed: removed, archived: archived };
        } catch (e) {
          console.warn('[maint]', e);
          if (manual) toast('整理失败：' + (e && e.message || e), 'err');
          return { removed: 0, archived: 0 };
        }
      }
      window.runStorageMaintenance = runStorageMaintenance;
      window.archiveOldDaily = archiveOldDaily;

      function maybeAutoMaintain() {
        var last = 0;
        try { last = parseInt(localStorage.getItem(MAINT.lastRunKey) || '0', 10) || 0; } catch (e) {}
        if (Date.now() - last < MAINT.minGapMs) return;
        runStorageMaintenance(false);
      }

      /* ============================================================
       * 0d. 云端空间占用面板（估算 Supabase wb_kv 各键体积）
       * ============================================================ */
      var FREE_LIMIT = 500 * 1024 * 1024; // Supabase 免费版 500MB

      function formatBytes(n) {
        if (!n || n < 0) return '0 B';
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10 * 1024 ? 2 : 1) + ' KB';
        return (n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 2 : 1) + ' MB';
      }

      function storageBytesOf(key) {
        try {
          var s = localStorage.getItem(key);
          return s ? new Blob([s]).size : 0;
        } catch (e) { return 0; }
      }

      // 统计某个键里 base64 图片的体积（用于提示用户哪类数据最占空间）
      function imageBytesIn(key) {
        var arr = readRaw(key);
        if (!Array.isArray(arr)) return 0;
        var bytes = 0;
        arr.forEach(function (item) {
          if (item && Array.isArray(item.images)) {
            item.images.forEach(function (img) {
              if (typeof img === 'string') bytes += img.length;
            });
          }
        });
        return bytes;
      }

      function calcStorageStats() {
        var groups = [
          { name: '主数据表', icon: '💾', keys: ['sport_daily_list', 'sport_weekly_list', 'sport_monthly_list', 'sport_annual_stat', 'sport_clients', 'sport_projects', 'sport_todos'] },
          { name: '回收站', icon: '🗑️', keys: ['sport_recycle_bin'] },
          { name: '情报与链接', icon: '🔗', keys: ['wb_radar', 'wb_radar_kw', 'wb_radar_check', 'wb_cases', 'wb_intel_links', 'wb_intel_link_order', 'wb_insp_links', 'wb_insp_link_order'] },
          { name: '草稿与雷达', icon: '📝', keys: [DRAFT_KEY] }
        ];
        var total = 0;
        groups.forEach(function (g) {
          g.bytes = 0;
          g.keys.forEach(function (k) { g.bytes += storageBytesOf(k); });
          total += g.bytes;
        });
        var imgBytes = imageBytesIn('sport_todos') + imageBytesIn('sport_recycle_bin');
        var archiveBytes = storageBytesOf(MAINT.archiveKey);
        return {
          total: total,
          groups: groups,
          imageBytes: imgBytes,
          archiveBytes: archiveBytes,
          limit: FREE_LIMIT,
          percent: total / FREE_LIMIT
        };
      }

      function renderStoragePanel() {
        var st = calcStorageStats();
        var rowsHtml = st.groups.map(function (g) {
          var pct = st.total ? (g.bytes / st.total * 100).toFixed(1) : '0.0';
          var pctOfFree = (g.bytes / st.limit * 100).toFixed(4);
          return '<div class="storage-row"><span class="storage-row-icon">' + g.icon + '</span><span class="storage-row-name">' + g.name + '</span><span class="storage-row-size">约 ' + formatBytes(g.bytes) + '</span><span class="storage-row-pct">占免费 500MB 的 ' + pctOfFree + '%</span></div>';
        }).join('');

        function ringSvg(pct) {
          pct = Math.max(0, Math.min(1, pct || 0));
          var r = 26, c = 2 * Math.PI * r, off = c * (1 - pct);
          var col = pct > 0.8 ? '#c45c5c' : (pct > 0.5 ? '#e0a458' : '#00b894');
          return '<svg class="storage-ring" viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">' +
            '<circle cx="32" cy="32" r="' + r + '" fill="none" stroke="#ececf0" stroke-width="6"/>' +
            '<circle cx="32" cy="32" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="6" stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 32 32)"/>' +
            '<text x="32" y="37" text-anchor="middle" font-size="13" font-weight="700" fill="#1d1d1f">' + (pct * 100).toFixed(1) + '%</text></svg>';
        }
        var ringHtml = '<div class="storage-ring-wrap">' + ringSvg(st.percent) + '<span class="storage-ring-label">占免费额度<br>' + formatBytes(st.total) + '</span></div>';

        var lastRun = 0;
        try { lastRun = parseInt(localStorage.getItem(MAINT.lastRunKey) || '0', 10) || 0; } catch (e) {}
        var lastRunTxt = lastRun ? new Date(lastRun).toLocaleString('zh-CN') : '尚未整理';

        return '<div class="storage-panel">' +
          '<div class="storage-head"><span class="storage-head-icon">💽</span><span class="storage-head-title">云端空间占用（Supabase 免费版 500MB）</span></div>' + ringHtml +
          '<div class="storage-card">' + rowsHtml +
            '<div class="storage-total">合计约 <b>' + formatBytes(st.total) + '</b> · 占免费额度 <b>' + (st.percent * 100).toFixed(4) + '%</b></div>' +
            (st.imageBytes ? '<div class="storage-img-note">图片附件约 ' + formatBytes(st.imageBytes) + '（已自动压缩）</div>' : '') +
          '</div>' +
          '<div class="storage-actions">' +
            '<button class="btn-sm" type="button" onclick="runStorageMaintenance(true)">🧹 整理云空间</button>' +
            '<button class="btn-sm" type="button" onclick="archiveOldDaily();renderStatusBox();toast(\'✅ 已归档超 1 年日报到本机\', \'ok\');">✂️ 归档 1 年前日报</button>' +
          '</div>' +
          '<div class="storage-foot">' +
            '上次整理：' + lastRunTxt + '<br>' +
            '策略：待办/回收站图片自动压缩；回收站保留最近 ' + MAINT.recycleCap + ' 条；日报超 ' + MAINT.dailyArchiveYears + ' 年自动归档至本机（释放云空间）。' +
            '<br><b style="color:var(--primary,#0066cc);">客户管理、项目始终保留在云端，不参与任何归档或清理。</b>' +
            (st.archiveBytes ? ' 本地归档占用 ' + formatBytes(st.archiveBytes) + '（不计入云端）。' : '') +
          '</div>' +
          '</div>';
      }

      /* ============================================================
       * 1. 云同步状态机
       * ============================================================ */
      var Sync = {
        cfg: null,            // {url, key, space}
        state: 'unconfigured',// unconfigured | connecting | online | syncing | offline
        dirty: {},            // key -> true，本地已改待推送
        serverTs: {},         // key -> 服务端 updated_at
        lastSync: 0,
        lastError: '',
        timer: null,
        applying: false       // 正在应用远端数据，避免回环
      };

      function loadCfg() {
        try {
          var raw = localStorage.getItem(CFG_KEY);
          if (!raw) return null;
          var c = JSON.parse(raw);
          if (c && c.url && c.key && c.space) return c;
        } catch (e) {}
        return null;
      }

      function setState(s, err) {
        Sync.state = s;
        Sync.lastError = err || '';
        renderBadge();
      }

      function renderBadge() {
        var badge = $('syncBadge'), text = $('syncBadgeText');
        if (!badge || !text) return;
        var map = {
          unconfigured: ['unconfigured', '未配置云同步'],
          connecting: ['syncing', '连接中…'],
          syncing: ['syncing', '同步中…'],
          online: ['online', '已连接云端'],
          offline: ['offline', '未连接 · 仅本地']
        };
        var m = map[Sync.state] || map.unconfigured;
        badge.setAttribute('data-state', m[0]);
        var label = m[1];
        if (Sync.state === 'online' && Sync.lastSync) {
          var d = new Date(Sync.lastSync);
          label = '已连接云端 · ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        }
        text.textContent = label;
        badge.title = Sync.state === 'offline'
          ? ('同步失败：' + (Sync.lastError || '网络不可用') + '（点击查看设置）')
          : (Sync.cfg ? '空间：' + Sync.cfg.space + '（点击管理云同步）' : '点击配置云端同步');

        renderBanner();
        renderStatusBox();
      }

      function renderBanner() {
        var banner = $('wbSyncBanner');
        if (!banner) {
          banner = document.createElement('div');
          banner.id = 'wbSyncBanner';
          banner.className = 'sync-banner';
          banner.innerHTML = '<span>⚠️ <b>云端未连接</b>，当前修改仅保存在本机，其他设备看不到。</span>' +
            '<button type="button">重新连接</button>';
          banner.querySelector('button').addEventListener('click', function () { connect(true); });
          var header = document.querySelector('.header');
          if (header && header.parentNode) header.parentNode.insertBefore(banner, header.nextSibling);
        }
        banner.classList.toggle('show', Sync.state === 'offline');
      }

      function renderStatusBox() {
        var box = $('syncStatusBox');
        if (!box) return;
        var stateText = {
          unconfigured: '⚪ 未配置 —— 数据仅保存在本机',
          connecting: '🟡 正在连接…',
          syncing: '🟡 同步中…',
          online: '🟢 已连接 —— 多设备自动同步中',
          offline: '🔴 未连接 —— 数据仅保存在本机'
        }[Sync.state];
        var meta = [];
        meta.push('<b>当前状态：</b>' + stateText);
        if (Sync.cfg) {
          meta.push('<b>同步空间：</b>' + Sync.cfg.space);
          meta.push('<b>本设备：</b>' + deviceLabel());
        }
        if (Sync.lastSync) meta.push('<b>最后同步：</b>' + new Date(Sync.lastSync).toLocaleString('zh-CN'));
        if (Sync.lastError) meta.push('<b style="color:#b91c1c;">错误：</b>' + Sync.lastError);
        var pending = Object.keys(Sync.dirty).length;
        if (pending) meta.push('<b>待上传：</b>' + pending + ' 项');

        var panel = '';
        if (Sync.cfg) panel = renderStoragePanel();

        box.innerHTML = '<div class="sync-meta-lines">' + meta.join('<br>') + '</div>' + panel;
      }
      window.renderStatusBox = renderStatusBox; // 暴露给存储面板内联按钮

      function deviceLabel() {
        var ua = navigator.userAgent;
        var os = /iPhone|iPad|iPod/i.test(ua) ? 'iOS' :
          /Android/i.test(ua) ? 'Android' :
          /Mac OS X/i.test(ua) ? 'Mac' :
          /Windows/i.test(ua) ? 'Windows' : '其他';
        var kind = /Mobi|Android|iPhone|iPod/i.test(ua) ? '手机' : (/iPad|Tablet/i.test(ua) ? '平板' : '电脑');
        return os + ' · ' + kind;
      }

      /* ============================================================
       * 2. Supabase REST 读写
       * ============================================================ */
      function normUrl(raw) {
        if (!raw) return '';
        var s = String(raw).trim();
        // 去掉可能多填的 /rest/v1 及之后，以及任何多余路径，只保留 scheme+host
        s = s.replace(/\/rest\/v1\b.*$/i, '');
        s = s.replace(/\/+$/, '');
        try {
          var u = new URL(s);
          if (!u.host) return s;
          return u.origin;
        } catch (e) { return s; }
      }

      function endpoint(qs) {
        return normUrl(Sync.cfg.url) + '/rest/v1/' + TABLE + (qs || '');
      }

      function headers(extra) {
        var h = {
          'apikey': Sync.cfg.key,
          'Authorization': 'Bearer ' + Sync.cfg.key,
          'Content-Type': 'application/json'
        };
        if (extra) for (var k in extra) h[k] = extra[k];
        return h;
      }

      function fetchWithTimeout(url, opts, ms) {
        var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        if (ctrl) opts.signal = ctrl.signal;
        var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms || 15000);
        return fetch(url, opts).then(function (r) { clearTimeout(timer); return r; },
          function (e) { clearTimeout(timer); throw e; });
      }

      function remoteFetchAll() {
        var url = endpoint('?space=eq.' + encodeURIComponent(Sync.cfg.space) + '&select=k,v,updated_at');
        return fetchWithTimeout(url, { method: 'GET', headers: headers() })
          .then(function (r) {
            if (!r.ok) return r.text().then(function (t) { throw new Error('HTTP ' + r.status + ' ' + t.slice(0, 160)); });
            return r.json();
          });
      }

      function remoteUpsert(rows) {
        var url = endpoint('?on_conflict=space,k');
        return fetchWithTimeout(url, {
          method: 'POST',
          headers: headers({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
          body: JSON.stringify(rows)
        }).then(function (r) {
          if (!r.ok) return r.text().then(function (t) { throw new Error('HTTP ' + r.status + ' ' + t.slice(0, 160)); });
          return true;
        });
      }

      /* ============================================================
       * 3. 拉取 / 推送
       * ============================================================ */
      var refreshUI = debounce(function () {
        try { if (window.renderTodos) renderTodos(); } catch (e) {}
        try { if (window.updateClientDatalist) updateClientDatalist(); } catch (e) {}
        try { if (panelShown('clients') && !isEditingIn('panel-clients') && window.renderClients) renderClients(); } catch (e) {}
        try { if (panelShown('projects') && !isEditingIn('panel-projects') && window.renderProjects) renderProjects(); } catch (e) {}
        try { if (panelShown('recycle') && window.renderRecycleBin) renderRecycleBin(); } catch (e) {}
        try { if (panelShown('history') && window.renderAllHistory) renderAllHistory(); } catch (e) {}
        try { if (panelShown('stat') && window.calcAllStat) { calcAllStat(); if (window.drawTrendChart) drawTrendChart(); } } catch (e) {}
        try { if (panelShown('annual') && !isEditingIn('panel-annual') && window.renderAnnualTable) { renderAnnualTable(); calcAnnualTotal(); } } catch (e) {}
        // 报表面板：用户正在输入时不打断
        try { if (panelShown('daily') && !isEditingIn('panel-daily') && window.loadDailyData) loadDailyData(); } catch (e) {}
      }, 300);

      function panelShown(name) {
        var p = $('panel-' + name);
        return !!(p && p.classList.contains('show'));
      }

      function isEditingIn(panelId) {
        var p = $(panelId), a = document.activeElement;
        return !!(p && a && p.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName));
      }

      function applyRemote(key, value) {
        Sync.applying = true;
        try {
          localStorage.setItem(key, JSON.stringify(value));
        } finally {
          Sync.applying = false;
        }
      }

      function hasLocalData() {
        for (var i = 0; i < SYNC_KEYS.length; i++) {
          var v = readRaw(SYNC_KEYS[i]);
          if (v && ((Array.isArray(v) && v.length) || (!Array.isArray(v) && Object.keys(v).length))) return true;
        }
        return false;
      }

      function pull(isFirst) {
        if (!Sync.cfg) return Promise.resolve();
        return remoteFetchAll().then(function (rows) {
          var changed = 0;
          var cloudKeys = {};
          var imageChanged = false;
          (rows || []).forEach(function (r) { cloudKeys[r.k] = r; });

          // 首次连接：云端已有数据而本地也有数据 -> 先做一份本地快照兜底
          if (isFirst && rows && rows.length && hasLocalData() && !localStorage.getItem(BACKUP_KEY)) {
            var snap = {};
            SYNC_KEYS.forEach(function (k) { snap[k] = localStorage.getItem(k); });
            snap.__at = new Date().toISOString();
            try { localStorage.setItem(BACKUP_KEY, JSON.stringify(snap)); } catch (e) {}
            toast('已为本机数据创建同步前快照', 'ok');
          }

          SYNC_KEYS.forEach(function (k) {
            var r = cloudKeys[k];
            if (!r) {
              // 云端没有：本地有内容则标记推送
              var lv = readRaw(k);
              if (lv && ((Array.isArray(lv) && lv.length) || (!Array.isArray(lv) && Object.keys(lv).length))) {
                Sync.dirty[k] = true;
              }
              return;
            }
            if (Sync.dirty[k]) return;                 // 本地有未推送改动，本地优先
            if (Sync.serverTs[k] === r.updated_at) return; // 未变化
            // 云端为空而本地有数据：不覆盖本地，改为把本地推上去
            // （修复：云同步拉到空数组时曾把本地有效数据清空且无法自愈）
            var lv2 = readRaw(k);
            var lvEmpty = !lv2 || (Array.isArray(lv2) && !lv2.length) || (!Array.isArray(lv2) && !Object.keys(lv2).length);
            var rvEmpty = !r.v || (Array.isArray(r.v) && !r.v.length);
            if (rvEmpty && !lvEmpty) {
              Sync.dirty[k] = true;
              return;
            }
            applyRemote(k, r.v);
            Sync.serverTs[k] = r.updated_at;
            changed++;
            if (IMAGE_KEYS.indexOf(k) >= 0) imageChanged = true;
          });

          // 拉取到的图片数据先压缩再保留/同步，避免原图撑爆 Supabase 免费空间
          if (imageChanged) migrateShrinkStored();

          if (changed) refreshUI();
          return changed;
        });
      }

      function push() {
        if (!Sync.cfg) return Promise.resolve(0);
        var keys = Object.keys(Sync.dirty);
        if (!keys.length) return Promise.resolve(0);
        var now = new Date().toISOString();
        var rows = keys.map(function (k) {
          var v = readRaw(k);
          return { space: Sync.cfg.space, k: k, v: v === null ? [] : v, updated_at: now };
        });
        return remoteUpsert(rows).then(function () {
          keys.forEach(function (k) { delete Sync.dirty[k]; Sync.serverTs[k] = now; });
          return keys.length;
        });
      }

      var syncing = false;

      function syncCycle(isFirst, loud) {
        if (!Sync.cfg || syncing) return Promise.resolve();
        syncing = true;
        var wasOnline = Sync.state === 'online';
        setState(wasOnline && !loud ? 'online' : (isFirst ? 'connecting' : 'syncing'));
        if (loud) setState('syncing');

        return push()
          .then(function (n) { return pull(isFirst).then(function (m) { return { up: n, down: m }; }); })
          .then(function (res) {
            Sync.lastSync = Date.now();
            setState('online');
            if (loud) toast('同步完成：上传 ' + res.up + ' 项 / 更新 ' + res.down + ' 项', 'ok');
            else if (isFirst) toast('云端已连接（空间：' + Sync.cfg.space + '）', 'ok');
          })
          .catch(function (e) {
            var msg = (e && e.message) || String(e);
            if (/Failed to fetch|NetworkError|aborted|abort/i.test(msg)) msg = '网络不可达或地址错误';
            if (/relation .*wb_kv.* does not exist|PGRST205|Could not find the table/i.test(msg)) msg = '数据表 wb_kv 不存在，请先在 SQL Editor 执行建表语句';
            if (/PGRST125|Invalid path/i.test(msg)) msg = '找不到数据表 wb_kv（PGRST125）：该 URL 指向的项目里没有这张表 —— 确认建表 SQL 是在本项目执行的，且 Table Editor 中可见 public.wb_kv；若表已存在，请到 Database 页点「刷新 schema 缓存」';
            if (/JWT|Invalid API key|401|invalid_?key/i.test(msg)) msg = 'API Key 无效或已失效';
            setState('offline', msg);
            if (loud) toast('同步失败：' + msg, 'err');
          })
          .then(function () { syncing = false; });
      }

      function startTimer() {
        stopTimer();
        Sync.timer = setInterval(function () {
          if (document.hidden) return;
          syncCycle(false, false);
          maybeAutoMaintain();
        }, 8000);
      }

      function stopTimer() {
        if (Sync.timer) { clearInterval(Sync.timer); Sync.timer = null; }
      }

      function connect(loud) {
        Sync.cfg = loadCfg();
        if (!Sync.cfg) { stopTimer(); setState('unconfigured'); return; }
        if (!navigator.onLine) { setState('offline', '设备当前离线'); return; }
        setState('connecting');
        syncCycle(true, false).then(function () {
          if (Sync.state === 'online') startTimer();
          migrateShrinkStored(); // 首次同步后压缩本地既有图片，回收历史占用
          maybeAutoMaintain();   // 首次同步后执行存储自维护（每日最多一次）
        });
      }

      var schedulePush = debounce(function () {
        if (!Sync.cfg) return;
        syncCycle(false, false);
      }, 1200);

      /* ============================================================
       * 4. 劫持 setStorage：本地写入 -> 标记待同步
       * ============================================================ */
      var _origSetStorage = window.setStorage;
      window.setStorage = function (key, arr) {
        _origSetStorage(key, arr);
        var isImageKey = IMAGE_KEYS.indexOf(key) >= 0;
        // 普通同步键：直接标记待推送
        if (!Sync.applying && SYNC_KEYS.indexOf(key) >= 0 && !isImageKey) {
          Sync.dirty[key] = true;
          renderStatusBox();
          schedulePush();
        }
        // 图片键：先压缩再同步，避免原图撑爆 Supabase 免费空间
        // 本地先存原图，压缩完成后回写更小的版本并触发一次同步
        if (!Sync.applying && isImageKey && !_shrinking[key]) {
          _shrinking[key] = true;
          shrinkImages(arr).then(function (res) {
            _shrinking[key] = false;
            if (res && res.changed) _origSetStorage(key, res.arr);
            // 确保云端最终拿到压缩版（或至少保留数据）
            Sync.dirty[key] = true;
            renderStatusBox();
            schedulePush();
          }).catch(function () { _shrinking[key] = false; });
        }
      };

      function markDirty(key) {
        if (SYNC_KEYS.indexOf(key) >= 0) {
          Sync.dirty[key] = true;
          schedulePush();
        }
      }
      window.markDirty = markDirty;

      /* ============================================================
       * 5. 设置弹窗对外接口
       * ============================================================ */
      window.openSyncModal = function () {
        var c = loadCfg() || {};
        $('syncUrl').value = c.url || '';
        $('syncKey').value = c.key || '';
        // 未配置过则自动建议一个随机空间 ID，避免手敲出错（可改）
        if (!c.space) {
          var rnd = Math.random().toString(36).slice(2, 10);
          $('syncSpace').value = 'wb-' + rnd;
        } else {
          $('syncSpace').value = c.space;
        }
        renderStatusBox();
        $('syncModal').classList.add('active');
      };

      window.closeSyncModal = function () { $('syncModal').classList.remove('active'); };

      window.saveSyncConfig = function () {
        var url = normUrl($('syncUrl').value);
        var key = $('syncKey').value.trim();
        var space = $('syncSpace').value.trim();
        if (!url || !key || !space) { alert('请完整填写 Project URL、anon key 和同步空间 ID'); return; }
        if (!/^https?:\/\//i.test(url)) { alert('Project URL 需要以 https:// 开头'); return; }
        localStorage.setItem(CFG_KEY, JSON.stringify({ url: url, key: key, space: space }));
        Sync.serverTs = {};
        SYNC_KEYS.forEach(function (k) {
          var v = readRaw(k);
          if (v && ((Array.isArray(v) && v.length) || (!Array.isArray(v) && Object.keys(v).length))) Sync.dirty[k] = true;
        });
        connect(true);
        toast('配置已保存，正在连接…');
      };

      window.testSyncConnection = function () {
        var url = normUrl($('syncUrl').value);
        var key = $('syncKey').value.trim();
        if (!url || !key) { alert('请先填写 Project URL 和 anon key'); return; }
        var saved = Sync.cfg;
        Sync.cfg = { url: url, key: key, space: $('syncSpace').value.trim() || 'test' };
        remoteFetchAll().then(function () {
          toast('连接成功，数据表可正常读写 ✅', 'ok');
          Sync.cfg = saved;
        }).catch(function (e) {
          var m = (e && e.message) || String(e);
          if (/Could not find the table|PGRST205|does not exist/i.test(m)) m = '连接成功，但找不到数据表 wb_kv —— 请先执行建表 SQL';
          else if (/PGRST125|Invalid path/i.test(m)) {
            m = '该项目里没有 wb_kv 表 —— 已自动复制建表 SQL，去 Supabase 左侧 SQL Editor 粘贴运行即可（同项目！）';
            // 自动展开指引并复制 SQL，省去来回找
            try { var d = document.querySelector('#syncModal .sync-help'); if (d) d.open = true; } catch (e2) {}
            try { copySyncSql(); } catch (e2) {}
          }
          else if (/401|JWT|Invalid API key/i.test(m)) m = 'API Key 无效';
          else if (/Failed to fetch/i.test(m)) m = '无法访问该地址，请检查 Project URL';
          toast('测试失败：' + m, 'err');
          Sync.cfg = saved;
        });
      };

      window.manualSyncNow = function () {
        if (!loadCfg()) { alert('请先保存云同步配置'); return; }
        Sync.cfg = loadCfg();
        syncCycle(false, true);
      };

      window.disconnectSync = function () {
        if (!confirm('确定断开云同步并清除本机保存的连接配置吗？\n（本地数据不会被删除）')) return;
        localStorage.removeItem(CFG_KEY);
        Sync.cfg = null;
        Sync.dirty = {};
        Sync.serverTs = {};
        Sync.lastSync = 0;
        stopTimer();
        setState('unconfigured');
        toast('已断开云同步，当前为本地模式');
      };

      window.copySyncSql = function () {
        var txt = $('syncSqlBox').textContent;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(txt).then(function () { toast('SQL 已复制', 'ok'); },
            function () { fallbackCopy(txt); });
        } else fallbackCopy(txt);
      };

      function fallbackCopy(txt) {
        var ta = document.createElement('textarea');
        ta.value = txt;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); toast('SQL 已复制', 'ok'); }
        catch (e) { toast('复制失败，请手动选中复制', 'err'); }
        ta.remove();
      }

      /* ============================================================
       * 6. 草稿自动保存（日报 / 周报 / 月报）
       * ============================================================ */
      var DRAFT_PANELS = {
        daily: { panel: 'panel-daily', keyEl: 'd-date' },
        weekly: { panel: 'panel-weekly', keyEl: 'w-week' },
        monthly: { panel: 'panel-monthly', keyEl: 'm-month' }
      };

      function getDrafts() {
        var d = readRaw(DRAFT_KEY);
        return (d && typeof d === 'object' && !Array.isArray(d)) ? d : {};
      }

      function setDrafts(d) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
        markDirty(DRAFT_KEY);
      }

      function capturePanel(panelId) {
        var p = $(panelId);
        if (!p) return null;
        var fields = {};
        p.querySelectorAll('input[id], select[id], textarea[id]').forEach(function (el) {
          if (el.type === 'file' || el.type === 'button' || el.type === 'submit') return;
          if (el.readOnly) return;
          fields[el.id] = (el.type === 'checkbox' || el.type === 'radio') ? !!el.checked : el.value;
        });
        var tables = {};
        p.querySelectorAll('table[id]').forEach(function (t) {
          try { tables[t.id] = window.readTable ? readTable(t.id) : []; } catch (e) {}
        });
        return { fields: fields, tables: tables, savedAt: Date.now() };
      }

      function restorePanel(panelId, snap) {
        var p = $(panelId);
        if (!p || !snap) return;
        Object.keys(snap.tables || {}).forEach(function (tid) {
          if (!$(tid) || !window.fillTableFromRows) return;
          try { fillTableFromRows(tid, snap.tables[tid] || [], false, false); } catch (e) {}
        });
        Object.keys(snap.fields || {}).forEach(function (fid) {
          var el = $(fid);
          if (!el || el.readOnly) return;
          var v = snap.fields[fid];
          if (el.type === 'checkbox' || el.type === 'radio') el.checked = !!v;
          else el.value = v;
        });
      }

      function draftKeyOf(type) {
        var conf = DRAFT_PANELS[type];
        var el = $(conf.keyEl);
        return el && el.value ? (type + '::' + el.value) : null;
      }

      function saveDraft(type) {
        var dk = draftKeyOf(type);
        if (!dk) return;
        var snap = capturePanel(DRAFT_PANELS[type].panel);
        if (!snap) return;
        var drafts = getDrafts();
        drafts[dk] = snap;

        // 只保留最近 80 份草稿，避免无限膨胀
        var ks = Object.keys(drafts);
        if (ks.length > 80) {
          ks.sort(function (a, b) { return (drafts[a].savedAt || 0) - (drafts[b].savedAt || 0); });
          ks.slice(0, ks.length - 80).forEach(function (k) { delete drafts[k]; });
        }
        setDrafts(drafts);
        flashSaved(type);
      }

      function applyDraft(type) {
        var dk = draftKeyOf(type);
        if (!dk) { showDraftTip(type, false); return; }
        var drafts = getDrafts();
        var snap = drafts[dk];
        if (!snap) { showDraftTip(type, false); return; }
        restorePanel(DRAFT_PANELS[type].panel, snap);
        showDraftTip(type, true);
        try { if (window.updateLevelStats) updateLevelStats(); } catch (e) {}
        try {
          if (type === 'weekly' && window.calcWeekDiff) calcWeekDiff();
          if (type === 'monthly' && window.calcMonthDiff) calcMonthDiff();
        } catch (e) {}
      }

      function clearDraft(type) {
        var dk = draftKeyOf(type);
        if (!dk) return;
        var drafts = getDrafts();
        if (drafts[dk]) { delete drafts[dk]; setDrafts(drafts); }
        showDraftTip(type, false);
      }

      function showDraftTip(type, on) {
        var conf = DRAFT_PANELS[type];
        var p = $(conf.panel);
        if (!p) return;
        var tip = p.querySelector('.draft-tip');
        if (on) {
          if (!tip) {
            tip = document.createElement('span');
            tip.className = 'draft-tip';
            tip.textContent = '✎ 已恢复未保存的草稿';
            var bar = p.querySelector('.date-bar');
            if (bar) bar.appendChild(tip);
          }
        } else if (tip) tip.remove();
      }

      function flashSaved(type) {
        var p = $(DRAFT_PANELS[type].panel);
        if (!p) return;
        var f = p.querySelector('.autosave-flash');
        if (!f) {
          f = document.createElement('span');
          f.className = 'autosave-flash';
          f.textContent = '✓ 已自动保存';
          var bar = p.querySelector('.date-bar');
          if (bar) bar.appendChild(f);
          else return;
        }
        f.classList.add('show');
        clearTimeout(f._t);
        f._t = setTimeout(function () { f.classList.remove('show'); }, 1400);
      }

      function bindDraftAutosave() {
        Object.keys(DRAFT_PANELS).forEach(function (type) {
          var p = $(DRAFT_PANELS[type].panel);
          if (!p) return;
          var handler = debounce(function () { saveDraft(type); }, 700);
          p.addEventListener('input', function (e) {
            if (e.target && e.target.id === DRAFT_PANELS[type].keyEl) return; // 切换日期不算编辑
            handler();
          }, true);
          p.addEventListener('change', function (e) {
            if (e.target && e.target.id === DRAFT_PANELS[type].keyEl) return;
            handler();
          }, true);
          // 表格行增删也要落盘
          p.addEventListener('click', function (e) {
            var t = e.target;
            if (t && t.tagName === 'BUTTON') setTimeout(function () { saveDraft(type); }, 60);
          }, true);
        });

        // 年度台账：静默自动保存
        var pa = $('panel-annual');
        if (pa && window.saveAnnualStat) {
          var annualSave = debounce(function () {
            silent(function () { saveAnnualStat(); });
          }, 900);
          pa.addEventListener('input', annualSave, true);
          pa.addEventListener('change', annualSave, true);
        }

        // 待办输入框内容也不丢
        ['todoDailyInput', 'todoWeeklyInput', 'todoMonthlyInput'].forEach(function (id) {
          var el = $(id);
          if (!el) return;
          var cached = localStorage.getItem('wb_todoinput_' + id);
          if (cached) el.value = cached;
          el.addEventListener('input', debounce(function () {
            localStorage.setItem('wb_todoinput_' + id, el.value);
          }, 400));
        });
      }

      // 页面关闭 / 切后台前，立刻落盘一次
      function flushDrafts() {
        Object.keys(DRAFT_PANELS).forEach(function (type) {
          var p = $(DRAFT_PANELS[type].panel);
          if (p && p.classList.contains('show')) saveDraft(type);
        });
      }

      /* ============================================================
       * 7. 历史记录按日期分组折叠
       * ============================================================ */
      function getCollapse() {
        var c = readRaw(COLLAPSE_KEY);
        return (c && typeof c === 'object' && !Array.isArray(c)) ? c : {};
      }

      function setCollapse(c) { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(c)); }

      function parseGroup(el, mode) {
        var h4 = el.querySelector('h4');
        var txt = h4 ? h4.textContent : '';
        var m;
        if (mode === 'daily') {
          m = txt.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
          if (m) return { key: m[1] + '-' + String(m[2]).padStart(2, '0'), label: m[1] + '年' + parseInt(m[2], 10) + '月' };
        } else if (mode === 'weekly') {
          m = txt.match(/[（(](\d{4})-(\d{1,2})[）)]/);
          if (m) return { key: m[1] + '-' + String(m[2]).padStart(2, '0'), label: m[1] + '年' + parseInt(m[2], 10) + '月' };
          m = txt.match(/(\d{4})-W(\d{1,2})/);
          if (m) return { key: m[1] + '-W', label: m[1] + '年' };
        } else if (mode === 'monthly') {
          m = txt.match(/(\d{4})-(\d{1,2})/);
          if (m) return { key: m[1], label: m[1] + '年' };
        }
        return { key: '__other', label: '其他' };
      }

      function groupHistory(containerId, mode) {
        var box = $(containerId);
        if (!box) return;
        var items = [];
        for (var i = 0; i < box.children.length; i++) {
          var c = box.children[i];
          if (c.classList && c.classList.contains('history-item')) items.push(c);
        }
        if (!items.length) return; // 空提示原样保留

        var order = [], map = {};
        items.forEach(function (el) {
          var g = parseGroup(el, mode);
          if (!map[g.key]) { map[g.key] = { key: g.key, label: g.label, els: [] }; order.push(g.key); }
          map[g.key].els.push(el);
        });

        var collapse = getCollapse();
        var frag = document.createDocumentFragment();

        if (order.length > 1) {
          var bar = document.createElement('div');
          bar.className = 'hist-toolbar';
          var bAll = document.createElement('button');
          bAll.type = 'button';
          bAll.textContent = '▽ 展开全部';
          var bNone = document.createElement('button');
          bNone.type = 'button';
          bNone.textContent = '△ 折叠全部';
          bar.appendChild(bAll);
          bar.appendChild(bNone);
          frag.appendChild(bar);
          bAll.addEventListener('click', function () { toggleAll(containerId, order, false); });
          bNone.addEventListener('click', function () { toggleAll(containerId, order, true); });
        }

        order.forEach(function (k, idx) {
          var g = map[k];
          var gid = containerId + '::' + k;
          var collapsed = (gid in collapse) ? !!collapse[gid] : (idx !== 0); // 默认只展开最新一组

          var wrap = document.createElement('div');
          wrap.className = 'hist-group' + (collapsed ? ' collapsed' : '');
          wrap.dataset.gid = gid;

          var head = document.createElement('div');
          head.className = 'hist-group-head';
          head.innerHTML = '<span class="arrow">▼</span><span>' + g.label + '</span>' +
            '<span class="cnt">' + g.els.length + ' 条</span>';
          head.addEventListener('click', function () {
            wrap.classList.toggle('collapsed');
            var c = getCollapse();
            c[gid] = wrap.classList.contains('collapsed');
            setCollapse(c);
          });

          var body = document.createElement('div');
          body.className = 'hist-group-body';
          g.els.forEach(function (el) { body.appendChild(el); });

          wrap.appendChild(head);
          wrap.appendChild(body);
          frag.appendChild(wrap);
        });

        box.innerHTML = '';
        box.appendChild(frag);
      }

      function toggleAll(containerId, order, collapsed) {
        var c = getCollapse();
        order.forEach(function (k) { c[containerId + '::' + k] = collapsed; });
        setCollapse(c);
        var box = $(containerId);
        box.querySelectorAll('.hist-group').forEach(function (g) {
          g.classList.toggle('collapsed', collapsed);
        });
      }

      var _origRenderAllHistory = window.renderAllHistory;
      if (typeof _origRenderAllHistory === 'function') {
        window.renderAllHistory = function () {
          _origRenderAllHistory.apply(this, arguments);
          try {
            groupHistory('history-daily', 'daily');
            groupHistory('history-weekly', 'weekly');
            groupHistory('history-monthly', 'monthly');
          } catch (e) { console.warn('[history group]', e); }
        };
      }

      /* ============================================================
       * 8. 已完成待办按日期折叠
       * ============================================================ */
      var _origToggleTodo = window.toggleTodo;
      if (typeof _origToggleTodo === 'function') {
        window.toggleTodo = function (id) {
          _origToggleTodo.apply(this, arguments);
          try {
            var todos = getTodos();
            var t = todos.find(function (x) { return x.id === id; });
            if (t) {
              if (t.done && !t.doneAt) { t.doneAt = new Date().toISOString(); setTodos(todos); }
              else if (!t.done && t.doneAt) { delete t.doneAt; setTodos(todos); }
            }
          } catch (e) {}
          try { renderTodos(); } catch (e) {}
        };
      }

      function groupDoneTodos(listId) {
        var ul = $(listId);
        if (!ul) return;
        var doneEls = [];
        ul.querySelectorAll('li.todo-item.done').forEach(function (li) { doneEls.push(li); });
        if (doneEls.length < 1) return;

        var todos = [];
        try { todos = getTodos(); } catch (e) {}
        var byId = {};
        todos.forEach(function (t) { byId[t.id] = t; });

        var order = [], map = {};
        doneEls.forEach(function (li) {
          var t = byId[li.dataset.id] || {};
          var iso = t.doneAt || t.createdAt || '';
          var d = iso ? new Date(iso) : null;
          var key = d && !isNaN(d) ?
            (d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')) :
            '未记录日期';
          if (!map[key]) { map[key] = []; order.push(key); }
          map[key].push(li);
        });
        order.sort().reverse();

        var gid = 'donegrp::' + listId;
        var collapse = getCollapse();
        var collapsed = (gid in collapse) ? !!collapse[gid] : true;

        var grp = document.createElement('div');
        grp.className = 'todo-done-group' + (collapsed ? ' collapsed' : '');

        var head = document.createElement('div');
        head.className = 'todo-done-head';
        head.innerHTML = '<span class="arrow">▼</span><span>✅ 已完成（' + doneEls.length + '）· 按日期折叠</span>';
        head.addEventListener('click', function () {
          grp.classList.toggle('collapsed');
          var c = getCollapse();
          c[gid] = grp.classList.contains('collapsed');
          setCollapse(c);
        });

        var body = document.createElement('div');
        body.className = 'todo-done-body';
        order.forEach(function (k) {
          var dt = document.createElement('div');
          dt.className = 'todo-done-date';
          dt.textContent = '📅 ' + k + '（' + map[k].length + '）';
          body.appendChild(dt);
          var sub = document.createElement('ul');
          sub.className = 'todo-list';
          sub.style.padding = '0';
          sub.style.margin = '0';
          map[k].forEach(function (li) { sub.appendChild(li); });
          body.appendChild(sub);
        });

        grp.appendChild(head);
        grp.appendChild(body);

        var holder = document.createElement('li');
        holder.style.listStyle = 'none';
        holder.appendChild(grp);
        ul.appendChild(holder);
      }

      var _origRenderTodos = window.renderTodos;
      if (typeof _origRenderTodos === 'function') {
        window.renderTodos = function () {
          _origRenderTodos.apply(this, arguments);
          try {
            groupDoneTodos('todoDailyList');
            groupDoneTodos('todoWeeklyList');
            groupDoneTodos('todoMonthlyList');
          } catch (e) { console.warn('[todo group]', e); }
        };
      }

      /* ============================================================
       * 8.5 [UX] 体验增强：快捷键 / 恢复防护 / 命令面板
       *     （审查优化：统一反馈、效率操作、可发现性）
       * ============================================================ */
      var CMDK_TABS = [
        { id: 'dash', label: '🛰️ 情报搜集' },
        { id: 'inspire', label: '💡 灵感早报' },
        { id: 'work', label: '📋 日常工作' },
        { id: 'projects', label: '📁 项目管理' },
        { id: 'clients', label: '👥 客户管理' },
        { id: 'recycle', label: '🗑️ 回收站' }
      ];

      function gotoTop(tab) {
        try { if (window.showTop) { window.showTop(tab); return; } } catch (e) {}
        var sel = document.querySelector('.top-tab[data-tab="' + tab + '"], .tab-btn[data-tab="' + tab + '"]');
        if (sel) sel.click();
      }

      function initUXEnhancements() {
        // —— 客户卡折叠（委托点击）——
        document.addEventListener('click', function (e) {
          var toggle = e.target.closest && e.target.closest('.client-toggle');
          if (!toggle) return;
          var item = toggle.closest('.client-item');
          if (item) item.classList.toggle('expanded');
        });

        // —— 全局快捷键 ——
        document.addEventListener('keydown', function (e) {
          var t = e.target;
          var typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

          if (e.key === 'Escape') {
            document.querySelectorAll('.modal.show, .overlay.show, [data-modal].show, .popup.show, .cmdk-overlay.show').forEach(function (m) { m.classList.remove('show'); });
            return;
          }
          if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
            e.preventDefault();
            toast('数据已实时自动保存 ✅', 'ok');
            return;
          }
          if (typing) return;

          // 板块切换 ←/→ 或 j/k
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'j' || e.key === 'k') {
            var tabs = document.querySelectorAll('.tab-btn, [data-tab]');
            if (!tabs.length) return;
            var idx = -1;
            tabs.forEach(function (b, i) { if (b.classList.contains('active')) idx = i; });
            if (idx < 0) return;
            var dir = (e.key === 'ArrowRight' || e.key === 'k') ? 1 : -1;
            var next = tabs[idx + dir];
            if (next) { e.preventDefault(); next.click(); }
            return;
          }
          // / 聚焦搜索
          if (e.key === '/') {
            var box = document.querySelector('.panel.show input[type="search"], .panel.show input[placeholder*="搜索"], .panel.show input[placeholder*="筛选"], .panel.show input[placeholder*="关键词"]');
            if (box) { e.preventDefault(); box.focus(); }
          }
        });

        // —— 恢复按钮防护：视觉降级 + 点击自动快照 ——
        try {
          document.querySelectorAll('button').forEach(function (b) {
            if (b.title && b.title.indexOf('恢复数据') >= 0) {
              b.classList.add('btn-danger-soft');
              b.title = '⚠️ 会覆盖全部数据；点击前已自动备份当前数据到本地快照';
              b.addEventListener('click', function () {
                try {
                  var snap = {};
                  SYNC_KEYS.forEach(function (k) { var v = localStorage.getItem(k); if (v != null) snap[k] = v; });
                  localStorage.setItem('wb_restore_snapshot', JSON.stringify(snap));
                  toast('已自动备份当前数据到本地快照，可回退', 'info');
                } catch (e) {}
              }, true);
            }
          });
        } catch (e) {}

        // —— 命令面板 ——
        initCommandPalette();
      }

      function initCommandPalette() {
        var overlay, input, list;
        function ensure() {
          if (overlay) return;
          overlay = document.createElement('div');
          overlay.className = 'cmdk-overlay';
          overlay.id = 'cmdkOverlay';
          overlay.innerHTML = '<div class="cmdk"><input class="cmdk-input" id="cmdkInput" placeholder="输入以筛选：板块 / 备份 / 整理 / 刷新 / 暗色…" /><ul class="cmdk-list" id="cmdkList"></ul></div>';
          overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.classList.remove('show'); });
          document.body.appendChild(overlay);
          input = overlay.querySelector('#cmdkInput');
          list = overlay.querySelector('#cmdkList');
          input.addEventListener('input', render);
          input.addEventListener('keydown', onKey);
        }
        var items = [];
        function build() {
          items = CMDK_TABS.map(function (x) { return { label: '前往 ' + x.label, run: function () { gotoTop(x.id); } }; });
          items.push({ label: '📦 备份全部数据', run: function () { try { window.exportAllDataJSON && window.exportAllDataJSON(); } catch (e) {} } });
          items.push({ label: '🧹 整理云空间', run: function () { try { window.runStorageMaintenance && window.runStorageMaintenance(true); } catch (e) {} } });
          items.push({ label: '↻ 刷新情报搜集', run: function () { var b = document.getElementById('dashRefresh'); if (b) b.click(); } });
          items.push({ label: '🌓 切换暗色模式', run: function () { try { window.toggleDarkMode && window.toggleDarkMode(); } catch (e) {} } });
          items.push({ label: '⚙ 打开云同步设置', run: function () { var b = document.getElementById('syncBadge'); if (b) b.click(); } });
        }
        var active = 0;
        function render() {
          var q = (input.value || '').trim().toLowerCase();
          var filtered = items.filter(function (it) { return !q || it.label.toLowerCase().indexOf(q) >= 0; });
          if (!filtered.length) { list.innerHTML = '<li class="cmdk-empty">无匹配</li>'; return; }
          list.innerHTML = filtered.map(function (it, i) {
            return '<li class="cmdk-item' + (i === active ? ' active' : '') + '" data-i="' + i + '">' + it.label + '</li>';
          }).join('');
          Array.prototype.forEach.call(list.querySelectorAll('.cmdk-item'), function (li) {
            li.addEventListener('click', function () { exec(filtered[+li.dataset.i]); });
          });
        }
        function exec(it) { if (!it) return; overlay.classList.remove('show'); it.run(); }
        function onKey(e) {
          var q = (input.value || '').trim().toLowerCase();
          var filtered = items.filter(function (it) { return !q || it.label.toLowerCase().indexOf(q) >= 0; });
          if (!filtered.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(filtered.length - 1, active + 1); render(); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); render(); }
          else if (e.key === 'Enter') { e.preventDefault(); exec(filtered[active]); }
        }
        document.addEventListener('keydown', function (e) {
          if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
            e.preventDefault();
            ensure(); build();
            overlay.classList.add('show');
            input.value = ''; active = 0; render();
            setTimeout(function () { input.focus(); }, 30);
          }
        });
      }

      /* ============================================================
       * 9. 包装原有加载 / 保存函数，串入草稿逻辑
       * ============================================================ */
      function wrapLoad(name, type) {
        var orig = window[name];
        if (typeof orig !== 'function') return;
        window[name] = function () {
          var r = orig.apply(this, arguments);
          try { applyDraft(type); } catch (e) { console.warn('[draft]', e); }
          return r;
        };
      }

      function wrapSave(name, type) {
        var orig = window[name];
        if (typeof orig !== 'function') return;
        window[name] = function () {
          var r = orig.apply(this, arguments);
          try { clearDraft(type); } catch (e) {}
          return r;
        };
      }

      /* ============================================================
       * 10. 启动
       * ============================================================ */
      document.addEventListener('DOMContentLoaded', function () {
        // 等原始初始化跑完再挂钩，避免被首次渲染覆盖
        setTimeout(function () {
          wrapLoad('loadDailyData', 'daily');
          wrapLoad('loadWeekAutoData', 'weekly');
          wrapLoad('loadMonthAutoData', 'monthly');
          wrapSave('saveDaily', 'daily');
          wrapSave('saveWeekly', 'weekly');
          wrapSave('saveMonthly', 'monthly');

          bindDraftAutosave();
          initUXEnhancements();

          // 首屏补一次草稿恢复与分组渲染
          try { applyDraft('daily'); } catch (e) {}
          try { if (window.renderAllHistory) renderAllHistory(); } catch (e) {}
          try { if (window.renderTodos) renderTodos(); } catch (e) {}

          renderBadge();
          connect(false);
        }, 350);

        window.addEventListener('online', function () { toast('网络已恢复，正在重连云端…'); connect(false); });
        window.addEventListener('offline', function () { stopTimer(); setState('offline', '设备已离线'); });

        document.addEventListener('visibilitychange', function () {
          if (document.hidden) { flushDrafts(); }
          else if (Sync.cfg) { syncCycle(false, false); }
        });

        window.addEventListener('pagehide', flushDrafts);
        window.addEventListener('beforeunload', flushDrafts);
      });

      // 暴露少量调试入口
      window.__wbSync = Sync;
    })();
  </script>
