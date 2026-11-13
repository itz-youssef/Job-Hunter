(() => {
  'use strict';
  const root = document.getElementById('sj-public-home');
  if (!root) return;
  const guest = document.getElementById('sj-guest-actions');
  const member = document.getElementById('sj-member-actions');
  const email = document.getElementById('sj-member-email');
  const initial = document.getElementById('sj-profile-initial');
  const admin = document.getElementById('sj-admin-link');
  const menu = document.getElementById('sj-profile-menu');

  const year = document.getElementById('sj-year');
  if(year) year.textContent = String(new Date().getFullYear());
  for (const anchor of root.querySelectorAll('[data-sj-scroll]')) {
    anchor.addEventListener('click', event => {
      event.preventDefault();
      const target = root.querySelector('#sj-' + anchor.dataset.sjScroll);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  for (const anchor of root.querySelectorAll('[data-sj-home]')) {
    anchor.addEventListener('click', event => {
      event.preventDefault();
      document.querySelector('nav [data-page="home"]')?.click();
      window.scrollTo({ top:0, behavior:'smooth' });
    });
  }
  document.addEventListener('click', event => {
    if (menu && menu.open && !menu.contains(event.target)) menu.open = false;
  });

  async function refreshAccount() {
    // The Cloudflare static preview intentionally hosts no member API.
    if (location.hostname.endsWith('.workers.dev')) return;
    try {
      const response = await fetch('/api/secretj-auth?action=session', {
        credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}
      });
      if (!response.ok) throw Error('No account backend available');
      const data = await response.json();
      if (!data.user || typeof data.user.email !== 'string') throw Error('Guest');
      guest.hidden = true;
      member.hidden = false;
      email.textContent = data.user.email;
      initial.textContent = (data.user.email.split('@')[0].slice(0,2)||'SJ').toUpperCase();
      admin.hidden = data.user.role !== 'admin';
    } catch {
      guest.hidden = false;
      member.hidden = true;
      if (menu) menu.open = false;
    }
  }
  document.getElementById('sj-header-logout')?.addEventListener('click', async () => {
    const button = document.getElementById('sj-header-logout');
    button.disabled = true;
    try {
      const response = await fetch('/api/secretj-auth?action=logout', {
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'Content-Type':'application/json'},body:'{}'
      });
      if (!response.ok) throw Error('Sign out failed. Please try again.');
      location.assign('/');
    } catch (error) {
      button.disabled = false;
      alert(error.message);
    }
  });
  refreshAccount();
  window.addEventListener('pageshow', event => { if (event.persisted) refreshAccount(); });
})();