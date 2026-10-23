/* Posts to the existing waitlist. Stores only the seat receipt token, never the email. */
(function () {
  'use strict';
  var forms = [].slice.call(document.querySelectorAll('form.join'));
  var seats = [].slice.call(document.querySelectorAll('[data-seats]'));
  if (!forms.length && !seats.length) return;

  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var KEY = 'alter-seat-receipt';

  function token() {
    try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; }
  }
  function save(value) {
    try { if (value) localStorage.setItem(KEY, value); } catch (e) {}
  }
  function say(form, text) {
    var node = form.querySelector('[role="status"]');
    if (node) node.textContent = text;
  }
  function paint(text) {
    forms.forEach(function (form) {
      say(form, text);
      var button = form.querySelector('button[type="submit"]');
      var email = form.querySelector('input[type="email"]');
      if (button) { button.disabled = true; button.textContent = 'Joined'; }
      if (email) email.disabled = true;
    });
  }
  function seatsText(taken, limit) {
    return taken.toLocaleString() + ' of ' + limit.toLocaleString() + ' founding access-list places';
  }
  function showSeats(text) {
    seats.forEach(function (el) { el.textContent = text; el.classList.add('on'); });
  }

  if (seats.length) {
    fetch('/api/founding/count', { cache: 'no-store' }).then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (j) {
      showSeats((j && typeof j.taken === 'number' && typeof j.limit === 'number')
        ? seatsText(j.taken, j.limit)
        : 'Founding access list could not be read.');
    }).catch(function () {
      showSeats('Founding access list could not be read.');
    });
  }

  if (token()) {
    fetch('/api/founding/receipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receipt: token() })
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (j && j.seat) paint('Your saved founding seat is #' + j.seat + ' of ' + j.limit + '. This is your place on the access list, not access to the product.');
    }).catch(function () {});
  }

  forms.forEach(function (form) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var emailInput = form.querySelector('input[type="email"]');
      var consent = form.querySelector('input[name="consent"]');
      var website = form.querySelector('input[name="website"]');
      var button = form.querySelector('button[type="submit"]');
      var email = (emailInput.value || '').trim().toLowerCase();
      if (email.length > 254 || !EMAIL.test(email) || !consent.checked) {
        say(form, 'Enter your email and agree to an access update.');
        return;
      }
      button.disabled = true;
      say(form, 'Joining.');
      fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          consent: true,
          website: website ? website.value : '',
          receipt: token()
        })
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, body: j }; });
      }).then(function (res) {
        if (!res.ok) {
          var message = res.body && typeof res.body.error === 'string' ? res.body.error : '';
          if (message === 'origin') message = 'This page cannot join the list from this address.';
          throw new Error(message || 'Could not join. Try again.');
        }
        if (res.body.receipt) save(res.body.receipt);
        if (typeof res.body.seat === 'number') {
          paint('Your founding seat is #' + res.body.seat + ' of ' + res.body.limit + '. This is your place on the access list, not access to the product.');
          fetch('/api/founding/count', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
            if (j && typeof j.taken === 'number' && typeof j.limit === 'number') showSeats(seatsText(j.taken, j.limit));
          }).catch(function () {});
        } else if (res.body.limit) {
          paint('The ' + res.body.limit.toLocaleString() + ' founding places are full. Your access request is saved.');
        } else {
          paint('Your request is saved. If you joined before, reopen the browser where your seat receipt was saved.');
        }
      }).catch(function (err) {
        say(form, err && err.message ? err.message : 'Could not join. Try again.');
        button.disabled = false;
      });
    });
  });
})();
