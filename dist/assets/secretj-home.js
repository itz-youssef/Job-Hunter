(() => {
  'use strict';

  // This header runs on the same static files on Vercel and Cloudflare.
  // Both platforms expose the same private, same-origin Secret J account APIs.
  const guest = document.getElementById('sj-guest-actions');
  const member = document.getElementById('sj-member-actions');
  const email = document.getElementById('sj-member-email');
  const initial = document.getElementById('sj-profile-initial');
  const photo = document.getElementById('sj-profile-photo');
  const admin = document.getElementById('sj-admin-link');
  const menu = document.getElementById('sj-profile-menu');
  if (!guest || !member) return;

  // A session cookie is valid only for the hostname where it was issued.
  // Never claim login from localStorage or from a different deployment domain.
  let lastUserId = null;
  let requestSequence = 0;
  async function loadAvatar(sequence, userId) {
    if (!photo || !initial) return;
    try {
      const response = await fetch('/api/secretj-data?scope=avatar', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) throw Error('Avatar not available');
      const data = await response.json();
      const item = data?.file;
      const mime = item?.mime_type;
      const base64 = typeof item?.base64 === 'string' ? item.base64.replace(/\s/g, '') : '';
      if(sequence !== requestSequence || userId !== lastUserId) return;
      resetAvatar();
      if (data?.found === true &&
          ['image/jpeg', 'image/png', 'image/webp'].includes(mime) &&
          typeof base64 === 'string' &&
          base64.length > 0 && base64.length <= 150000 &&
          /^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
        photo.src = 'data:' + mime + ';base64,' + base64;
        photo.hidden = false;
        initial.hidden = true;
      }
    } catch {
      // Keep the circular initials as an accessible fallback.
    }
  }

  function resetAvatar() {
    if (photo) {
      photo.hidden = true;
      photo.removeAttribute('src');
    }
    if (initial) initial.hidden = false;
  }

  async function refreshAccount() {
    const sequence = ++requestSequence;
    try {
      const response = await fetch('/api/secretj-auth?action=session', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) throw Error('Session unavailable');
      const payload = await response.json();
      const user = payload?.user;
      if (!user || typeof user.email !== 'string' || !user.id) {
        throw Error('Not signed in');
      }
      if (sequence !== requestSequence) return;

      guest.hidden = true;
      member.hidden = false;
      email.textContent = user.email;
      initial.textContent = (user.email.split('@')[0].slice(0, 2) || 'SJ').toUpperCase();
      admin.hidden = user.role !== 'admin';
      const ops = document.getElementById('sj-admin-tools');
      if (ops) ops.hidden = user.role !== 'admin';

      if (String(user.id) !== lastUserId) {
        lastUserId = String(user.id);
        resetAvatar();
      }
      // Re-read the private avatar when the tab is revisited after editing it.
      await loadAvatar(sequence, lastUserId);
    } catch {
      if (sequence !== requestSequence) return;
      lastUserId = null;
      guest.hidden = false;
      member.hidden = true;
      if (admin) admin.hidden = true;
      const ops = document.getElementById('sj-admin-tools');
      if (ops) ops.hidden = true;
      resetAvatar();
      if (menu) menu.open = false;
    }
  }

  document.addEventListener('click', (event) => {
    if (menu?.open && !menu.contains(event.target)) menu.open = false;
  });

  document.getElementById('sj-header-logout')?.addEventListener('click', async () => {
    const button = document.getElementById('sj-header-logout');
    button.disabled = true;
    try {
      const response = await fetch('/api/secretj-auth?action=logout', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      });
      if (!response.ok) throw Error('Sign out failed');
      lastUserId = null;
      window.location.assign('/');
    } catch {
      button.disabled = false;
      alert('Could not sign out. Please try again.');
    }
  });

  refreshAccount();
  window.addEventListener('secretj-account-changed', () => refreshAccount());
  window.addEventListener('storage', event => { if(event.key === 'sj-account-change') refreshAccount(); });
  window.addEventListener('focus', () => refreshAccount());
  window.addEventListener('pageshow', () => refreshAccount());
  window.addEventListener('hashchange', () => refreshAccount());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshAccount();
  });
})();
