/* Black Box vNext · connect a bot, and reconnect one. Same flows and copy as the shipped wizard:
   1 Choose bot · 2 Name it · 3 Authorize (Remote MCP + OAuth), with the HTTP gateway key and the
   browser console pairing code as the paths for bots without MCP. Only an accepted call confirms a connection. */
(function () {
  'use strict';
  const BB = window.BB, $ = BB.$, esc = BB.esc;
  let W = {}, timer = null;
  const P = [['instinct', 'Instinct'], ['grok', 'Grok Bot'], ['muse', 'Muse']];
  const toast = m => BB.toast(m);
  const stop = () => { clearInterval(timer); timer = null; BB.linkWaiting = null; };
  function shell(html) {
    const st = W.step || 0, steps = W.reconnect ? ['Reconnect'] : ['Choose bot', 'Name it', 'Authorize'];
    const box = BB.modal(`<div class="cw"><ol class="cw-steps" aria-label="Progress">${steps.map((s, i) => `<li class="${!W.reconnect && i < st ? 'done' : ''}"${(W.reconnect || i === st) ? ' aria-current="step"' : ''}><span>${W.reconnect ? '↻' : i < st ? '✓' : i + 1}</span>${s}</li>`).join('')}</ol>${html}</div>`, { label: W.reconnect ? 'Reconnect a bot' : 'Connect a bot', onClose: () => { stop(); BB.emit(); } });
    return box;
  }
  function status(state, html) { const s = $('#linkstatus'); if (!s) return; s.dataset.state = state; s.innerHTML = `<span class="st ${state === 'connected' ? 'run' : state === 'reconnect' ? 'need' : 'q'}"><i></i></span><div>${html}</div>`; }
  function poll(check) { clearInterval(timer); timer = setInterval(async () => { await BB.sync(true); const a = BB.agent(W.agent.id); if (a) check(a); }, 4000); }
  async function copy(text, ok, fallbackSel) {
    try { await navigator.clipboard.writeText(text); toast(ok); }
    catch (e) { const f = $(fallbackSel); if (f) { f.hidden = false; f.value = text; f.focus(); f.select(); toast('Select and copy the message below.'); } }
  }

  BB.openConnect = function () { stop(); W = { step: 0 }; draw(); };
  BB.reconnect = function (id) {
    const d = BB.agent(id); if (!d) return; stop(); BB.closeInspector && BB.closeInspector(true);
    const pid = (d.providerId || d.provider || '').toLowerCase(), hit = P.find(p => p[0] === pid);
    W = { step: 2, p: hit ? hit[0] : pid, label: hit ? hit[1] : (d.provider || 'assistant'), agent: { id: d.id, name: d.name }, reconnect: BB.presence(d) === 'reconnect', reason: d.connection && d.connection.reason };
    draw();
  };

  function draw() {
    if (W.gateway || (W.step === 2 && ['muse', 'instinct'].includes(W.p))) return drawGateway();
    if (W.step === 0) {
      const box = shell(`<h3>Connect your existing bot</h3><p>Keep the bot you already use, its account and its credits. ${esc(BRAND.name)} sees only work reported through this connection.</p>
        ${P.map(p => `<button class="opt" type="button" data-link="${p[0]}"><span class="av" style="--av:${{ grok: '#121212', instinct: '#1F6F5C', muse: '#2F55A4' }[p[0]]}" aria-hidden="true">${BB.initials(p[1])}</span><span><b>${p[1]}</b><small>Choose your bot, authorize ${esc(BRAND.name)}, verify its connection</small></span></button>`).join('')}
        <button class="opt" type="button" data-link="custom"><span class="av ghost" aria-hidden="true">+</span><span><b>Another bot</b><small>Any bot that can use Remote MCP or make HTTPS calls</small></span></button>`);
      box.querySelectorAll('[data-link]').forEach(b => b.onclick = () => { W.p = b.dataset.link; W.label = (P.find(p => p[0] === W.p) || [0, 'your bot'])[1]; W.step = 1; draw(); });
      return;
    }
    if (W.step === 1) {
      const box = shell(`<h3>Which ${esc(W.label)} bot?</h3><p>Use the exact name of your existing bot, such as CEO or Scout. This creates its ${esc(BRAND.name)} connection, not a new provider bot.</p>
        <label>Bot name<input class="in" id="linkname" maxlength="40" placeholder="Existing bot name"></label>
        <label>Role<input class="in" id="linkrole" maxlength="60" placeholder="Research, operations, marketing..."></label>
        <label>Basic permissions<select class="in" id="linkpreset"><option value="balanced">Balanced: read automatically, ask before writing</option><option value="cautious">Careful: ask before actions</option><option value="trusted">Trusted: allow routine work</option></select></label>
        <p class="err" id="linkerr" role="alert"></p>
        <div class="acts"><button class="b ghost" type="button" id="linkback">Back</button><button class="b ink" type="button" id="linkcreate">Prepare connection</button></div>`);
      box.querySelector('#linkback').onclick = () => { W.step = 0; draw(); };
      box.querySelector('#linkcreate').onclick = async () => {
        const name = $('#linkname').value.trim(); if (!name) return $('#linkerr').textContent = 'Enter the name of your existing bot.';
        $('#linkcreate').disabled = true;
        const j = await BB.api('/api/connect', 'POST', { provider: W.p, name, role: $('#linkrole').value, preset: $('#linkpreset').value, connectionMode: 'existing' });
        if (j.error) { $('#linkerr').textContent = j.error; $('#linkcreate').disabled = false; return; }
        W.agent = j.agent; W.step = 2; await BB.sync(true); draw();
      };
      return;
    }
    /* step 3: authorize over Remote MCP + OAuth */
    const guidance = W.p === 'grok' ? 'In your existing Grok Bot, open Plugins, add a custom MCP server, choose Remote HTTPS, paste this address and connect. Sign into ' + BRAND.name + ' when prompted.' : W.p === 'muse' ? 'Ask your existing Muse to add ' + BRAND.name + ' as a custom connector with this address. If Muse does not support Remote MCP with OAuth, leave this pending. Do not paste account passwords or use a model key instead.' : 'Add this Remote MCP connector to your existing assistant if its connector settings support OAuth. A conversation alone does not install a connector.';
    BB.linkWaiting = W.agent.id; BB.emit();
    const why = W.reason === 'refresh_replay' ? ' (its renewal token was reused)' : W.reason === 'persistent_grant_missing' ? ' (its saved grant is missing)' : '';
    const box = shell(`<h3>${W.reconnect ? 'Reconnect ' + esc(W.agent.name) : 'Authorize ' + esc(W.agent.name)}</h3>
      ${W.reconnect ? `<div class="box2"><b>${esc(W.agent.name)} lost access${esc(why)}.</b><p>Run the same connection again in this bot and authorize it. This reconnects the existing bot; nothing new is created.</p></div>` : ''}
      <p>${esc(guidance)}</p>
      <label>${esc(BRAND.name)} connector address<input class="in" readonly value="${esc(location.origin)}/api/mcp"></label>
      <div class="acts" style="justify-content:flex-start"><button class="b ink" type="button" id="copysetup">Copy setup message</button><button class="b ghost" type="button" id="copylink">Copy connector address</button></div>
      <p>Paste the setup message into your existing bot. If it can install connectors, it can guide setup from there. You still review and authorize in ${esc(BRAND.name)}. At the sign-in screen, select <b>${esc(W.agent.name)}</b> and authorize. No provider password or API key is needed.</p>
      <textarea id="setupfallback" class="in" readonly hidden aria-label="Setup message to copy" style="min-height:200px;margin-top:12px"></textarea>
      <div class="box2"><b>No custom MCP support?</b><p>The HTTP gateway works only if your bot can make authenticated HTTPS calls and securely store a credential. A chat message alone cannot add those capabilities.</p><button class="b out sm" type="button" id="gatewayroute" style="margin-top:10px">Set up HTTP gateway</button></div>
      <div class="status" id="linkstatus" role="status" aria-live="polite"></div>
      <p class="meta" style="margin-top:12px">Only routed activity is visible. Availability depends on your provider supporting this connector. Existing bots are not automatically imported.</p>`);
    status(W.reconnect ? 'reconnect' : 'waiting', W.reconnect ? '<b>Reconnect needed.</b> Waiting for ' + esc(W.agent.name) + ' to authorize again.' : 'Waiting for your bot. No live connection confirmed yet.');
    box.querySelector('#gatewayroute').onclick = () => { clearInterval(timer); W.gateway = true; drawGateway(); };
    box.querySelector('#copysetup').onclick = () => copy(setupMessageFor(), 'Setup message copied. Paste it into your existing bot.', '#setupfallback');
    box.querySelector('#copylink').onclick = () => navigator.clipboard.writeText(location.origin + '/api/mcp').then(() => toast('Connector address copied')).catch(() => toast('Copy the address from the field above.'));
    poll(a => {
      const pr = BB.presence(a);
      if (a.lastSeen && pr === 'connected' && (!W.reconnect || (a.connection && a.connection.status === 'active'))) { status('connected', '<b>Connected: ' + esc(a.name) + '</b><br>Your bot reported to ' + esc(BRAND.name) + ' at ' + esc(new Date(a.lastSeen).toLocaleTimeString()) + '.'); BB.linkWaiting = null; clearInterval(timer); }
      else if (pr === 'reconnect' && !W.reconnect) status('reconnect', '<b>Reconnect needed.</b> The authorization for ' + esc(a.name) + ' dropped. Run the connection again.');
    });
  }
  /* browser console pairing (Muse, Instinct): a short one-time code, no long key to type */
  function drawPairing() {
    BB.linkWaiting = W.agent.id; const label = W.p === 'muse' ? 'Muse' : 'your assistant';
    const box = shell(`<h3>Connect ${esc(W.agent.name)}</h3><ol class="steps-n">
      <li><b>Copy the setup message.</b><p>Paste it to ${label}. It opens its own browser and waits.</p><button class="b ink sm" type="button" id="copypairmsg" style="margin-top:8px">Copy setup message</button></li>
      <li><b>Get a short pairing code.</b><p>Only pair if a new connection is needed. Using the code replaces this bot's previous gateway key. Existing connection still works until then.</p><button class="b out sm" type="button" id="makepair" style="margin-top:8px">Get pairing code</button><p class="pair-code" id="paircode" aria-live="polite"></p><p class="meta" id="pairexpiry"></p></li>
      <li><b>Type the short code in ${label}'s browser.</b><p>Take control, enter it into Pairing code, then return control. ${label} clicks Pair and connect. No long key to type.</p></li></ol>
      <p class="meta" style="margin-top:12px">Expected bot: ${esc(W.agent.name)} · <code>${esc(W.agent.id)}</code></p><p class="err" id="pairerr" role="alert"></p>
      <textarea id="pairfallback" class="in" readonly hidden style="min-height:200px" aria-label="Setup message"></textarea>
      <div class="status" id="linkstatus" role="status" aria-live="polite"></div>`);
    status('waiting', 'Waiting for an accepted connection.');
    box.querySelector('#makepair').onclick = async () => { const b = $('#makepair'); b.disabled = true; try { const j = await BB.api('/api/agents/' + W.agent.id + '/pairing', 'POST', {}); if (j.error) throw Error(j.error); $('#paircode').textContent = j.code; $('#pairexpiry').textContent = 'One use. Expires at ' + new Date(j.expiresAt).toLocaleTimeString() + '. Keep this code out of chat.'; } catch (e) { $('#pairerr').textContent = e.message; } finally { b.disabled = false; } };
    box.querySelector('#copypairmsg').onclick = () => copy(runnerMessage(), 'Setup copied. No credential included.', '#pairfallback');
    poll(a => { if (a.connection && a.connection.transport === 'gateway' && BB.presence(a) === 'connected' && a.lastSeen) { status('connected', '<b>Connected: ' + esc(a.name) + '</b><br>Gateway call accepted at ' + esc(new Date(a.lastSeen).toLocaleTimeString()) + '.'); BB.linkWaiting = null; clearInterval(timer); } });
  }
  /* HTTP gateway: key shown once, setup message never contains it */
  function drawGateway() {
    if (['muse', 'instinct'].includes(W.p)) return drawPairing();
    BB.linkWaiting = W.agent.id;
    const box = shell(`<h3>HTTP gateway: ${esc(W.agent.name)}</h3><p>Reference for clients with authenticated HTTPS tools and secure credential storage. A message alone does not add these tools.</p>
      <div class="box2"><b>Keep the key out of chat</b><p>Install it in your bot client's secure credential settings. The setup message contains only a placeholder, never the key.</p></div>
      <div class="acts" style="justify-content:flex-start"><button class="b ink" type="button" id="issuegateway">${W.issued ? 'Rotate gateway key' : 'Generate gateway key'}</button><button class="b out" type="button" id="copygateway">Copy HTTP reference message</button></div>
      <p class="meta" style="margin-top:8px">Generating or rotating replaces this bot's gateway key. Its OAuth connector is not changed. The new key is shown only in this dialog; it cannot be recovered after closing.</p>
      <div id="gatewaysecret" hidden><label>Gateway key, shown once<input class="in" id="gatewaykey" type="password" readonly autocomplete="off"></label><div class="acts" style="justify-content:flex-start;margin-top:8px"><button class="b out sm" type="button" id="revealkey">Show key</button><button class="b out sm" type="button" id="copykey">Copy key for secure settings</button></div></div>
      <p class="err" id="gatewayerr" role="alert"></p>
      <textarea class="in" id="gatewayfallback" readonly hidden aria-label="Gateway setup message" style="min-height:200px"></textarea>
      <div class="status" id="linkstatus" role="status" aria-live="polite"></div>
      <div class="acts" style="justify-content:flex-start"><button class="b ghost sm" type="button" id="backoauth">Back to OAuth connector</button></div>`);
    status('waiting', 'Waiting for an authenticated gateway call. No connection confirmed.');
    box.querySelector('#issuegateway').onclick = async () => {
      const b = $('#issuegateway');
      if (W.issued && !b.dataset.arm) { b.dataset.arm = 1; b.textContent = 'Click again: the old key stops working'; return; }
      b.disabled = true; try { const j = await BB.api('/api/agents/' + W.agent.id + '/gateway-key', 'POST', {}); if (j.error) throw new Error(j.error); W.issued = true; $('#gatewaykey').value = j.key; $('#gatewaysecret').hidden = false; b.textContent = 'Rotate gateway key'; delete b.dataset.arm; status('waiting', 'Waiting for your bot. Key issued, but no call accepted yet.'); } catch (e) { $('#gatewayerr').textContent = e.message; } finally { b.disabled = false; }
    };
    box.querySelector('#revealkey').onclick = () => { const f = $('#gatewaykey'); f.type = f.type === 'password' ? 'text' : 'password'; $('#revealkey').textContent = f.type === 'password' ? 'Show key' : 'Hide key'; };
    box.querySelector('#copykey').onclick = () => navigator.clipboard.writeText($('#gatewaykey').value).then(() => toast('Key copied. Use secure credential settings, not chat.')).catch(() => toast('Reveal and copy the key into secure settings.'));
    box.querySelector('#copygateway').onclick = () => copy(gatewayMessage(), 'Gateway setup message copied. No key included.', '#gatewayfallback');
    box.querySelector('#backoauth').onclick = () => { clearInterval(timer); W.gateway = false; draw(); };
    poll(a => { if (a.connection && a.connection.transport === 'gateway' && BB.presence(a) === 'connected' && a.lastSeen) { status('connected', '<b>Connected: ' + esc(a.name) + '</b><br>Gateway call accepted at ' + esc(new Date(a.lastSeen).toLocaleTimeString()) + '.'); BB.linkWaiting = null; clearInterval(timer); } });
  }
  /* setup copy: unchanged from the shipped wizard (brand from BRAND) */
  function setupMessageFor(){return [
'Connect my existing '+W.label+' assistant, '+W.agent.name+', to my '+BRAND.name+' workspace. Keep your own provider account and credits. Do not create another provider bot, buy credits, ask for an API key, or ask for my password in chat.',
''+BRAND.name+' Remote HTTPS MCP address: '+location.origin+'/api/mcp',
'If you can add custom connectors, add '+BRAND.name+' using that address and account sign-in/OAuth. If you cannot install connectors yourself, tell me exactly which connector control I need to open. If your client does not support Remote MCP with OAuth, stop and say what is missing; do not pretend it connected.',
'Open the real '+BRAND.name+' authorization page when the client requests it. I will sign into the same '+BRAND.name+' workspace, check the client and return address, select '+W.agent.name+', and click Authorize connection. Never ask me to paste tokens or passwords into chat.',
'For each actual conversation with me, call foreman_owner_conversation with a new opaque session_id, event_id, phase start and sequence 1 when you begin responding. Send update only on real conversation events and end when you finish the response. Increment sequence for updates/end and retry with the same event_id. Never emit from a timer or notification poll; do not send chat content. A quiet or unsupported client will not show With you. This signal is separate from jobs and grants.',
'After authorization, call foreman_presence once. Then report real work through foreman_chat_task and foreman_report, and route only the supported '+BRAND.name+' actions through its policy-gated tools. Report only work you actually do. Work outside this connector is not visible or controlled by '+BRAND.name+'.',
'For notifications without another chat prompt, attach this connector to a supported client automation and test it. Read foreman_notifications with your saved after cursor on each scheduled run, prioritize pending approvals, then completions, blocks and failures. Keep nextCursor in secure routine state and do not repeat already reported event IDs. This is client polling and notification, not server push. If scheduling or state retention is unavailable, say so; do not promise unattended messages.',
'If a tool returns pending approval, tell me you are waiting, then keep checking that request with foreman_check_request {request_id} about every 30 seconds until it is resolved. Check back in after your waiting message; do not stop just because I need to approve. Approval has already run the action, so read the result rather than submitting it again. Resume the task, report the real result with foreman_report, and call foreman_complete_task when done. If your client cannot keep checking between chat turns, say so and tell me to ask you to check again after approving; do not promise background activity.',
'Success: '+BRAND.name+' changes the waiting card to Connected: '+W.agent.name+' with a real report time, and the worker shows recent interaction in HQ. Do not claim success until the server accepts the tool call. '+BRAND.name+' provides automatic OAuth renewal for clients that support refresh tokens. Keep the refresh token securely in connector storage, never in chat. The authorization stays available until I revoke it; if renewal is unsupported or a token is lost, ask me to reconnect.'
].join('\n\n')}
function museMessage(){return [
'Set up my existing Muse assistant '+W.agent.name+' with '+BRAND.name+'. Open '+location.origin+'/runner?agent='+encodeURIComponent(W.agent.id)+' in your own browser and wait for me. I will take control to type a short one-time pairing code into Pairing code, then return control. Never request or copy the key in chat, code, logs or URLs. If you cannot drive the browser, stop and explain.',
'After I return control, click Pair and connect. Verify the page shows '+W.agent.name+' with exact ID '+W.agent.id+'. Stop on a mismatch or rejection. Only accepted presence confirms connection. Keep this page open and visible while you are active. No new provider bot, paid model API or credits.',
'Use the Owner conversation controls only when actually responding to me: Start with you, update only for real conversation events, then End with you when done. Never use periodic presence as conversation evidence. No chat content is sent.',
'Keep this standing workflow for each actual work request I give you in Muse: before doing the work, use Register started work in this console. Enter a short title, brief, stable source ID for this request, and category: marketing for creative/social/campaign work; research for research; outreach for outreach; ops for other execution. Use the same source ID on retries. Greetings and steering messages do not create tasks. If the prior task is still running, finish or report its real failure before registering another; do not falsely complete it.',
'Register started work already makes the task running. Do not Claim next task again for that request. Then do the real work, report actual progress with the console, and Complete task with the actual result, or Fail task if it fails. '+BRAND.name+' cannot see Muse chat by itself; you must register it through this console. If registration fails, tell me before proceeding instead of pretending the floor updated.',
'Use policy-gated controls for supported actions. Pending means tell me you are waiting and Check decision while you can continue. Approval already runs the action: read its result, do not submit again. Denied, blocked or failed means stop, never bypass. If you cannot check between chat turns, say so and ask me to prompt a check after approval.',
'If this console disconnects, reconnect immediately (re-pair if needed) and tell me it dropped. Never bypass owner revocation.',
'This does not promise background work or messages. Closing/hiding the page stops presence. No real money moves. Report only work you actually perform; work outside the console is not visible or controlled by '+BRAND.name+'.'
].join('\n\n')}
function runnerMessage(){if(W.p==='muse')return museMessage();return [
'Connect my existing '+W.label+' assistant '+W.agent.name+' to '+BRAND.name+' using the browser agent console. Keep my provider account and credits. Do not create another bot or buy credits.',
'Open '+location.origin+'/runner?agent='+encodeURIComponent(W.agent.id)+' in YOUR own browser. If you cannot drive web pages, stop and explain the missing capability. This path does not require a remote MCP connector, raw HTTP tools or an OpenAPI build.',
'I will take control once to type a short one-time pairing code into Pairing code. The full credential is exchanged server-side and stays in page memory. Never ask for the key in chat or put it in code, logs or URLs. If a key was exposed, rotate it in my owner UI before using it.',
'After I return browser control, click Pair and connect. The console must show the expected bot '+W.agent.name+' with ID '+W.agent.id+'. Stop on a mismatch or rejected key. Only accepted identity and presence confirm the connection; opening the page alone does not.',
'Use Owner conversation controls for real responses to me: Start with you when you begin, Real conversation update only for actual response activity, then End with you when done. Never drive these from a timer, heartbeat or notification poll. No chat content is sent.',
'Use only explicit console controls. Claim next task only when ready to do that real work; it changes the task to running. No automatic claims. Register work you actually start with a stable source ID, route supported actions through policy, report only real work and complete only after the actual result. Stop on blocked, denied or failed actions; never bypass.',
'Keep the page open and visible while actively executing. Hiding, closing or disconnecting stops presence, and no between-turn background execution is promised. After a pending action, tell me you are waiting and use Check decision about every 30 seconds while you can keep working. Approval already runs the action, so read its result rather than submit again. If you cannot continue checks between turns, say so and ask me to prompt a recheck after approval.',
'If this console disconnects, reconnect immediately (re-pair if needed) and tell me it dropped. Never bypass owner revocation.',
'This console transports a real executor; it does not add new skills or deliver automatic messages. No real money moves. Work outside it is not visible or controlled by '+BRAND.name+'.'
].join('\n\n')}
function gatewayMessage(){return [
'Connect my existing bot '+W.agent.name+' to '+BRAND.name+' through its HTTP gateway. Keep your provider account and credits. Do not create a provider bot or buy credits.',
'You need authenticated HTTPS requests and a secure credential store. If either is unavailable, stop and explain what is missing. Do not claim a connection. Never ask me to paste a key or password into chat. I will install the '+BRAND.name+' gateway key in your secure credential settings separately. Use it as Authorization: Bearer <ALTER_GATEWAY_KEY>. This is not a provider/model key.',
'Base URL: '+location.origin+'/api. First POST /gateway/presence with {}. Only an accepted call confirms connection. GET /gateway/tasks/next returns {task: ...} or {task: null}. Poll only while running, at a sensible interval.',
'For actual conversation responses, POST /gateway/owner-conversation {session_id, event_id, sequence, phase}. Start a new opaque session at sequence 1 and phase start, increment for real updates/end, retry with the same event_id. End when done. Never emit on timers or notification polls; send no chat content. With you clears after 60 seconds without actual activity.',
'For live chat work POST /gateway/chat-task with {title, brief, source_id, category}; use a stable source_id for retries. Report only work you actually do with POST /gateway/events {kind: "TASK_STARTED|TOOL_USED|COMPLETED|FAILED", text, task_id}.',
'Route supported actions through POST /gateway/act {action: "web.fetch|notes.write|work.handoff", params: {...}}. A completed response is success; pending means tell me you are waiting, then GET /gateway/requests/<request_id> about every 30 seconds until resolved. Check back in after the waiting message. Approval already runs the action: read its result, do not submit it again. Resume, report the actual outcome, and complete the task. If you cannot keep checking between turns, explain that limit and ask me to prompt another check after approval. Blocked or failed means stop, never bypass. Finish your task with POST /gateway/tasks/<task_id>/complete {result: "..."}.',
'For a supported client automation, GET /gateway/notifications with the same secure bearer, passing ?after=<saved nextCursor> on later runs. Prioritize pending approvals and notify me about new completions, blocks or failures. Save the returned nextCursor only after reporting those events. A cursor_expired response means history was lost; explain and reset rather than silently claiming all caught up. This read does not claim tasks or update presence. No background messages are promised unless your automation can schedule runs and notify me.',
'Work outside this gateway is not visible or controlled by '+BRAND.name+'. No money moves through this connection. The key does not auto-renew: if lost, rotate it in owner settings and update secure storage. Owner revocation blocks access.'
].join('\n\n')}

})();
