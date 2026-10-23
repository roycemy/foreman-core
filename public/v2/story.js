/* Pinned scroll story. 1:1 scrub (scrub: true). Hard pin. Mask wipe. Staggered receipt lines.
   prefers-reduced-motion keeps the static stack from v2.css and does not load a timeline. */
(function () {
  'use strict';
  var root = document.querySelector('#story');
  if (!root) return;
  var hashEl = root.querySelector('[data-hash]');
  var rows = [].slice.call(root.querySelectorAll('.line[data-k]'));

  function canonical() {
    return rows.map(function (el) {
      return el.getAttribute('data-k') + '=' + el.querySelector('b').textContent.trim();
    }).join('\n');
  }

  function sha256(text) {
    if (!window.crypto || !crypto.subtle) return Promise.resolve('');
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (buf) {
      return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    });
  }

  sha256(canonical()).then(function (hex) {
    if (hashEl) hashEl.textContent = hex || 'Hash unavailable in this browser';
  }).catch(function () {
    if (hashEl) hashEl.textContent = 'Hash unavailable in this browser';
  });

  var motion = window.matchMedia('(prefers-reduced-motion: no-preference)').matches;
  if (!motion || !window.gsap || !window.ScrollTrigger) {
    document.documentElement.classList.add('reduce');
    return;
  }

  var stage = root.querySelector('.stage');
  var req = root.querySelector('.req');
  var phone = root.querySelector('.phone-slot');
  var solid = root.querySelector('.phone.solid');
  var wire = root.querySelector('.phone.wire');
  var receipt = root.querySelector('.receipt');
  var lines = root.querySelectorAll('.receipt .line');
  var beat = root.querySelector('[data-beat]');
  var rail = root.querySelector('.rail > span');

  gsap.registerPlugin(ScrollTrigger);

  function delta() {
    var mobile = window.innerWidth < 800;
    if (mobile) {
      return {
        x: (phone.offsetLeft + phone.offsetWidth / 2) - (req.offsetLeft + req.offsetWidth / 2),
        y: (phone.offsetTop - 18) - (req.offsetTop + req.offsetHeight)
      };
    }
    return {
      x: (phone.offsetLeft - 28) - (req.offsetLeft + req.offsetWidth),
      y: (phone.offsetTop + phone.offsetHeight / 2) - (req.offsetTop + req.offsetHeight / 2)
    };
  }

  var mm = gsap.matchMedia();
  mm.add('(prefers-reduced-motion: no-preference)', function () {
    var tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        id: 'story',
        trigger: stage,
        start: function () { return 'top ' + ((document.querySelector('.nav') || {}).offsetHeight || 64) + 'px'; },
        end: function () { return '+=' + Math.round(window.innerHeight * (window.innerWidth < 800 ? 2.6 : 3.3)); },
        pin: true,
        scrub: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: function (self) {
          var t = self.progress;
          if (beat) beat.textContent = t < 0.24 ? 'Request' : t < 0.46 ? 'Tap' : t < 0.62 ? 'Wipe' : 'Receipt';
          if (rail) rail.style.transform = 'scaleY(' + Math.max(0.04, self.progress) + ')';
        }
      }
    });
    gsap.set(solid, { clipPath: 'inset(0 100% 0 0)' });
    gsap.set(receipt, { autoAlpha: 0 });
    gsap.set(lines, { autoAlpha: 0, y: 14 });
    tl.to(req, { x: function () { return delta().x; }, y: function () { return delta().y; }, duration: 1 }, 0);
    tl.addLabel('tap', 1);
    tl.to({}, { duration: 0.9 }, 1);
    tl.addLabel('wipe', 1.9);
    tl.to(solid, { clipPath: 'inset(0 0% 0 0)', duration: 0.75 }, 1.9);
    tl.to(wire, { autoAlpha: 0, duration: 0.3 }, 2.3);
    tl.to(req, { autoAlpha: 0, duration: 0.25 }, 2.45);
    tl.addLabel('receipt', 2.65);
    tl.to(phone, { autoAlpha: 0, duration: 0.3 }, 2.65);
    tl.to(receipt, { autoAlpha: 1, duration: 0.25 }, 2.75);
    tl.to(lines, { autoAlpha: 1, y: 0, stagger: 0.16, duration: 0.28 }, 2.9);
    tl.addLabel('receiptDone', 4.2);
    tl.to({}, { duration: 0.4 }, 4.2);
    return function () {
      if (tl.scrollTrigger) tl.scrollTrigger.kill();
      tl.kill();
    };
  });
})();
