/* Pinned C-A-F-M story. scrub: true is 1:1. The pin is the stage; children fade.
   prefers-reduced-motion, or a missing GSAP file, shows the four beats in a static stack. */
(function () {
  'use strict';
  var root = document.querySelector('#story');
  if (!root) return;

  var hashEls = [].slice.call(root.querySelectorAll('[data-hash]'));
  var rows = [].slice.call(root.querySelectorAll('.line[data-k]'));

  function canonical() {
    return rows.map(function (el) {
      var b = el.querySelector('b');
      return el.getAttribute('data-k') + '=' + (b ? b.textContent.trim() : '');
    }).join('\n');
  }

  function sha256(text) {
    if (!window.crypto || !crypto.subtle) return Promise.resolve('');
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (buf) {
      return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    });
  }

  sha256(canonical()).then(function (hex) {
    var text = hex || 'Hash unavailable in this browser';
    hashEls.forEach(function (el) { el.textContent = text; });
  }).catch(function () {
    hashEls.forEach(function (el) { el.textContent = 'Hash unavailable in this browser'; });
  });

  var motion = window.matchMedia('(prefers-reduced-motion: no-preference)').matches;
  if (!motion || !window.gsap || !window.ScrollTrigger) {
    document.documentElement.classList.add('reduce');
    return;
  }

  var pin = root.querySelector('.story-pin');
  var steps = [].slice.call(root.querySelectorAll('.step-row'));
  var lines = root.querySelectorAll('[data-step="memory"] .line');
  var packet = root.querySelector('.packet');
  var dots = [].slice.call(root.querySelectorAll('.meter i'));
  if (!pin || steps.length < 4) {
    document.documentElement.classList.add('reduce');
    return;
  }

  gsap.registerPlugin(ScrollTrigger);

  var tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      id: 'cafm',
      trigger: pin,
      start: function () {
        var nav = document.querySelector('.nav');
        return 'top ' + ((nav && nav.offsetHeight) || 64) + 'px';
      },
      end: function () { return '+=' + Math.round(window.innerHeight * (window.innerWidth < 800 ? 2.8 : 3.4)); },
      pin: true,
      scrub: true,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onUpdate: function (self) {
        var t = self.progress;
        var phase = t < 0.22 ? 'Context' : t < 0.48 ? 'Action' : t < 0.74 ? 'Feedback' : 'Memory';
        var n = phase === 'Context' ? 0 : phase === 'Action' ? 1 : phase === 'Feedback' ? 2 : 3;
        root.setAttribute('data-phase', phase);
        dots.forEach(function (dot, i) { dot.classList.toggle('on', i <= n); });
      }
    }
  });

  tl.set(steps, { autoAlpha: 0 });
  tl.set(steps[0], { autoAlpha: 1 });
  tl.set(lines, { autoAlpha: 0, y: 8 });
  if (packet) tl.set(packet, { autoAlpha: 0, left: '30.4%', top: '23.4%' });

  function cross(outEl, inEl, at) {
    tl.to(outEl, { autoAlpha: 0, duration: 0.08 }, at);
    tl.to(inEl, { autoAlpha: 1, duration: 0.08 }, at);
  }

  cross(steps[0], steps[1], 0.20);
  cross(steps[1], steps[2], 0.44);
  cross(steps[2], steps[3], 0.70);

  if (packet) {
    tl.to(packet, { autoAlpha: 1, duration: 0.03 }, 0.22);
    tl.to(packet, { left: '49.3%', top: '38.3%', duration: 0.16, immediateRender: false }, 0.24);
    tl.to(packet, { autoAlpha: 0, duration: 0.04 }, 0.40);
  }

  tl.to(lines, { autoAlpha: 1, y: 0, duration: 0.08, stagger: 0.015 }, 0.80);
  tl.to({}, { duration: 0.015 }, 0.985);

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
  }
})();
