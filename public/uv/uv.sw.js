/* eslint-disable no-undef */
importScripts('/uv/uv.bundle.js');
importScripts('/uv/uv.config.js');
importScripts('/uv/uv.sw.js'); // This refers to the internal logic within the bundle

const sw = new UVServiceWorker();

self.addEventListener('fetch', (event) => {
    event.respondWith(sw.fetch(event));
});
