(() => {
  'use strict';
  // The header uses the dashboard's existing light/dark theme and navigation.
  const guest=document.getElementById('sj-guest-actions');
  const member=document.getElementById('sj-member-actions');
  const email=document.getElementById('sj-member-email');
  const initial=document.getElementById('sj-profile-initial');
  const admin=document.getElementById('sj-admin-link');
  const menu=document.getElementById('sj-profile-menu');
  if (!guest || !member) return;
  document.addEventListener('click',event=>{
    if(menu?.open&&!menu.contains(event.target))menu.open=false;
  });
  async function refreshAccount(){
    // The Cloudflare static preview has no Vercel account endpoints.
    if(location.hostname.endsWith('.workers.dev')){
      guest.hidden=false;member.hidden=true;return;
    }
    try{
      const response=await fetch('/api/secretj-auth?action=session',{
        credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}
      });
      if(!response.ok)throw Error('Unavailable');
      const data=await response.json();
      if(!data.user||typeof data.user.email!=='string')throw Error('Not signed in');
      guest.hidden=true;member.hidden=false;
      email.textContent=data.user.email;
      initial.textContent=(data.user.email.split('@')[0].slice(0,2)||'SJ').toUpperCase();
      admin.hidden=data.user.role!=='admin';
    }catch{
      guest.hidden=false;member.hidden=true;
      if(menu)menu.open=false;
    }
  }
  document.getElementById('sj-header-logout')?.addEventListener('click',async()=>{
    const button=document.getElementById('sj-header-logout');
    button.disabled=true;
    try{
      const response=await fetch('/api/secretj-auth?action=logout',{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'Content-Type':'application/json'},body:'{}'
      });
      if(!response.ok)throw Error('Sign out failed');
      location.assign('/');
    }catch{
      button.disabled=false;
      alert('Could not sign out. Please try again.');
    }
  });
  refreshAccount();
  window.addEventListener('pageshow',event=>{
    if(event.persisted)refreshAccount();
  });
})();