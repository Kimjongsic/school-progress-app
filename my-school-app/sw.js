// sw.js
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  // 브라우저가 설치 버튼을 띄우기 위한 최소 요건
});