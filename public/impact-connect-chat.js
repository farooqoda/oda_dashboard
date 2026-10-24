/*!
 * Impact Connect Assistant — the website's "Ask us anything" chat.
 * Add before </body>:
 *   <script src="/impact-connect-chat.js" data-endpoint="https://n8n.fisolutionz.com/webhook/website-chat" defer></script>
 * Optional: data-logo="/brand/mark.png"  data-open="1" (open on load)
 */
(function () {
  'use strict';
  if (window.__icChatLoaded) return;
  window.__icChatLoaded = true;

  var me = document.currentScript || document.querySelector('script[src*="impact-connect-chat"]');
  var ENDPOINT = (me && me.getAttribute('data-endpoint')) || 'https://n8n.fisolutionz.com/webhook/website-chat';
  var LOGO = (me && me.getAttribute('data-logo')) || '';
  var OPEN = me && me.getAttribute('data-open') === '1';
  var KEY = 'ic-chat-v1';
  var NAVY = '#0E2850', TEAL = '#05A3AA';

  // ---------- storage (optional: the chat works without it) ----------
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch (e) { return {}; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ visitor_id: st.visitor_id, conversation_id: st.conversation_id, msgs: st.msgs.slice(-40), lead_sent: st.lead_sent })); } catch (e) { /* private window: fine */ }
  }
  function newId() {
    var a = 'abcdefghijklmnopqrstuvwxyz0123456789', s = 'v-';
    for (var i = 0; i < 20; i++) s += a.charAt(Math.floor(Math.random() * a.length));
    return s;
  }
  var st = load();
  st.visitor_id = st.visitor_id || newId();
  st.msgs = st.msgs || [];
  st.lead_sent = !!st.lead_sent;
  var busy = false;

  // ---------- markup (inside a shadow root so the site's styles can't break it) ----------
  var host = document.createElement('div');
  host.id = 'ic-chat';
  host.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483000';
  document.body.appendChild(host);
  var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
  var css = [
    ':host{all:initial}',
    '*{box-sizing:border-box;font-family:Urbanist,Montserrat,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}',
    '.fab{display:inline-flex;align-items:center;gap:10px;border:0;cursor:pointer;background:' + NAVY + ';color:#fff;padding:12px 18px 12px 12px;border-radius:999px;box-shadow:0 12px 30px rgba(14,40,80,.32);font-size:15px;font-weight:700}',
    '.fab:hover{background:#123a6b}.fab:focus-visible,.btn:focus-visible,.chip:focus-visible,.x:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid #7FDDE1;outline-offset:2px}',
    '.fab .dot{display:inline-flex;width:34px;height:34px;border-radius:999px;background:' + TEAL + ';align-items:center;justify-content:center}',
    '.panel{position:fixed;right:20px;bottom:20px;width:380px;max-width:calc(100vw - 24px);height:min(600px,calc(100vh - 40px));background:#fff;border-radius:22px;box-shadow:0 24px 60px rgba(14,40,80,.30);display:flex;flex-direction:column;overflow:hidden;border:1px solid #DCE4EC}',
    '@media (max-width:520px){.panel{right:0;bottom:0;width:100vw;max-width:100vw;height:100dvh;border-radius:0}}',
    '.head{display:flex;align-items:center;gap:10px;padding:14px 14px 14px 16px;background:linear-gradient(135deg,' + NAVY + ' 0%,#123a6b 60%,#0b6f78 100%);color:#fff}',
    '.head img{height:30px;width:auto;background:#fff;border-radius:8px;padding:3px}',
    '.head .t{font-family:Montserrat,Urbanist,sans-serif;font-weight:800;font-size:15px;line-height:1.15}.head .s{font-size:12px;color:#C8D3E1}',
    '.x{margin-left:auto;border:0;background:rgba(255,255,255,.12);color:#fff;width:36px;height:36px;border-radius:999px;cursor:pointer;font-size:20px;line-height:1}',
    '.log{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;background:#F4F7FA}',
    '.m{max-width:86%;padding:10px 13px;border-radius:16px;font-size:14.5px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word}',
    '.m.a{align-self:flex-start;background:#fff;color:#0E1A2E;border:1px solid #DCE4EC;border-bottom-left-radius:6px}',
    '.m.v{align-self:flex-end;background:' + NAVY + ';color:#fff;border-bottom-right-radius:6px}',
    '.m a{color:' + TEAL + ';font-weight:700}.m.v a{color:#7FDDE1}',
    '.typing{align-self:flex-start;color:#536179;font-size:13px;padding:4px 6px}',
    '.chips{display:flex;flex-wrap:wrap;gap:6px}.chip{border:1px solid #9EDFE2;background:#E6F6F7;color:#0B4F55;border-radius:999px;padding:7px 12px;font-size:13px;font-weight:600;cursor:pointer}',
    '.lead{align-self:stretch;background:#fff;border:1px solid #9EDFE2;border-radius:16px;padding:12px;display:flex;flex-direction:column;gap:8px}',
    '.lead p{margin:0;font-size:13.5px;color:#0E2850;font-weight:700}.lead label{font-size:12px;color:#3B4860;display:flex;flex-direction:column;gap:3px}',
    'input,textarea{font-size:14px;border:1px solid #C5D1DD;border-radius:10px;padding:8px 10px;color:#0E1A2E;background:#fff;width:100%}',
    '.btn{border:0;cursor:pointer;background:' + NAVY + ';color:#fff;border-radius:999px;padding:10px 16px;font-size:14px;font-weight:700}.btn:hover{background:' + TEAL + '}.btn[disabled]{opacity:.5;cursor:default}',
    '.btn.alt{background:' + TEAL + ';color:' + NAVY + '}',
    '.err{color:#B42318;font-size:12.5px}',
    '.foot{border-top:1px solid #DCE4EC;padding:10px;display:flex;gap:8px;align-items:flex-end;background:#fff}',
    '.foot textarea{resize:none;height:44px;max-height:120px}',
    '.note{font-size:11px;color:#536179;padding:0 12px 10px;background:#fff}',
    '.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}',
    '.panel[hidden]{display:none}'
  ].join('');
  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  root.appendChild(styleEl);

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    for (var k in (attrs || {})) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'on') for (var ev in attrs.on) e.addEventListener(ev, attrs.on[ev]);
      else e.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }
  var ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0E2850" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';

  var fab = el('button', { type: 'button', class: 'fab', 'aria-label': 'Ask us anything — open the chat', 'aria-expanded': 'false' });
  fab.innerHTML = '<span class="dot">' + ICON + '</span><span>Ask us anything</span>';
  var log = el('div', { class: 'log', role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversation' });
  var input = el('textarea', { id: 'ic-q', placeholder: 'Type your question…', maxlength: '1000', rows: '1' });
  var send = el('button', { type: 'button', class: 'btn', text: 'Send' });
  var close = el('button', { type: 'button', class: 'x', 'aria-label': 'Close the chat', text: '×' });
  var head = el('div', { class: 'head' }, [
    LOGO ? el('img', { src: LOGO, alt: '' }) : null,
    el('div', {}, [el('div', { class: 't', text: 'Impact Connect Assistant' }), el('div', { class: 's', text: 'Answers in seconds · a person follows up when needed' })]),
    close
  ]);
  var panel = el('div', { class: 'panel', role: 'dialog', 'aria-label': 'Impact Connect Assistant', hidden: 'hidden' }, [
    head, log,
    el('div', { class: 'foot' }, [el('label', { for: 'ic-q', class: 'sr', text: 'Your question' }), input, send]),
    el('div', { class: 'note', text: 'Chats are saved so the team can help you. Please don’t share passwords.' })
  ]);
  root.appendChild(fab);
  root.appendChild(panel);

  // ---------- rendering ----------
  function linkify(text, node) {
    var parts = String(text).split(/(https?:\/\/[^\s)]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g);
    parts.forEach(function (p) {
      if (/^https?:\/\//.test(p)) node.appendChild(el('a', { href: p, target: '_blank', rel: 'noopener', text: p }));
      else if (/@/.test(p) && /^[^\s]+@[^\s]+$/.test(p)) node.appendChild(el('a', { href: 'mailto:' + p, text: p }));
      else node.appendChild(document.createTextNode(p));
    });
  }
  function bubble(role, text) {
    var b = el('div', { class: 'm ' + (role === 'v' ? 'v' : 'a') });
    linkify(text, b);
    log.appendChild(b);
    log.scrollTop = log.scrollHeight;
    return b;
  }
  function render() {
    log.textContent = '';
    if (!st.msgs.length) {
      bubble('a', 'Hi! I’m the Impact Connect Assistant. Ask me about features, pricing, the free trial or account safety.');
      var chips = el('div', { class: 'chips' });
      ['How much does it cost?', 'Is it safe for my LinkedIn account?', 'Can I book a demo?'].forEach(function (q) {
        chips.appendChild(el('button', { type: 'button', class: 'chip', text: q, on: { click: function () { ask(q); } } }));
      });
      log.appendChild(chips);
    }
    st.msgs.forEach(function (m) { bubble(m.r, m.t); });
  }
  function bookingButton(url) {
    var a = el('a', { href: url, target: '_blank', rel: 'noopener', class: 'btn alt', text: 'Pick a demo time', style: 'align-self:flex-start;text-decoration:none' });
    log.appendChild(a);
    log.scrollTop = log.scrollHeight;
  }

  // ---------- the details form ----------
  function leadForm() {
    if (st.lead_sent || root.querySelector('.lead')) return;
    var name = el('input', { type: 'text', autocomplete: 'name', maxlength: '120' });
    var email = el('input', { type: 'email', autocomplete: 'email', maxlength: '200', required: 'required' });
    var company = el('input', { type: 'text', autocomplete: 'organization', maxlength: '160' });
    var err = el('div', { class: 'err', role: 'alert' });
    var go = el('button', { type: 'button', class: 'btn', text: 'Send my details' });
    var form = el('div', { class: 'lead' }, [
      el('p', { text: 'Leave your details and the team will email you.' }),
      el('label', {}, [document.createTextNode('Name'), name]),
      el('label', {}, [document.createTextNode('Email *'), email]),
      el('label', {}, [document.createTextNode('Company'), company]),
      err, go
    ]);
    go.addEventListener('click', function () {
      var e = email.value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { err.textContent = 'Please enter a valid email.'; email.focus(); return; }
      go.disabled = true;
      call({ lead: { name: name.value.trim(), email: e, company: company.value.trim() } }).then(function (r) {
        if (r && r.ok) {
          st.lead_sent = true;
          form.remove();
          st.msgs.push({ r: 'a', t: r.reply }); save(); bubble('a', r.reply);
          if (r.booking_url) bookingButton(r.booking_url);
        } else { err.textContent = (r && r.reason === 'bad_email') ? 'Please enter a valid email.' : 'Something went wrong — please try again.'; go.disabled = false; }
      });
    });
    log.appendChild(form);
    log.scrollTop = log.scrollHeight;
  }

  // ---------- talking to the assistant ----------
  function call(extra) {
    var body = { visitor_id: st.visitor_id, conversation_id: st.conversation_id || null, page: String(location.href).slice(0, 300) };
    for (var k in extra) body[k] = extra[k];
    return fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (res) { return res.json(); })
      .then(function (r) { if (r && r.conversation_id) { st.conversation_id = r.conversation_id; save(); } return r; })
      .catch(function () { return null; });
  }
  function ask(q) {
    q = String(q || '').trim();
    if (!q || busy) return;
    busy = true; send.disabled = true;
    var chips = root.querySelector('.chips'); if (chips) chips.remove();
    st.msgs.push({ r: 'v', t: q }); save(); bubble('v', q);
    input.value = '';
    var typing = el('div', { class: 'typing', text: 'Assistant is typing…' });
    log.appendChild(typing); log.scrollTop = log.scrollHeight;
    call({ message: q }).then(function (r) {
      typing.remove();
      busy = false; send.disabled = false;
      var text = r && r.ok && r.reply ? r.reply : 'Sorry, I could not reach the team’s assistant. Please email bashir@ontariodigitalacademy.org.';
      st.msgs.push({ r: 'a', t: text }); save(); bubble('a', text);
      if (r && r.booking_url && /demo/i.test(q + ' ' + text)) bookingButton(r.booking_url);
      if (r && r.ask_lead) leadForm();
      input.focus();
    });
  }

  // ---------- open / close ----------
  function open() {
    panel.removeAttribute('hidden'); fab.style.display = 'none'; fab.setAttribute('aria-expanded', 'true');
    render(); setTimeout(function () { input.focus(); }, 50);
  }
  function shut() {
    panel.setAttribute('hidden', 'hidden'); fab.style.display = ''; fab.setAttribute('aria-expanded', 'false'); fab.focus();
  }
  fab.addEventListener('click', open);
  close.addEventListener('click', shut);
  panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') shut(); });
  send.addEventListener('click', function () { ask(input.value); });
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input.value); } });
  if (OPEN) open();
})();
