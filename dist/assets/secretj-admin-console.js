/* Secret J admin command center. Private data is only loaded after a server-verified admin session. */
(function(){
'use strict';
const html=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=n=>Number(n||0).toLocaleString('en-US');
const day=s=>s?new Date(s).toLocaleString():'—';
const badge=(text,good)=>'<span class="sj-admin-badge '+(good?'good':'')+'">'+html(text)+'</span>';
const bars=(rows,key,label)=>rows.length?rows.map(item=>{
 const max=Math.max(1,...rows.map(x=>Number(x[key]||0)));
 const value=Number(item[key]||0);
 return '<div class="sj-admin-bar"><span>'+html(item[label])+'</span><div><i style="width:'+Math.max(2,value/max*100)+'%"></i></div><b>'+number(value)+'</b></div>';
}).join(''):'<p class="muted">No activity yet.</p>';
async function render(root,api,state){
 if(state.user?.role!=='admin'){root.textContent='Administrator access required';return;}
 const url='/api/secretj-admin?action=';
 const [overview,users]=await Promise.all([api(url+'insights'),api(url+'users')]);
 const accounts=overview.accounts||{}, alerts=overview.alerts||{};
 root.classList.add('sj-admin-root');
 root.innerHTML='<div class="sj-admin-header"><div><span class="eyebrow">SECRET J / COMMAND CENTER</span><h2>Administration overview</h2><p class="muted">Account access, operational intelligence and audited actions.</p></div><button class="btn secondary" data-ad-refresh>Refresh data</button></div>'+
 '<div class="sj-admin-kpis">'+[
 ['Accounts',accounts.total],['Active users',accounts.active],
 ['Administrators',accounts.admins],['Joined this week',accounts.joined_week],
 ['Alert subscribers',alerts.opted_in],['Verified emails',alerts.verified],
 ['Alerts sent',alerts.sent],['Failed alerts',alerts.failed]
 ].map(([label,value])=>'<div class="sj-admin-kpi"><strong>'+number(value)+'</strong><small>'+html(label)+'</small></div>').join('')+'</div>'+
 '<div class="sj-admin-cols"><section class="sj-admin-section"><h3>📈 Account growth · 14 days</h3>'+bars(overview.signups||[],'count','day')+'</section>'+
 '<section class="sj-admin-section"><h3>📌 Application pipeline</h3>'+bars(overview.pipeline||[],'count','stage')+'</section></div>'+
 '<section class="sj-admin-section"><div class="sj-admin-heading"><div><h3>👥 User management</h3><p class="muted">Role access, account activation, session security and private usage metadata</p></div><input id="sj-admin-search" type="search" placeholder="Search accounts" aria-label="Search accounts"></div>'+
 '<div class="sj-admin-users" id="sj-admin-users"></div><div id="sj-admin-detail" class="sj-admin-detail" hidden></div></section>'+
 '<section class="sj-admin-section"><div class="sj-admin-heading"><h3>⚙️ Operations & monitor health</h3><a href="https://github.com/itz-youssef/Job-Hunter/actions" target="_blank" rel="noopener noreferrer">GitHub Actions ↗</a></div><div id="sj-admin-ops" class="sj-admin-ops muted">Checking published scan status…</div></section>'+ 
 '<section class="sj-admin-section"><h3>🛡️ Administrative activity</h3>'+
 (overview.activity||[]).map(a=>'<div class="sj-admin-activity"><strong>'+html(a.action)+'</strong><span>'+html(a.actor_email||'Administrator')+'</span><small>'+html(day(a.created_at))+'</small></div>').join('')+
 (!overview.activity?.length?'<p class="muted">No administrative actions yet.</p>':'')+'</section>'+
 '<div class="notice">Security: actions are checked on the server against your active administrator session. This console does not expose passwords, session tokens, CV file contents, or database credentials.</div>';
 const list=root.querySelector('#sj-admin-users');
 function paint(filter=''){
  const matching=(users.users||[]).filter(u=>
    (u.email+' '+(u.display_name||'')+' '+u.role).toLowerCase().includes(filter.toLowerCase()));
  list.innerHTML=matching.map(u=>'<article class="sj-admin-user"><div><strong>'+html(u.display_name||u.email)+'</strong><small>'+html(u.email)+'</small>'+
   '<div>'+badge(u.role,u.role==='admin')+' '+badge(u.is_active?'Active':'Suspended',u.is_active)+'</div></div>'+
   '<div class="item-actions"><button class="btn secondary" data-admin-detail="'+html(u.id)+'">Details</button>'+
   (u.id===state.user.id?'<small>Your account</small>':
     '<button class="btn secondary" data-admin-id="'+html(u.id)+'" data-admin-field="role" data-admin-value="'+(u.role==='admin'?'member':'admin')+'">'+(u.role==='admin'?'Demote':'Make admin')+'</button>'+
     '<button class="btn secondary" data-admin-id="'+html(u.id)+'" data-admin-field="is_active" data-admin-value="'+(u.is_active?'false':'true')+'">'+(u.is_active?'Suspend':'Activate')+'</button>')+
   '</div></article>').join('')||'<p class="muted">No matching accounts.</p>';
 }
 paint();
 // Observe published monitoring state; do not dispatch workflows or expose tokens.
 Promise.allSettled([
   fetch('/custom-status.json',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(Error('No scan report'))),
   fetch('/data.json',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(Error('No jobs snapshot')))
 ]).then(results=>{
   if(!root.isConnected)return;
   const ops=root.querySelector('#sj-admin-ops');if(!ops)return;
   const scan=results[0].status==='fulfilled'?results[0].value:null;
   const snapshot=results[1].status==='fulfilled'?results[1].value:null;
   const companies=Array.isArray(scan?.companies)?scan.companies:[];
   const active=companies.filter(c=>['monitoring','partial'].includes(c.status)).length;
   ops.innerHTML='<div class="sj-admin-kpis">'+[
     ['Companies checked',companies.length],['Monitoring / partial',active],
     ['Current job listings',Array.isArray(snapshot?.jobs)?snapshot.jobs.length:'—'],
     ['Pending legacy scan',scan?.pending_alerts??'—']
   ].map(([label,value])=>'<div class="sj-admin-kpi"><strong>'+html(value)+'</strong><small>'+html(label)+'</small></div>').join('')+'</div>'+
   '<p>Last custom scan: '+html(day(scan?.checked_at))+' · Latest snapshot: '+html(day(snapshot?.generated_at))+'</p>'+
   (!scan||!snapshot?'<p>One or more published reports are unavailable. Do not assume monitoring is healthy.</p>':'');
 }).catch(()=>{});
 root.querySelector('#sj-admin-search').addEventListener('input',e=>paint(e.target.value));
 root.querySelector('[data-ad-refresh]').addEventListener('click',()=>render(root,api,state).catch(err=>{root.textContent='Could not refresh: '+err.message;}));
 root.onclick=async e=>{
  const b=e.target.closest('[data-admin-detail],[data-admin-revoke]');
  if(!b||!root.contains(b))return;
  const target=root.querySelector('#sj-admin-detail');
  try{
   if(b.dataset.adminRevoke){
    if(!confirm('Sign out all active sessions for this account?'))return;
    await api(url+'revoke-sessions','PATCH',{id:b.dataset.adminRevoke});
   }
   const id=b.dataset.adminDetail||b.dataset.adminRevoke;
   const result=await api(url+'user-detail&id='+encodeURIComponent(id));
   const u=result.user;target.hidden=false;
   target.innerHTML='<h3>Account diagnostics</h3><p><strong>'+html(u.display_name||u.email)+'</strong> · '+html(u.email)+'</p>'+
   '<div class="sj-admin-detail-grid">'+[
    ['Joined',day(u.created_at)],['Role',u.role],['Email confirmed',u.email_verified?'Yes':'No'],
    ['Job alerts',u.email_alerts?'Enabled':'Disabled'],['Saved jobs',u.saved_jobs],
    ['Applications',u.applications],['CV uploaded',u.has_cv?'Yes':'No'],
    ['Profile photo',u.has_photo?'Yes':'No'],['Active sessions',u.active_sessions],
    ['Alerts sent',u.alerts_sent],['Location',u.location||'Not provided']
   ].map(([k,v])=>'<div><small>'+html(k)+'</small><strong>'+html(v)+'</strong></div>').join('')+'</div>'+
   (u.id!==state.user.id?'<button class="btn secondary" data-admin-revoke="'+html(u.id)+'">Revoke active sessions</button>':'');
   target.scrollIntoView({block:'nearest',behavior:'smooth'});
  }catch(err){target.hidden=false;target.textContent='Unable to load user diagnostics: '+err.message;}
 };
}
window.SecretJAdmin={render};
})();
