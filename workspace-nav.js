
/* Direct workspace links and a device-local last-used preference. */
(() => {
  'use strict';
  const names = ['ppitch', 'noteflow'];
  const preferenceKey = 'music-studio-workspace';
  const valid = name => names.includes(name);
  const current = () => document.getElementById('ppitch-view').hidden ? 'noteflow' : 'ppitch';
  const fromLink = () => {
    const name = window.location.hash.slice(1).toLowerCase();
    return valid(name) ? name : null;
  };
  function remember(name) {
    try { window.localStorage.setItem(preferenceKey, name); } catch { /* Private browsing can deny storage. */ }
    document.title = name === 'ppitch' ? 'PPitch — Pitch game | Noteflow' : 'Noteflow — Sheet music | PPitch';
  }
  function updateLink(name, replace) {
    if (!replace && window.location.hash === '#' + name) return;
    try {
      window.history[replace ? 'replaceState' : 'pushState'](null, '', '#' + name);
    } catch { /* The portable app also works where file URL history is unavailable. */ }
  }
  function open(name, replace = false) {
    if (!valid(name)) return false;
    if (!workspaceTab(name)) {
      updateLink(current(), true);
      return false;
    }
    remember(name);
    updateLink(name, replace);
    return true;
  }
  for (const name of names) document.getElementById(name + '-tab').onclick = () => open(name);
  document.querySelector('.brand').onclick = event => {
    event.preventDefault();
    open('ppitch');
  };
  document.querySelector('.app-tabs').onkeydown = event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const name = event.key === 'Home' ? names[0] : event.key === 'End' ? names[1] : names[1 - names.indexOf(current())];
    if (open(name)) document.getElementById(name + '-tab').focus();
  };
  function restoreLink() {
    const name = fromLink() || 'ppitch';
    // Back/Forward can emit both events. Avoid repeating a blocked-switch notice.
    if (name !== current()) open(name, true);
    else { remember(name); updateLink(name, true); }
  }
  window.addEventListener('hashchange', restoreLink);
  window.addEventListener('popstate', restoreLink);
  let saved;
  try { saved = window.localStorage.getItem(preferenceKey); } catch { /* Optional preference only. */ }
  open(fromLink() || (valid(saved) ? saved : 'ppitch'), true);
})();

