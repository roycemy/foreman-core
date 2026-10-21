/* Add the final same-origin video path to data-video-src. No placeholder media requests. */
(() => {
  'use strict';
  const slot = document.querySelector('[data-demo-video]');
  if (!slot) return;
  const src = slot.dataset.videoSrc || '';
  if (!/^\/marketing\/assets\/[a-zA-Z0-9._-]+\.(mp4|webm)$/.test(src)) return;
  const video = slot.querySelector('video');
  const poster = slot.querySelector('.demo-poster');
  if (!video || !poster) return;
  video.addEventListener('loadedmetadata', () => { video.hidden = false; poster.hidden = true; }, { once: true });
  video.addEventListener('error', () => { video.hidden = true; poster.hidden = false; });
  video.preload = 'metadata';
  video.src = src;
})();
