// RPGlass accounts: log in with Google or an email code, and keep your career, Hall of Fame and achievements on every device.
// Settings live in config.js. With no settings there, the game runs as before and saves on this device only.
(function () {
  const C = window.RPGLASS_CONFIG || {};
  const ready = !!(C.supabaseUrl && C.supabaseAnonKey && window.supabase && window.supabase.createClient);
  const T = {
    login: 'Log in', title: 'Your account', guest: 'Log in to keep your career, Hall of Fame and achievements on every device you play on.',
    google: 'Continue with Google', or: 'or', email: 'Email', send: 'Send code', sending: 'Sending…',
    sent: e => `We sent a 6-digit code to ${e}. It can take a minute to arrive.`, code: 'Code', verify: 'Log in', checking: 'Checking…',
    badEmail: 'Enter a valid email address.', badCode: 'That code didn’t work. Check it, or ask for a new one.', other: 'Use a different email',
    signedAs: e => `Logged in as ${e}`, synced: 'Saved to your account.', syncing: 'Saving…', offline: 'Couldn’t reach your account. Your game is still saved on this device and will sync later.',
    syncNow: 'Sync now', logout: 'Log out', close: 'Close', merged: 'Your account save was loaded.', newer: 'A newer save of this career was found in your account and loaded.', lock: 'Syncing your career…',
    uname: 'Username', unameHint: '3 to 20 letters, numbers, dots, dashes or underscores.', unameSave: 'Save', unameSaving: 'Saving…', unameOk: 'Username saved.',
    unameBad: 'Use 3 to 20 letters, numbers, dots, dashes or underscores.', unamePick: 'Choose a username', welcome: 'Welcome! Pick the name shown on your account.', later: 'Later'
  };
  const SAVEK = 'rpglass-save2', HOFK = 'rpglass-hof', ACHK = 'rpglass-ach', TABLE = 'rpglass_saves';
  const escH = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uname = u => (u && u.user_metadata && u.user_metadata.username) || '';
  const readJ = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const writeJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  let sb = null, user = null, syncTimer = null, status = '', pending = null, busyPanel = false, note = '', askName = false, askedName = false;

  window.cloudBtn = () => {
    if (!ready) return '';
    const label = user ? escH(uname(user) || (user.email || '').split('@')[0] || T.title) : T.login;
    return `<button class="theme-btn cbtn" data-cloud="open" aria-label="${T.title}"><svg viewBox="0 0 16 16"><circle cx="8" cy="5.5" r="2.6"/><path d="M2.8 14c.8-2.6 2.8-4 5.2-4s4.4 1.4 5.2 4"/></svg><span>${label}</span>${user ? `<span class="cdot ${status === 'err' ? 'err' : ''}"></span>` : ''}</button>`;
  };
  if (!ready) return;
  sb = window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } });

  /* ----- which copy of a career to keep ----- */
  /* year first, then seasons finished, then where you are in the year: draft < season (stage, games) < offseason < retired.
     The last season's games only count while it's being played, so starting a new season never looks like going backwards. */
  const progress = c => !c || !c.phase ? -1 : c.phase === 'create' ? 0 :
    1 + ((c.year || 0) - 1900) * 1e7 + (c.hist ? c.hist.length : 0) * 1e5 +
    (c.phase === 'retired' ? 9e4 : c.phase === 'off' ? 5e4 + (['eos', 'retire', 'summer', 'legend', 'fa', 'trade', 'welcome'].indexOf(c.off && c.off.step) + 1) * 100
      : c.phase === 'season' && c.season ? 500 + (c.season.qi || 0) * 1000 + (c.season.gp || 0) : 0);
  function decide(cloud, local) {
    if (!cloud || !cloud.phase) return 'local';
    if (!local || !local.phase) return 'cloud';
    if (cloud.cid === local.cid && (cloud.rev || 0) === (local.rev || 0)) return 'same';
    if (local.phase === 'create' && cloud.phase !== 'create' && !local.synced) return 'cloud';   // a fresh device never wipes a real career
    if (cloud.phase === 'create' && local.phase !== 'create') return 'local';
    if (cloud.cid === local.cid) { const a = progress(cloud), b = progress(local); return a > b ? 'cloud' : b > a ? 'local' : ((cloud.rev || 0) > (local.rev || 0) ? 'cloud' : 'local'); }
    return (cloud.savedAt || 0) > (local.savedAt || 0) ? 'cloud' : 'local';      // two different careers: the one played last wins
  }
  const hofId = e => `${e.name}|${e.at}`;
  function mergeHof(a, b) { const m = new Map(); [...(a || []), ...(b || [])].forEach(e => { if (e && e.name) m.set(hofId(e), e); }); return [...m.values()].sort((x, y) => y.score - x.score).slice(0, 60); }
  function mergeAch(a, b) { const out = { ...(a || {}) }; Object.entries(b || {}).forEach(([k, t]) => { if (!out[k] || t < out[k]) out[k] = t; }); return out; }
  function adopt(cloud, msg) {
    S = cloud; S.synced = 1; writeJ(SAVEK, S);
    try { lbAll = false; } catch (e) {}
    note = msg; render(); toast(msg);
  }
  let chain = Promise.resolve();
  const serial = fn => (chain = chain.then(fn).catch(() => { status = 'err'; refresh(); }));
  const push = () => serial(pushNow);
  async function pushNow() {
    if (!user || !S) return;
    status = 'saving'; refresh();
    const { data, error } = await sb.from(TABLE).select('career,hof,ach').eq('user_id', user.id).maybeSingle();
    if (error) { status = 'err'; refresh(); return; }
    const d = data ? decide(data.career, S) : 'local';
    if (d === 'cloud') { adopt(data.career, T.newer); }
    const hof = mergeHof(readJ(HOFK, []), data && data.hof); writeJ(HOFK, hof);
    const ach = mergeAch(readJ(ACHK, {}), data && data.ach); writeJ(ACHK, ach);
    if (d !== 'cloud') { S.synced = 1; writeJ(SAVEK, S); }
    const { error: e2 } = await sb.from(TABLE).upsert({ user_id: user.id, career: S, hof, ach, updated_at: new Date().toISOString() });
    status = e2 ? 'err' : 'ok'; refresh();
  }
  let lockEl = null, lockT = null;
  function lock(on) {
    clearTimeout(lockT);
    if (on) { if (!lockEl) { lockEl = document.createElement('div'); lockEl.className = 'csync'; } lockEl.innerHTML = `<div><span class="cspin"></span>${T.lock}</div>`; document.body.appendChild(lockEl); lockT = setTimeout(() => lock(false), 6000); }
    else if (lockEl) lockEl.remove();
  }
  async function syncFirst() { if (!user) return; lock(true); try { await push(); await chain; } finally { lock(false); } }
  window.cloudSync = () => { if (!user) return; clearTimeout(syncTimer); syncTimer = setTimeout(push, 1500); };
  addEventListener('online', () => { if (user) push(); });
  let lastHidden = 0;
  document.addEventListener('visibilitychange', () => {
    if (!user) return;
    if (document.visibilityState === 'hidden') { lastHidden = Date.now(); clearTimeout(syncTimer); push(); }
    else if (Date.now() - lastHidden > 1500) syncFirst();
  });
  addEventListener('pageshow', e => { if (e.persisted && user) syncFirst(); });
  sb.auth.onAuthStateChange((event, session) => {
    const was = user && user.id; user = session ? session.user : null;
    if (user && user.id !== was) setTimeout(syncFirst, 0);
    if (event === 'SIGNED_IN' && user && !uname(user) && !askedName) { askedName = true; askName = true; openPanel(); }
    if (!user) status = '';
    refresh();
  });

  /* ----- panel ----- */
  const css = document.createElement('style');
  css.textContent = `
  .cbtn{gap:6px;font-size:12px;font-weight:600;max-width:150px}.cbtn span:not(.cdot){white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .cdot{width:7px;height:7px;border-radius:50%;background:var(--good);display:inline-block;flex:none}.cdot.err{background:var(--warn)}
  .csync{position:fixed;inset:0;z-index:90;background:rgba(10,12,16,.55);display:flex;align-items:center;justify-content:center;-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}
  .csync>div{background:var(--card);color:var(--ink);border:1px solid var(--rule-2);border-radius:12px;padding:14px 18px;font-size:14px;display:flex;align-items:center;gap:10px;font-family:var(--f-ui)}
  .cspin{width:14px;height:14px;border-radius:50%;border:2px solid var(--rule-2);border-top-color:var(--accent);animation:cspin .8s linear infinite}@keyframes cspin{to{transform:rotate(360deg)}}
  .ctoast{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 24px);transform:translateX(-50%);z-index:95;max-width:min(92vw,420px);background:var(--card);color:var(--ink);border:1px solid var(--rule-2);border-left:3px solid var(--accent);border-radius:10px;padding:10px 14px;font-size:13.5px;box-shadow:0 10px 30px rgba(0,0,0,.35);font-family:var(--f-ui)}
  .cpanel{position:fixed;inset:0;z-index:70;background:rgba(10,12,16,.55);display:flex;align-items:flex-start;justify-content:center;padding:calc(env(safe-area-inset-top,0px) + 56px) 16px 24px;overflow-y:auto}
  .cbox{width:100%;max-width:400px;background:var(--card);color:var(--ink);border:1px solid var(--rule-2);border-radius:12px;padding:20px;display:flex;flex-direction:column;gap:12px;font-family:var(--f-ui)}
  .cbox h2{font-size:20px}.cbox form{display:flex;flex-direction:column;gap:10px}
  .cbox input{font:inherit;font-size:16px;width:100%;background:var(--card);color:var(--ink);border:1px solid var(--rule-2);border-radius:8px;padding:10px 12px}
  .cbox input.code{font-family:var(--f-num);letter-spacing:.3em;font-size:20px;text-align:center}
  .cbox .btn{width:100%}.cbox .or{display:flex;align-items:center;gap:10px;color:var(--ink-3);font-size:12px}
  .cbox .or::before,.cbox .or::after{content:"";flex:1;height:1px;background:var(--rule)}
  .cbox .gbtn{display:flex;align-items:center;justify-content:center;gap:10px}.cbox .gbtn svg{width:18px;height:18px}
  .cbox .gsi{display:flex;justify-content:center;min-height:44px;color-scheme:light}
  .cbox .msg{font-size:14px;color:var(--ink-2)}.cbox .msg.err{color:var(--bad)}.cbox .msg.small{font-size:12.5px;color:var(--ink-3)}
  .cbox .linkb{background:none;border:0;color:var(--ink-2);text-decoration:underline;font:inherit;font-size:13px;padding:0;align-self:flex-start;cursor:pointer}
  @media (max-width:360px){.cbtn span:not(.cdot){display:none}}`;
  document.head.appendChild(css);
  function toast(m) { try { const b = document.createElement('div'); b.className = 'ctoast'; b.textContent = m; document.body.appendChild(b); setTimeout(() => b.remove(), 3800); } catch (e) {} }
  let panel = null;
  const panelOpen = () => !!(panel && panel.isConnected);
  function openPanel() { if (!panel) { panel = document.createElement('div'); panel.className = 'cpanel'; panel.addEventListener('click', onPanelClick); panel.addEventListener('submit', onSubmit); } document.body.appendChild(panel); drawPanel(); }
  function closePanel() { if (panel) panel.remove(); note = ''; askName = false; }
  function refresh() { const b = document.querySelector('[data-cloud="open"]'); if (b) b.outerHTML = window.cloudBtn(); if (panelOpen()) drawPanel(); }
  const G = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
  function drawPanel(msg, isErr) {
    if (!panel) return;
    let body;
    const m = msg ? `<div class="msg ${isErr ? 'err' : ''}">${msg}</div>` : '';
    if (user && askName && !uname(user)) {
      body = `<h2>${T.unamePick}</h2><div class="msg">${T.welcome}</div>
        <form data-f="uname"><label class="lbl" for="cuname">${T.uname}</label><input id="cuname" maxlength="20" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="${escH((user.email || '').split('@')[0])}">
        <div class="msg small">${T.unameHint}</div><button class="btn" ${busyPanel ? 'disabled' : ''}>${busyPanel ? T.unameSaving : T.unameSave}</button></form>${m}
        <button class="linkb" data-c="later">${T.later}</button>`;
    } else if (user) {
      const st = status === 'saving' ? T.syncing : status === 'err' ? T.offline : status === 'ok' ? T.synced : '', un = uname(user);
      body = `<h2>${un ? escH(un) : T.title}</h2><div class="msg">${T.signedAs(escH(user.email || ''))}</div>${note ? `<div class="banner">${note}</div>` : ''}
        <form data-f="uname"><label class="lbl" for="cuname">${T.uname}</label><div class="row" style="gap:8px;flex-wrap:nowrap"><input id="cuname" maxlength="20" autocomplete="username" autocapitalize="none" spellcheck="false" value="${escH(un)}" placeholder="${escH((user.email || '').split('@')[0])}">
        <button class="btn sm" style="width:auto;flex:none" ${busyPanel ? 'disabled' : ''}>${busyPanel ? T.unameSaving : T.unameSave}</button></div><div class="msg small">${T.unameHint}</div></form>
        ${m}${st ? `<div class="msg ${status === 'err' ? 'err' : ''}">${st}</div>` : ''}
        <button class="btn ghost" data-c="sync">${T.syncNow}</button><button class="btn danger" data-c="logout">${T.logout}</button><button class="linkb" data-c="close">${T.close}</button>`;
    } else if (pending) {
      body = `<h2>${T.title}</h2><div class="msg">${T.sent(escH(pending))}</div>
        <form data-f="code"><label class="lbl" for="ccode">${T.code}</label><input id="ccode" class="code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" required>
        <button class="btn" ${busyPanel ? 'disabled' : ''}>${busyPanel ? T.checking : T.verify}</button></form>${m}
        <button class="linkb" data-c="other">${T.other}</button><button class="linkb" data-c="close">${T.close}</button>`;
    } else {
      const useGoogle = !C.providers || C.providers.google !== false, gis = useGoogle && !!C.googleClientId;
      body = `<h2>${T.title}</h2><div class="msg">${T.guest}</div>
        ${useGoogle ? (gis ? `<div id="cgsi" class="gsi"></div>` : `<button class="btn ghost gbtn" data-c="google">${G}${T.google}</button>`) + `<div class="or">${T.or}</div>` : ''}
        <form data-f="email"><label class="lbl" for="cemail">${T.email}</label><input id="cemail" type="email" inputmode="email" autocomplete="email" required>
        <button class="btn" ${busyPanel ? 'disabled' : ''}>${busyPanel ? T.sending : T.send}</button></form>${m}
        <button class="linkb" data-c="close">${T.close}</button>`;
    }
    panel.innerHTML = `<div class="cbox" role="dialog" aria-modal="true" aria-label="${T.title}">${body}</div>`;
    const slot = panel.querySelector('#cgsi'); if (slot) mountGsi(slot, 0);
  }
  let gsiInit = false;
  function mountGsi(slot, tries) {
    const g = window.google && window.google.accounts && window.google.accounts.id;
    if (!slot.isConnected) return;
    if (!g) { if (tries < 60) setTimeout(() => mountGsi(slot, tries + 1), 150); return; }
    if (!gsiInit) { g.initialize({ client_id: C.googleClientId, callback: async r => { const { error } = await sb.auth.signInWithIdToken({ provider: 'google', token: r.credential }); if (error) drawPanel(error.message, true); } }); gsiInit = true; }
    const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    g.renderButton(slot, { theme: dark ? 'filled_black' : 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', width: Math.min(320, slot.clientWidth || 300) });
  }
  async function onPanelClick(e) {
    if (e.target === panel) { closePanel(); return; }
    const b = e.target.closest('[data-c]'); if (!b) return; const c = b.dataset.c;
    if (c === 'close') closePanel();
    else if (c === 'later') { askName = false; closePanel(); }
    else if (c === 'other') { pending = null; drawPanel(); }
    else if (c === 'google') await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
    else if (c === 'sync') await syncFirst();
    else if (c === 'logout') { clearTimeout(syncTimer); await push(); await chain; await sb.auth.signOut(); user = null; status = ''; note = ''; closePanel(); render(); }
  }
  async function onSubmit(e) {
    e.preventDefault(); const form = e.target;
    if (form.dataset.f === 'uname') {
      const v = (panel.querySelector('#cuname').value || '').trim();
      if (!/^[\p{L}\p{N}._-]{3,20}$/u.test(v)) { drawPanel(T.unameBad, true); return; }
      busyPanel = true; drawPanel(); const { data, error } = await sb.auth.updateUser({ data: { username: v } }); busyPanel = false;
      if (error) { drawPanel(error.message, true); return; }
      if (data && data.user) user = data.user; render();
      if (askName) { askName = false; closePanel(); return; } drawPanel(T.unameOk); return;
    }
    if (form.dataset.f === 'email') {
      const email = (panel.querySelector('#cemail').value || '').trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) { drawPanel(T.badEmail, true); return; }
      busyPanel = true; drawPanel(); const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } }); busyPanel = false;
      if (error) { drawPanel(error.message, true); return; } pending = email; drawPanel();
    } else if (form.dataset.f === 'code') {
      const token = (panel.querySelector('#ccode').value || '').replace(/\s/g, '');
      busyPanel = true; drawPanel(); const { error } = await sb.auth.verifyOtp({ email: pending, token, type: 'email' }); busyPanel = false;
      if (error) { drawPanel(T.badCode, true); return; } pending = null; drawPanel();
    }
  }
  document.addEventListener('click', e => { if (e.target.closest('[data-cloud="open"]')) openPanel(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && panelOpen()) closePanel(); });
  render();
  sb.auth.getSession().then(({ data }) => { if (data && data.session && !user) { user = data.session.user; syncFirst(); refresh(); } });
})();
