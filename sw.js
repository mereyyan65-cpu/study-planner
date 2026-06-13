/* ================================================================
   Service Worker - 考研打卡 PWA
   ================================================================ */

const CACHE_NAME = 'study-planner-v2';
const FILES_TO_CACHE = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'manifest.json',
];

// 安装：预缓存核心文件
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(FILES_TO_CACHE).catch(err => {
        console.log('Cache addAll partial failure:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// 激活：清理旧缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// 请求拦截：缓存优先，网络回退
self.addEventListener('fetch', event => {
  // 跳过非 GET 请求和 chrome-extension
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      // 缓存命中直接返回
      if (cached) return cached;

      // 网络请求
      return fetch(event.request).then(response => {
        // 只缓存成功响应
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });

        return response;
      }).catch(() => {
        // 网络失败，返回离线页面
        if (event.request.mode === 'navigate') {
          return caches.match('index.html');
        }
        return new Response('离线状态', { status: 503 });
      });
    })
  );
});
