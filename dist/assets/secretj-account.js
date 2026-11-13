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
  $('#account-profile-photo')?.removeAttribute('src');
  if($('#account-profile-photo'))$('#account-profile-photo').hidden=true;
  if($('#account-profile-initial'))$('#account-profile-initial').hidden=false;
  $('#account-profile-menu').hidden=true;
  $('#auth-panel').hidden=false;
  $('#member-panel').hidden=true;
  $('#logout').hidden=true;
}
async function syncHeaderPhoto() {
  const photo=$('#account-profile-photo');
  const initials=$('#account-profile-initial');
  if(!photo||!initials||!state.user)return;
  try{
    const data=await api(dataUrl('avatar'));
    const f=data.file;
    if(data.found&&['image/webp','image/png','image/jpeg'].includes(f?.mime_type)&&
       typeof f?.base64==='string'&&f.base64.length>0&&f.base64.length<=150000&&
       /^[a-zA-Z0-9+/]+={0,2}$/.test(f.base64)){
      photo.src='data:'+f.mime_type+';base64,'+f.base64;
      photo.hidden=false;initials.hidden=true;
      return;
    }
  }catch{}
  photo.hidden=true;
  photo.removeAttribute('src');
  initials.hidden=false;
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
  await syncHeaderPhoto();
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
    <div class="actions"><a class="btn" href="/#jobs">Explore latest jobs <svg aria-hidden="true" class="account-btn-icon" viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
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
    linked.configured?
      '<a class="btn secondary" href="/api/secretj-linkedin?action=start">Connect LinkedIn ↗</a>':
      '<button type="button" class="btn secondary" disabled title="LinkedIn app approval is required">Connect LinkedIn · Coming soon</button>';
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
  const [data,emailState]=await Promise.all([
    api(dataUrl('preferences')),
    api('/api/secretj-email?action=status').catch(()=>({configured:false,verified:false}))
  ]);
  const p=data.preferences;
  const emailReady=emailState.configured===true;
  const verified=emailState.verified===true;
  const recipient=emailState.recipient||state.user.email;
  root.innerHTML=`<h2>Job preferences &amp; alerts</h2>
  <div class="notice">
    <strong>Your alert email</strong>
    <p><code>${esc(recipient)}</code></p>
    <p class="small">Alerts belong to your Secret J account and can never go to another user's email or the administrator's mailbox.</p>
    <p class="small"><strong>Email status:</strong> ${verified?'Verified':'Not verified yet'}.
      ${emailReady?'Email delivery is available.':'Email service is not configured by Secret J yet.'}</p>
    <div class="actions">
      <button class="btn secondary" type="button" data-email-test ${emailReady?'':'disabled'}>${verified?'Send test email':'Send test &amp; verification code'}</button>
    </div>
    ${verified?'':`<form id="email-verify-form" class="actions">
      <label>6-digit code from your inbox<input name="code" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" required placeholder="000000"></label>
      <button class="btn secondary" type="submit" ${emailReady?'':'disabled'}>Verify my email</button>
    </form>`}
    <p class="small">The test goes only to the email shown above. Sending is limited to once every 15 minutes. A successful request means the mail provider accepted it, not guaranteed inbox delivery.</p>
  </div>
  <p class="muted">Choose the jobs you want alerts about. Preferences are stored privately in Neon; automatic emails require verification, opt-in and activated mail service.</p>
  <form id="preferences-form">
  <label><span><input type="checkbox" name="egypt_only" style="width:auto" ${p.egypt_only?'checked':''}> Egypt-based opportunities</span></label>
  <label><span><input type="checkbox" name="internships" style="width:auto" ${p.internships?'checked':''}> Include internships</span></label>
  <label>Maximum preferred experience (years)<input name="max_experience_years" type="number" min="0" max="10" value="${Number(p.max_experience_years)}"></label>
  <h3>Role families</h3><div class="grid">
  ${[['software','Software Engineering'],['ai_ml','AI / ML'],['cv','Computer Vision'],['mlops','MLOps']].map(([v,label])=>
   `<label><span><input type="checkbox" style="width:auto" name="roles" value="${v}" ${p.role_families.includes(v)?'checked':''}> ${label}</span></label>`).join('')}</div>
  <label><span><input type="checkbox" name="email_alerts" style="width:auto" ${p.email_alerts?'checked':''}> Enable job alerts to my verified account email</span></label>
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
  root.innerHTML=`<h2>CV and profile photo</h2>
    <p class="muted">Your files are stored privately in Neon and available only to your account.</p>
    ${avatar.found?`<img class="avatar" alt="Your profile photo" src="data:${esc(avatar.file.mime_type)};base64,${esc(avatar.file.base64)}">`:
      '<div class="avatar" aria-label="No profile photo"></div>'}
    <div class="filebox"><h3>Profile photo</h3>
      <p class="small muted">Upload a JPG, PNG or WebP. Drag the image to center your face, then use the Zoom control. Preview before saving.</p>
      <input id="avatar-upload" type="file" accept="image/jpeg,image/png,image/webp"></div>
    <div class="filebox"><h3>My CV</h3>
      <p>${cv.found?`Saved: <strong>${esc(cv.file.original_name)}</strong> (${Math.round(cv.file.size_bytes/1024)} KB)`:'No CV uploaded yet.'}</p>
      <p class="small muted">PDF or DOCX up to 768 KB. After uploading, readable sections are automatically imported into empty profile fields; existing information is never overwritten.</p>
      <input id="cv-upload" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document">
      ${cv.found?`<div class="actions">
        <button type="button" class="btn secondary" data-preview-cv aria-label="Preview saved CV">
          <svg class="sj-eye-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>Preview CV</button>
        <button type="button" class="btn secondary" data-download-cv>Download</button>
        <button type="button" class="btn secondary" data-import-cv>Re-import to profile</button>
        <button type="button" class="btn danger" data-delete-cv>Delete CV</button>
      </div>`:''}
    </div>`;
}
function fileFromStoredCV(file){
  if(!file||!['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.mime_type))
    throw Error('Unsupported saved CV');
  const bytes=Uint8Array.from(atob(file.base64),ch=>ch.charCodeAt(0));
  return new File([bytes],file.original_name||'resume.pdf',{type:file.mime_type});
}
let cvPreviewURL=null;
async function previewCV(){
  const {found,file}=await api(dataUrl('cv'));
  if(!found)throw Error('Upload a CV first.');
  const saved=fileFromStoredCV(file);
  const dialog=$('#sj-cv-preview'),frame=$('#sj-preview-pdf'),pre=$('#sj-preview-text');
  $('#sj-preview-title').textContent='CV preview: '+(file.original_name||'Resume');
  frame.hidden=true;pre.hidden=true;pre.textContent='';
  if(saved.type==='application/pdf'){
    cvPreviewURL=URL.createObjectURL(saved);
    frame.src=cvPreviewURL;frame.hidden=false;
  }else{
    if(!window.SecretJCVParser)throw Error('Word preview parser is not available');
    pre.textContent=await window.SecretJCVParser.extractText(saved);
    pre.hidden=false;
  }
  dialog.showModal();
}
async function importCVProfile(file){
  if(!window.SecretJCVParser)throw Error('The CV parser is unavailable.');
  const parsed=await window.SecretJCVParser.extract(file);
  const current=(await api(dataUrl('profile'))).profile||{};
  const merged={};
  for(const field of window.SecretJCVParser.fields){
    merged[field]=String(current[field]||'').trim()||
      String(parsed[field]||'').trim();
  }
  const count=window.SecretJCVParser.fields.filter(k=>!String(current[k]||'').trim()&&String(parsed[k]||'').trim()).length;
  if(count)await api(dataUrl('profile'),'PUT',merged);
  return count;
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
$('#sj-preview-close')?.addEventListener('click',()=>$('#sj-cv-preview').close());
$('#sj-cv-preview')?.addEventListener('close',()=>{
  $('#sj-preview-pdf').removeAttribute('src');
  $('#sj-preview-text').textContent='';
  if(cvPreviewURL){URL.revokeObjectURL(cvPreviewURL);cvPreviewURL=null;}
});
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
    if(form.id==='email-verify-form'){
      await api('/api/secretj-email?action=verify','POST',{code:String(values.code||'')});
      await showView('preferences');
      banner('Email verified. You can now opt in to job alerts.');
      return;
    }
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
    if(b.hasAttribute('data-email-test')){
      b.disabled=true;
      try{
        const result=await api('/api/secretj-email?action=test','POST',{});
        await showView('preferences');
        banner(result.needs_verification?
          'Test email sent to your account email. Enter the code to verify it.':
          'Test message accepted by the mail provider. Check your inbox.');
      }finally{b.disabled=false;}
      return;
    }
    if(b.hasAttribute('data-preview-cv'))return await previewCV();
    if(b.hasAttribute('data-import-cv')){
      const {found,file}=await api(dataUrl('cv'));
      if(!found)throw Error('No saved CV');
      const count=await importCVProfile(fileFromStoredCV(file));
      await showView('profile');banner(count?count+' new profile fields imported from your CV.':'Your existing profile is already complete, or no new fields were recognized.');
      return;
    }
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
      const mime=file.type||
        (file.name.toLowerCase().endsWith('.pdf')?'application/pdf':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      await api(dataUrl('cv'),'POST',{name:file.name,mime,content:await readBase64(file)});
      try{
        const count=await importCVProfile(file);
        await showView('profile');
        banner(count?
          'CV saved to Neon. '+count+' profile fields auto-filled. Review and edit any details.':
          'CV saved. No new fields recognized; existing profile details were preserved.');
      }catch(parseError){
        await showView('documents');
        banner('CV saved to Neon. Automatic parsing could not complete: '+parseError.message,true);
      }
    }
    if(input.id==='avatar-upload'&&input.files[0]){
      if(!window.SecretJAvatarCrop)throw Error('Photo editor unavailable.');
      const file=await window.SecretJAvatarCrop.open(input.files[0]);
      if(!file)return; // Cancel leaves the stored avatar untouched.
      await api(dataUrl('avatar'),'POST',{mime:'image/webp',content:await readBase64(file)});
      await syncHeaderPhoto();
      await showView('documents');
      banner('Your centered profile photo was saved to Neon.');
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
    else {
      showAuth();
      // An anonymous session response does not verify database connectivity.
      // Report configuration errors without showing credentials or internals.
      try {
        const response=await fetch('/api/secretj-health',{
          credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}
        });
        const health=await response.json().catch(()=>({}));
        if(!response.ok){
          const reason=health.database;
          const message=reason==='not_configured'?
            'Neon is not connected to Vercel. Set Neon database connection setting in the Vercel Production environment and redeploy.':
            reason==='migration_required'?
            'The database connection works, but required Secret J tables are missing. Run database migration 001 in Neon.':
            reason==='connection_failed'?
            'Neon connection failed. Check the current Neon database connection setting in Vercel and review the Function logs.':
            response.status===404?
            'This deployment does not include the new account API. Deploy the latest main branch on Vercel.':
            'Account setup is not ready. Check the Neon connection and Vercel deployment.';
          banner(message,true);
        }else if(!health.registration_enabled){
          banner('Sign up is not enabled yet. Existing members can sign in. Enable SECRETJ_REGISTRATION_ENABLED in Vercel to register new accounts.');
        }
      }catch{
        banner('Account services are currently unavailable. Confirm the latest Vercel deployment is ready.',true);
      }
    }
  }catch(e){showAuth();banner('Backend unavailable. The existing job feed still works; '+e.message,true);}
})();
})();
