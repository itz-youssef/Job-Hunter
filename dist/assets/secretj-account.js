(() => {
'use strict';

const $ = q => document.querySelector(q);
const esc = value => String(value ?? '').replace(/[&<>"']/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state = {user:null, view:'overview', profile:null};
const types = {
  pdf:'application/pdf',
  docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};
function banner(message,error=false) {
  const el=$('#message');
  el.textContent=message;
  el.classList.toggle('error',Boolean(error));
  el.hidden=false;
  el.scrollIntoView({block:'nearest',behavior:'smooth'});
}
async function api(endpoint,method='GET',body) {
  const response=await fetch(endpoint,{
    method,credentials:'same-origin',cache:'no-store',
    headers:{'Content-Type':'application/json'},
    ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error || 'Request failed ('+response.status+')');
  return data;
}
const authUrl=action=>'/api/secretj-auth?action='+encodeURIComponent(action);
const dataUrl=scope=>'/api/secretj-data?scope='+encodeURIComponent(scope);
function showAuth() {
  $('#account-profile-menu').hidden=true;
  $('#auth-panel').hidden=false;
  $('#member-panel').hidden=true;
  $('#logout').hidden=true;
}
async function signedIn(user) {
  state.user=user;
  $('#auth-panel').hidden=true;
  $('#member-panel').hidden=false;
  $('#logout').hidden=false;
  $('#account-email').textContent=user.email;
  $('#admin-nav').hidden=user.role!=='admin';
  $('#account-admin-profile-link').hidden=user.role!=='admin';
  $('#account-profile-menu').hidden=false;
  $('#account-profile-initial').textContent=(user.email.split('@')[0].slice(0,2)||'SJ').toUpperCase();
  const target=new URLSearchParams(location.search).get('view');
  await showView(['overview','profile','saved','applications','preferences','documents','admin'].includes(target)?target:'overview');
  if(new URLSearchParams(location.search).get('after')==='home')location.assign('/');
}
let isRegistration=false;
function authMode(register) {
  isRegistration=register;
  $('#tab-register').classList.toggle('active',register);
  $('#tab-login').classList.toggle('active',!register);
  $('#name-label').hidden=!register;
  $('#auth-submit').textContent=register?'Create my account':'Sign in';
  $('#auth-form').elements.password.autocomplete=register?'new-password':'current-password';
}
function escapeAttrs(record,key) { return esc(record?.[key]||''); }
function formField(field,label,record={},textarea=false) {
  const name=esc(field),v=escapeAttrs(record,field);
  return `<label class="${['summary','skills','experience','education'].includes(field)?'wide':''}">${esc(label)}
    ${textarea?`<textarea name="${name}" maxlength="12000">${v}</textarea>`:
    `<input name="${name}" value="${v}" maxlength="500" autocomplete="off">`}</label>`;
}
async function showView(view) {
  if(view==='admin' && state.user?.role!=='admin')return;
  state.view=view;
  for(const button of document.querySelectorAll('[data-view]'))
    button.classList.toggle('active',button.dataset.view===view);
  const root=$('#account-content');
  root.textContent='Loading...';
  try {
    if(view==='overview')return await overview(root);
    if(view==='profile')return await profile(root);
    if(view==='saved')return await saved(root);
    if(view==='applications')return await applications(root);
    if(view==='preferences')return await preferences(root);
    if(view==='documents')return await documents(root);
    if(view==='admin')return await admin(root);
  }catch(e){root.textContent='Could not load this section. '+e.message;}
}
async function overview(root) {
  const [savedData,apps,cv,profileData]=await Promise.all([
    api(dataUrl('saved')),api(dataUrl('applications')),
    api(dataUrl('cv')),api(dataUrl('profile'))
  ]);
  state.profile=profileData.profile;
  const name=profileData.profile?.display_name||'';
  $('#welcome-name').textContent=name?', '+name.split(' ')[0]:'';
  root.innerHTML=`<h2>Your career command center</h2>
    <p class="muted">Everything here is private to your Secret J account. The job-scanning system remains shared across all users.</p>
    <div class="summary">
      <div class="stat"><strong>${savedData.jobs.length}</strong><small>Saved opportunities</small></div>
      <div class="stat"><strong>${apps.applications.length}</strong><small>Tracked applications</small></div>
      <div class="stat"><strong>${cv.found?'1':'0'}</strong><small>Cloud CV</small></div>
    </div>
    <div class="notice"><strong>Keep discovering:</strong> the existing Job Hunter scanner checks official companies centrally.
      You can save matching jobs to this account from the main job feed.</div>
    <div class="actions"><a class="btn" href="/#jobs">Explore latest jobs ↗</a>
    <button class="btn secondary" data-go="profile">Complete profile</button></div>`;
}
async function profile(root) {
  const [data,linked]=await Promise.all([
    api(dataUrl('profile')),
    api('/api/secretj-linkedin?action=status').catch(()=>({configured:false,connected:false}))
  ]);
  state.profile=data.profile||{};
  const connection=linked.connection||null;
  const photo=linked.connected&&connection?.picture_url?
     `<img class="linkedin-photo" src="${esc(connection.picture_url)}" alt="LinkedIn photo" referrerpolicy="no-referrer">`:'';
  const connect=linked.connected?
    `<button class="btn danger" type="button" data-linkedin-disconnect>Disconnect LinkedIn</button>`:
    `<a class="btn secondary" href="/api/secretj-linkedin?action=start" ${linked.configured?'':'aria-disabled="true" data-linkedin-disabled="true"'}>Connect LinkedIn ↗</a>`;
  root.innerHTML=`<h2>Professional profile</h2>
    <p class="muted">Describe your experience, education, and skills. Your information is stored in Neon, not locally.</p>
    <div class="provider-row">
      ${photo}<div class="spacer"><strong>LinkedIn profile connection</strong>
      <p class="small muted">${linked.connected?
        `Connected as ${esc(connection?.full_name||'LinkedIn member')}. Name, email and photo metadata are saved privately.`:
        'Import your name, primary email and photo with your permission. Full work history and education need additional LinkedIn API approvals.'}</p>
      ${linked.configured?'':'<p class="tiny">Coming soon — LinkedIn developer application approval is still required.</p>'}</div>
      ${connect}
    </div>
    <p class="small muted">Your login email and alert destination never change automatically when you connect LinkedIn.</p>
    <form id="profile-form" class="grid">
      ${formField('display_name','Full name',state.profile)}
      ${formField('headline','Professional headline',state.profile)}
      ${formField('location','Location',state.profile)}
      ${formField('skills','Skills',state.profile,true)}
      ${formField('summary','About me',state.profile,true)}
      ${formField('experience','Work experience',state.profile,true)}
      ${formField('education','Education',state.profile,true)}
      ${formField('linkedin','LinkedIn profile URL',state.profile)}
      ${formField('github','GitHub URL',state.profile)}
      ${formField('portfolio','Portfolio URL',state.profile)}
      <button class="btn wide" type="submit">Save my profile</button>
    </form>`;
}
function jobCard(row){
  const j=row.job_snapshot||{};
  const validLink=String(j.url||'').startsWith('https://')?j.url:'#';
  return `<div class="item"><div><strong>${esc(j.title||row.job_key)}</strong>
    <small>${esc(j.company||'Unknown employer')} · ${esc(j.location||'')}</small>
    <small>Saved ${esc(new Date(row.saved_at).toLocaleDateString())}</small></div>
    <div class="item-actions">
      ${validLink!=='#'?`<a class="btn secondary" href="${esc(validLink)}" target="_blank" rel="noopener noreferrer">Apply ↗</a>`:''}
      <button class="btn subtle" data-app-from="${esc(row.job_key)}" data-company="${esc(j.company||'')}" data-title="${esc(j.title||'')}">Track</button>
      <button class="btn danger" data-remove-saved="${esc(row.job_key)}">Remove</button>
    </div></div>`;
}
async function saved(root) {
  const data=await api(dataUrl('saved'));
  root.innerHTML=`<h2>Saved opportunities</h2>
    <p class="muted">Your bookmarks follow your account across devices.</p>
    <div class="cards">${data.jobs.length?data.jobs.map(jobCard).join(''):'<p>No cloud-saved jobs yet. Browse the job feed and select Save job.</p>'}</div>
    <div class="actions"><a class="btn secondary" href="/#jobs">Open job feed ↗</a></div>`;
}
const STAGES=['interested','applied','assessment','interview','offer','rejected','withdrawn'];
async function applications(root){
  const data=await api(dataUrl('applications'));
  root.innerHTML=`<h2>Application tracker</h2><p class="muted">Manage your applications and interview stages privately.</p>
    <form id="application-form" class="grid">
      <label>Job ID or URL<input name="key" required placeholder="https://careers.example/job/123" maxlength="500"></label>
      <label>Company<input name="company" maxlength="180"></label>
      <label class="wide">Job title<input name="title" maxlength="220"></label>
      <label class="wide">Notes<textarea name="notes" maxlength="6000"></textarea></label>
      <button class="btn wide" type="submit">Add application</button>
    </form>
    <h3>Your applications (${data.applications.length})</h3>
    <div class="cards">${data.applications.map(a=>`<div class="item">
      <div><strong>${esc(a.title||a.job_key)}</strong><small>${esc(a.company||'')} · ${esc(a.stage)}</small></div>
      <div class="item-actions">
        <select aria-label="Application stage" data-stage="${esc(a.job_key)}">${STAGES.map(x=>`<option value="${x}" ${x===a.stage?'selected':''}>${x}</option>`).join('')}</select>
        <button class="btn danger" data-remove-application="${esc(a.job_key)}">Remove</button>
      </div></div>`).join('')||'<p>No applications recorded yet.</p>'}</div>`;
}
async function preferences(root){
  const data=await api(dataUrl('preferences'));const p=data.preferences;
  root.innerHTML=`<h2>Job preferences &amp; alerts</h2>
  <div class="notice"><strong>Alert destination:</strong> <code>${esc(state.user.email)}</code>
  <p class="small muted">We use your account login email as the default alert address and save this preference in Neon. Personalized email delivery is still being developed; switching it on does not send messages yet.</p></div>
  <p class="muted">Preferences are saved privately in Neon for personalized matching. Existing shared scanner emails remain unchanged.</p>
  <form id="preferences-form">
  <label><span><input type="checkbox" name="egypt_only" style="width:auto" ${p.egypt_only?'checked':''}> Egypt-based opportunities</span></label>
  <label><span><input type="checkbox" name="internships" style="width:auto" ${p.internships?'checked':''}> Include internships</span></label>
  <label>Maximum preferred experience (years)<input name="max_experience_years" type="number" min="0" max="10" value="${Number(p.max_experience_years)}"></label>
  <h3>Role families</h3><div class="grid">
  ${[['software','Software Engineering'],['ai_ml','AI / ML'],['cv','Computer Vision'],['mlops','MLOps']].map(([v,label])=>
   `<label><span><input type="checkbox" style="width:auto" name="roles" value="${v}" ${p.role_families.includes(v)?'checked':''}> ${label}</span></label>`).join('')}</div>
  <label><span><input type="checkbox" name="email_alerts" style="width:auto" ${p.email_alerts?'checked':''}> Opt in to future personalized emails</span></label>
  <button class="btn" type="submit">Save preferences</button></form>`;
}
function readBase64(file) {
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(Error('Could not read file'));
    reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');
    reader.readAsDataURL(file);
  });
}
async function documents(root){
  const [cv,avatar]=await Promise.all([api(dataUrl('cv')),api(dataUrl('avatar'))]);
  root.innerHTML=`<h2>Private CV &amp; profile photo</h2>
    <p class="muted">Files are accessible only after signing in. Small files are stored privately in Neon for the initial free-tier release.</p>
    ${avatar.found?`<img class="avatar" alt="Your profile photo" src="data:${esc(avatar.file.mime_type)};base64,${esc(avatar.file.base64)}">`:
      '<div class="avatar" aria-label="No photo"></div>'}
    <div class="filebox"><h3>Profile photo</h3><p class="small muted">JPG/PNG/WebP. Images are resized in your browser; stored image limit 100 KB.</p>
    <input id="avatar-upload" type="file" accept="image/jpeg,image/png,image/webp"></div>
    <div class="filebox"><h3>My resume</h3>
      <p>${cv.found?`Saved: <strong>${esc(cv.file.original_name)}</strong> (${Math.round(cv.file.size_bytes/1024)} KB)`:'No cloud resume uploaded yet.'}</p>
      <p class="small muted">PDF or DOCX up to 768 KB. Files are stored in Neon (not public GitHub).</p>
      <input id="cv-upload" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document">
      ${cv.found?'<div class="actions"><button class="btn secondary" data-download-cv>Download CV</button><button class="btn danger" data-delete-cv>Delete CV</button></div>':''}
    </div>`;
}
async function photoBlob(file){
  if(!/^image\/(png|jpeg|webp)$/.test(file.type))throw Error('Only JPG, PNG and WebP photos are supported');
  const url=URL.createObjectURL(file);
  try{
    const img=new Image();
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('Image cannot be opened'));img.src=url;});
    const scale=Math.min(1,240/Math.max(img.width,img.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(img.width*scale));
    canvas.height=Math.max(1,Math.round(img.height*scale));
    canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.70));
    if(!blob||blob.size>102400)throw Error('Image is still too large after resizing');
    return blob;
  }finally{URL.revokeObjectURL(url);}
}
async function admin(root){
  const [data,stats]=await Promise.all([
    api('/api/secretj-admin?action=users'),
    api('/api/secretj-admin?action=summary')
  ]);
  const s=stats.summary;
  root.innerHTML=`<h2>Secret J · Administration</h2>
  <p class="muted">Visible only to accounts with the server-verified admin role.</p>
  <div class="summary">
    <div class="stat"><strong>${s.users}</strong><small>Total accounts</small></div>
    <div class="stat"><strong>${s.active_users}</strong><small>Active users</small></div>
    <div class="stat"><strong>${s.applications}</strong><small>Tracked applications</small></div>
  </div><h3>User management</h3><div class="cards">
  ${data.users.map(u=>`<div class="item"><div>
    <strong>${esc(u.display_name||u.email)}</strong><small>${esc(u.email)} · ${esc(u.role)}</small>
    <small>${u.is_active?'Active':'Suspended'}</small></div>
    ${u.id===state.user.id?'<small>Your admin account</small>':
       `<div class="item-actions">
        <button class="btn secondary" data-admin-id="${esc(u.id)}" data-admin-field="role" data-admin-value="${u.role==='admin'?'member':'admin'}">${u.role==='admin'?'Remove admin':'Make admin'}</button>
        <button class="btn ${u.is_active?'danger':'secondary'}" data-admin-id="${esc(u.id)}" data-admin-field="is_active" data-admin-value="${u.is_active?'false':'true'}">${u.is_active?'Suspend':'Activate'}</button>
       </div>`}</div>`).join('')}</div>
  <h3>Latest administrative activity</h3><div class="cards">
  ${stats.activity.map(a=>`<div class="item"><span>${esc(a.action)}</span><small>${esc(a.actor_email||'Admin')} · ${esc(a.created_at)}</small></div>`).join('')||'<p>No changes yet.</p>'}</div>`;
}
$('#tab-login').addEventListener('click',()=>authMode(false));
$('#tab-register').addEventListener('click',()=>authMode(true));
$('#auth-form').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget;const button=$('#auth-submit');
  const values=Object.fromEntries(new FormData(form));
  button.disabled=true;
  try{
    const result=await api(authUrl(isRegistration?'register':'login'),'POST',values);
    form.reset();$('#message').hidden=true;
    await signedIn(result.user);
  }catch(e){banner(e.message,true);}
  finally{button.disabled=false;}
});
$('#logout').addEventListener('click',async()=>{
  try{await api(authUrl('logout'),'POST');state.user=null;showAuth();banner('Signed out successfully.');}
  catch(e){banner(e.message,true);}
});
$('#account-nav').addEventListener('click',event=>{
  const button=event.target.closest('[data-view]');
  if(button)showView(button.dataset.view);
});
$('#account-content').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.target;const values=Object.fromEntries(new FormData(form));
  const button=form.querySelector('button[type=submit]');
  if(button)button.disabled=true;
  try{
    if(form.id==='profile-form')await api(dataUrl('profile'),'PUT',values);
    else if(form.id==='preferences-form'){
      await api(dataUrl('preferences'),'PUT',{
        egypt_only:Boolean(form.elements.egypt_only.checked),
        internships:Boolean(form.elements.internships.checked),
        email_alerts:Boolean(form.elements.email_alerts.checked),
        max_experience_years:Number(values.max_experience_years),
        role_families:[...form.querySelectorAll('input[name=roles]:checked')].map(x=>x.value)
      });
    }else if(form.id==='application-form'){
      await api(dataUrl('applications'),'POST',values);
    }
    banner('Saved securely to your account.');
    await showView(state.view);
  }catch(e){banner(e.message,true);}
  finally{if(button)button.disabled=false;}
});
$('#account-content').addEventListener('click',async event=>{
  const b=event.target.closest('button');if(!b)return;
  try {
    if(b.dataset.go)return showView(b.dataset.go);
    if(b.hasAttribute('data-linkedin-disabled'))return banner('LinkedIn connection requires app approval and server-side OAuth credentials.',true);
    if(b.hasAttribute('data-linkedin-disconnect')){
      if(!confirm('Disconnect LinkedIn? Your saved profile details will remain.'))return;
      await api('/api/secretj-linkedin?action=disconnect','POST',{});
      banner('LinkedIn account disconnected. Your saved profile remains intact.');
      return showView('profile');
    }
    if(b.hasAttribute('data-remove-saved')){
      await api(dataUrl('saved')+'&key='+encodeURIComponent(b.dataset.removeSaved),'DELETE');
    }else if(b.hasAttribute('data-app-from')){
      await api(dataUrl('applications'),'POST',{
        key:b.dataset.appFrom,company:b.dataset.company,title:b.dataset.title,stage:'interested'
      });
      banner('Added to application tracker.');
      return showView('applications');
    }else if(b.hasAttribute('data-remove-application')){
      await api(dataUrl('applications')+'&key='+encodeURIComponent(b.dataset.removeApplication),'DELETE');
    }else if(b.hasAttribute('data-delete-cv')){
      if(!confirm('Delete your saved CV?'))return;
      await api(dataUrl('cv'),'DELETE');
    }else if(b.hasAttribute('data-download-cv')){
      const {file}=await api(dataUrl('cv'));
      const bytes=Uint8Array.from(atob(file.base64),c=>c.charCodeAt(0));
      const url=URL.createObjectURL(new Blob([bytes],{type:file.mime_type}));
      const a=document.createElement('a');a.href=url;a.download=file.original_name;a.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);return;
    }else if(b.hasAttribute('data-admin-id')){
      if(!confirm('Apply this administrative change to the selected user?'))return;
      await api('/api/secretj-admin?action=user','PATCH',{
        id:b.dataset.adminId,field:b.dataset.adminField,
        value:b.dataset.adminField==='is_active'?b.dataset.adminValue==='true':b.dataset.adminValue
      });
    }else return;
    banner('Change saved successfully.');
    await showView(state.view);
  }catch(e){banner(e.message,true);}
});
$('#account-content').addEventListener('change',async event=>{
  const input=event.target;
  try{
    if(input.matches('[data-stage]')){
      await api(dataUrl('applications'),'PUT',{key:input.dataset.stage,stage:input.value});
      banner('Application stage updated.');return;
    }
    if(input.id==='cv-upload'&&input.files[0]){
      const file=input.files[0];
      if(file.size>786432)throw Error('CV limit: 768 KB');
      await api(dataUrl('cv'),'POST',{name:file.name,mime:file.type,content:await readBase64(file)});
      banner('CV saved privately.');await showView('documents');
    }
    if(input.id==='avatar-upload'&&input.files[0]){
      const file=await photoBlob(input.files[0]);
      await api(dataUrl('avatar'),'POST',{mime:'image/webp',content:await readBase64(file)});
      banner('Profile photo saved.');await showView('documents');
    }
  }catch(e){banner(e.message,true);}
});
(async()=>{
  authMode(new URLSearchParams(location.search).get('mode')==='register');
  const linkedin=new URLSearchParams(location.search).get('linkedin');
  if(linkedin==='error')banner('LinkedIn authorization did not complete. No profile information was changed.',true);
  if(linkedin==='connected')banner('LinkedIn profile connected successfully. Your account information is saved in Neon.');
  try {
    const session=await api(authUrl('session'));
    if(session.user)await signedIn(session.user);
    else showAuth();
  }catch(e){showAuth();banner('Backend unavailable. The existing job feed still works; '+e.message,true);}
})();
})();
