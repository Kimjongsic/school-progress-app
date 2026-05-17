// sw.js
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  // 설치 버튼을 활성화하기 위한 최소한의 코드
  return;
});