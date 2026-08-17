/*BUILD_TS*/
/* =============================================================
 * DSC 工作台 Service Worker
 * 策略：
 *  - 导航请求（打开页面）：network-first
 *    → 每次打开都向服务器拉取最新 index.html，保证「部署后下次打开即最新」
 *    → 联网失败时回退到本地缓存的壳，离线也能打开
 *  - 其他同源静态资源：stale-while-revalidate（先用缓存，后台静默更新）
 *  - skipWaiting + clients.claim：新版本部署后尽快接管，无需手动刷新
 * ============================================================= */
var CACHE = 'wb-app-cache-v1';
var APP_SHELL = ['./', './index.html'];

self.addEventListener('install', function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(APP_SHELL);
    }).catch(function () { /* 离线/首装失败都不阻塞安装 */ })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  // 仅接管同源请求；外部 CDN（如 jsdelivr 的 xlsx）直接放行，不打断
  if (url.origin !== self.location.origin) return;

  // 导航：网络优先，保证永远拿到最新页面；失败回退缓存壳
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) { cache.put('./index.html', copy); });
        }
        return res;
      }).catch(function () {
        return caches.match('./index.html').then(function (r) { return r || caches.match('./'); });
      })
    );
    return;
  }

  // 其余同源 GET：先返回缓存，后台默默更新
  event.respondWith(
    caches.match(req).then(function (cached) {
      var network = fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      }).catch(function () { return cached; });
      return cached || network;
    })
  );
});
