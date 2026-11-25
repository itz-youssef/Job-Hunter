(() => {
'use strict';

const $ = q => document.querySelector(q);
const esc = value => String(value ?? '').replace(/[&<>"']/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state = {user:null, view:'overview', profile:null};
let accountProgressDepth=0;
// Private view snapshots live only in this document, never in storage.
// Invalidate on every successful mutation, account change or sign-out.
const accountViews=new Map();
const ACCOUNT_VIEW_TTL_MS=120000;
let accountViewGeneration=0,accountViewRequest=0;
function invalidateAccountViews(){
  accountViews.clear();
  accountViewGeneration++;
}
window.addEventListener('storage',event=>{
  if(event.key==='sj-account-change')invalidateAccountViews();
});
function loadingCards(message='Loading your account information…',count=3){
  return '<section class="sj-loading-shell" role="status" aria-live="polite" aria-busy="true">'+
   '<div class="sj-loading-heading"><span class="sj-loading-ring" aria-hidden="true"></span>'+
   '<div><strong>'+esc(message)+'</strong><small>Retrieving your secure account data…</small></div></div>'+
   '<div class="sj-skeleton-grid" aria-hidden="true">'+Array.from({length:count},()=>(
     '<div class="sj-skeleton-card"><span class="sj-skeleton-line sj-short"></span>'+
     '<span class="sj-skeleton-line sj-wide"></span><span class="sj-skeleton-line sj-medium"></span>'+
     '<span class="sj-skeleton-chip"></span></div>'
   )).join('')+'</div></section>';
}
function setAccountProgress(active,label='Saving changes securely…'){
  const progress=$('#sj-account-progress');
  if(!progress)return;
  accountProgressDepth=Math.max(0,accountProgressDepth+(active?1:-1));
  progress.hidden=accountProgressDepth===0;
  if(active)$('#sj-account-progress-label').textContent=label;
}
function busyButton(button,active,label='Saving…'){
  if(!button)return;
  if(active){
    if(button.dataset.sjBusy==='true')return;
    button.dataset.sjBusy='true';
    button.dataset.sjPreviousLabel=button.innerHTML;
    button.disabled=true;
    button.classList.add('sj-loading-button');
    button.innerHTML='<span class="sj-loading-ring" aria-hidden="true"></span>'+esc(label);
  }else if(button.dataset.sjBusy==='true'){
    button.innerHTML=button.dataset.sjPreviousLabel||'Save';
    button.disabled=false;
    button.classList.remove('sj-loading-button');
    delete button.dataset.sjBusy;
    delete button.dataset.sjPreviousLabel;
  }
}
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
  if(method!=='GET' && endpoint.startsWith('/api/secretj-')) {
    invalidateAccountViews();
    window.dispatchEvent(new Event('secretj-account-changed'));
    try{localStorage.setItem('sj-account-change',Date.now()+':'+Math.random());}catch{}
  }
  return data;
}
const authUrl=action=>'/api/secretj-auth?action='+encodeURIComponent(action);
const dataUrl=scope=>'/api/secretj-data?scope='+encodeURIComponent(scope);
function showAuth() {
  invalidateAccountViews();
  accountViewRequest++;
  $('#account-content').replaceChildren();
  $('#welcome-name').textContent='';
  $('#account-profile-photo')?.removeAttribute('src');
  if($('#account-profile-photo'))$('#account-profile-photo').hidden=true;
  if($('#account-profile-initial'))$('#account-profile-initial').hidden=false;
  $('#account-profile-menu').hidden=true;
  $('#admin-nav').hidden=true;
  $('#account-admin-profile-link').hidden=true;
  $('#auth-panel').hidden=false;
  cancelLoginCode();
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
    if(f && typeof f.base64==='string')f.base64=f.base64.replace(/\s/g,'');
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
async function signedIn(user,{newAccount=false}={}) {
  if(state.user?.id!==user.id)invalidateAccountViews();
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
  await showView(['overview','profile','saved','applications','preferences','documents','admin'].includes(target)?target:(user.role==='admin'?'admin':'overview'));
  const after=new URLSearchParams(location.search).get('after');
  const goHome=after==='home';
  if(after==='botfolio'){location.assign('/botfolio.html');return;}
  if(newAccount){
    // Trigger onboarding only after the server has successfully created the
    // new account (including verification for OTP signups).
    const displayed=window.SecretJWelcomeTour?.showForNewAccount?.(user.id,()=>{
      if(goHome)location.assign('/');
    });
    if(goHome&&!displayed)location.assign('/');
  }else if(goHome)location.assign('/');
}
let isRegistration=false;
let loginChallenge=null;
let signupChallengeActive=false;
function showLoginCode(challenge,signup=false){
  loginChallenge=challenge;
  signupChallengeActive=signup;
  $('#sj-code-heading').textContent=signup?'Verify your new account':'Verify your sign-in';
  $('#sj-code-description').textContent=signup?'Enter the 6-digit code sent to your email to activate your new account. It expires in 10 minutes.':'Enter the 6-digit code sent to your account email. It expires in 10 minutes.';
  $('#auth-form').hidden=true;
  $('#login-code-panel').hidden=false;
  $('#sj-login-code').value='';
  $('#sj-login-code').focus();
}
function cancelLoginCode(){
  loginChallenge=null;
  signupChallengeActive=false;
  $('#login-code-panel').hidden=true;
  $('#auth-form').hidden=false;
}

function authMode(register) {
  cancelLoginCode();
  isRegistration=register;
  $('#tab-register').classList.toggle('active',register);
  $('#tab-login').classList.toggle('active',!register);
  $('#name-label').hidden=!register;
  $('#confirm-password-label').hidden=!register;
  $('#auth-form').elements.confirm_password.required=register;
  $('#registration-consent').hidden=!register;
  $('#sj-email-code-alternative').hidden=register;
  $('#auth-form').elements.accept_terms.required=register;
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
async function showView(view,{reuse=false}={}) {
  if(view==='admin' && state.user?.role!=='admin')view='overview';
  const root=$('#account-content');
  const previous=state.view;
  const request=++accountViewRequest;
  const generation=accountViewGeneration;
  const userId=state.user?.id;
  state.view=view;
  for(const button of document.querySelectorAll('[data-view]'))
    button.classList.toggle('active',button.dataset.view===view);
  // Administration and explicit refreshes always use fresh server data.
  const cached=reuse&&view!=='admin'?accountViews.get(view):null;
  if(cached&&cached.userId===userId&&Date.now()-cached.at<ACCOUNT_VIEW_TTL_MS){
    if(previous!==view||root.getAttribute('aria-busy')==='true')root.innerHTML=cached.html;
    root.removeAttribute('aria-busy');
    return;
  }
  root.innerHTML=loadingCards(view==='preferences'?'Loading preferences and alerts…':
    view==='documents'?'Loading your CV and photo…':
    view==='profile'?'Loading your profile…':
    view==='saved'?'Loading saved opportunities…':
    view==='applications'?'Loading your applications…':
    'Preparing your dashboard…',view==='profile'?4:3);
  root.setAttribute('aria-busy','true');
  // Render member views off-DOM so a slower response cannot overwrite the
  // next page when the user switches tabs quickly.
  const target=view==='admin'?root:document.createElement('div');
  const current=()=>request===accountViewRequest&&state.user?.id===userId&&generation===accountViewGeneration;
  try {
    if(view==='overview')await overview(target);
    else if(view==='profile')await profile(target);
    else if(view==='saved')await saved(target);
    else if(view==='applications')await applications(target);
    else if(view==='preferences')await preferences(target);
    else if(view==='documents')await documents(target);
    else if(view==='admin')return await admin(root);
    if(!current()){
      // A write or another tab may invalidate data while this view loads.
      // Restart only if this is still the visible view for the same account.
      if(request===accountViewRequest&&state.user?.id===userId&&generation!==accountViewGeneration)return showView(view);
      return;
    }
    root.innerHTML=target.innerHTML;
    if(target.sjProfile!==undefined)state.profile=target.sjProfile;
    if(target.sjWelcomeName!==undefined)$('#welcome-name').textContent=target.sjWelcomeName;
    if(userId)accountViews.set(view,{html:target.innerHTML,at:Date.now(),userId});
  }catch(e){if(current())root.textContent='Could not load this section. '+e.message;}
  finally{if(request===accountViewRequest)root.removeAttribute('aria-busy');}
}
async function overview(root) {
  const [savedData,apps,cv,profileData]=await Promise.all([
    api(dataUrl('saved')),api(dataUrl('applications')),
    api(dataUrl('cv')),api(dataUrl('profile'))
  ]);
  root.sjProfile=profileData.profile;
  const name=profileData.profile?.display_name||'';
  root.sjWelcomeName=name?', '+name.split(' ')[0]:'';
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
    api('/api/secretj-linkedin?action=status').catch(error=>({configured:false,connected:false,status_error:String(error.message||'Request failed').slice(0,160)}))
  ]);
  const profileRecord=data.profile||{};
  root.sjProfile=profileRecord;
  const detailedReady=data.details_ready!==false;
  const connection=linked.connection||null;
  const issues=Array.isArray(linked.setup_issues)?linked.setup_issues:[];
  const issuesText={
    LINKEDIN_CLIENT_ID_missing:'LinkedIn connection is temporarily unavailable. Please try again later.',
    LINKEDIN_CLIENT_SECRET_missing:'LinkedIn connection is temporarily unavailable. Please try again later.',
    LINKEDIN_REDIRECT_URI_mismatch:'LinkedIn connection is temporarily unavailable. Please try again later.',
    LINKEDIN_DATABASE_MIGRATION_REQUIRED:'LinkedIn connection is temporarily unavailable. Please try again later.'
  };
  const diagnosis=issues.map(key=>issuesText[key]).filter(Boolean).join('; ')||
    (linked.status_error?'LinkedIn connection status is temporarily unavailable.':'');
  const photo=linked.connected&&connection?.picture_url?
     `<img class="linkedin-photo" src="${esc(connection.picture_url)}" alt="LinkedIn photo" referrerpolicy="no-referrer">`:'';
  const connect=linked.connected?
    `<button class="btn sj-linkedin-disconnect" style="background:#c62828!important;color:#fff!important;border:1px solid #c62828!important" type="button" data-linkedin-disconnect>Disconnect LinkedIn</button>`:
    linked.status_error?
      '<button class="btn sj-linkedin-connect" type="button" data-linkedin-retry>Retry LinkedIn status</button>':
    linked.configured?
      '<a class="btn sj-linkedin-connect" style="background:#0a66c2!important;color:#fff!important;border:1px solid #0a66c2!important" href="/api/secretj-linkedin?action=start" aria-label="Connect your LinkedIn profile">Connect with LinkedIn ↗</a>':
      '<button class="btn secondary" type="button" data-linkedin-disabled>LinkedIn setup required</button>';
  root.innerHTML=`<h2>Professional profile</h2>
    <p class="muted">Describe your experience, education, and skills. Your information is saved privately to your account.</p>
    <div class="provider-row">
      ${photo}<div class="spacer"><strong>LinkedIn profile connection</strong>
      <p class="small muted">${linked.connected?
        `Connected as ${esc(connection?.full_name||'LinkedIn member')}. Name, email and photo metadata are saved privately.`:
        'With your permission, LinkedIn shares basic identity information (name, email, photo). Work history, education and skills are not provided by standard LinkedIn sign-in; import those from your CV.'}</p>
      ${linked.configured?'':`<p class="tiny" role="status">${esc(diagnosis||'LinkedIn configuration could not be verified. Check the deployed Worker environment and that the status API is reachable.')}. Your CV profile remains available.</p>`}</div>
      ${connect}
    </div>
    <p class="small muted">Your login email and alert destination never change automatically when you connect LinkedIn.</p>
    <form id="profile-form" class="grid">
      ${formField('display_name','Full name',profileRecord)}
      ${formField('headline','Professional headline',profileRecord)}
      ${formField('location','Location',profileRecord)}
      ${formField('skills','Skills',profileRecord,true)}
      ${formField('summary','About me',profileRecord,true)}
      ${formField('experience','Work experience',profileRecord,true)}
      ${formField('education','Education',profileRecord,true)}
${detailedReady?`
      ${formField('projects','Projects — role, technologies and achievements',profileRecord,true)}
      ${formField('certifications','Certifications and licences',profileRecord,true)}
      ${formField('languages','Languages and proficiency',profileRecord,true)}
      ${formField('awards','Awards and achievements',profileRecord,true)}
      ${formField('volunteering','Volunteering and leadership',profileRecord,true)}
      ${formField('training','Courses and training',profileRecord,true)}
      ${formField('publications','Publications and research',profileRecord,true)}
      `:'<p class="wide small muted">Some profile fields are temporarily unavailable. Your existing information is preserved.</p>'}
      ${formField('linkedin','LinkedIn profile URL',profileRecord)}
      ${formField('github','GitHub URL',profileRecord)}
      ${formField('portfolio','Portfolio URL',profileRecord)}
      <button class="btn wide" type="submit">Save my profile</button>
    </form>
    ${state.user?.role==='member'?'<section class="sj-danger-zone"><h3>Delete your account</h3><p>Permanently remove your Secret J account, profile, CV, saved jobs, applications and sessions. This cannot be undone.</p><button class="btn sj-delete-account" type="button" data-delete-account>Delete account permanently</button></section>':''}`;
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
  const nativeStatus=await api('/api/secretj-native-status').catch(()=>null);
  const currentScan=nativeStatus?.immediate_scan;
  const scanLabel=currentScan?.status==='running'?'Immediate scan in progress':
    currentScan?.status==='complete'?'Immediate scan completed':
    ['failed','timed_out'].includes(currentScan?.status)?'Immediate scan did not complete; scheduled monitoring will retry':
    'No immediate source scan requested yet';
  const nativeProgress=nativeStatus?.configured?
    `Monitoring initialized · ${Number(nativeStatus.counts?.sent||0)} new-job alerts sent · ${Number(nativeStatus.counts?.pending||0)} awaiting dispatch`:
    'First monitoring pass will establish a baseline. Existing jobs are not emailed.';
  const emailReady=emailState.configured===true;
  const verified=emailState.verified===true;
  const recipient=emailState.recipient||state.user.email;
  root.innerHTML=`<h2>Job preferences &amp; alerts</h2>
  <div class="notice">
    <strong>Your alert email</strong>
    <label>Choose where you receive alerts
      <input type="email" id="sj-email-recipient" maxlength="254" required autocomplete="email" value="${esc(recipient)}">
    </label>
    <p class="small">Choose your own address. We'll email a confirmation code to prove you control it before any job alerts can be sent there. Your email address is saved privately to your account.</p>
    <p class="small"><strong>Email status:</strong> ${verified?'Verified':'Not verified yet'}.
      ${emailReady?'Email delivery is available.':'Email service is not configured by Secret J yet.'}</p>
    <div class="actions">
      <button class="btn secondary" type="button" data-email-test ${emailReady?'':'disabled'}>${verified?'Send test email':'Send test &amp; verification code'}</button>
    </div>
    ${verified?'':`<form id="email-verify-form" class="actions">
      <label>6-digit code from your inbox<input name="code" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" required placeholder="000000"></label>
      <button class="btn secondary" type="submit" ${emailReady?'':'disabled'}>Verify my email</button>
    </form>`}
    <p class="small">The test goes only to the address you entered above. Sending is limited to once every 15 minutes. A successful request means the mail provider accepted it, not guaranteed inbox delivery.</p>
  </div>
  <div class="notice"><strong>Personalized company monitoring</strong>
    <p class="small">A separate five-minute source watch checks your selected career fields and levels. It prefers official employer-side filters when available; other employers use a clearly identified catalog fallback. The All Detected Jobs catalog stays independent and unfiltered.</p>
    <p class="small"><strong>Subscription status:</strong> ${esc(nativeProgress)}</p>
    <p class="small"><strong>Latest immediate scan:</strong> ${currentScan?.status==='running'?'<span class="sj-loading-ring" aria-hidden="true" style="width:12px;height:12px;border-width:2px;margin:0 6px;vertical-align:middle"></span>':''}${esc(scanLabel)}
    ${currentScan?.completed_at?' · '+esc(new Date(currentScan.completed_at).toLocaleString()):''}</p>
    <p class="small">Changing your saved preferences establishes a fresh baseline; only subsequently detected jobs trigger new messages. Source failures and incomplete career pages can delay alerts.</p>
  </div>
  <p class="muted">Choose the jobs you want alerts about. Your preferences are saved to your account. Email alerts require verification and your permission.</p>
  <form id="preferences-form">
  <label><span><input type="checkbox" name="egypt_only" style="width:auto" ${p.egypt_only?'checked':''}> Egypt-based opportunities</span></label>
  <h3>Target career levels</h3>
  <p class="small">Select any dictionary levels you want. For example, select Entry + Junior + Internship to include graduate, junior and training vacancies. Unknown seniority stays visible as a Potential Match. Leave all levels unchecked to use legacy experience filters.</p>
  <div class="grid" id="career-level-options">
    ${(window.SecretJJobPreferences?.careerLevels||[]).map(({key,label})=>
      `<label><span><input type="checkbox" style="width:auto" name="career_levels" value="${key}" ${((p.career_levels||[]).includes(key)||(key==='director_head_executive'&&(p.career_levels||[]).some(x=>x==='director'||x==='executive')))?'checked':''}> ${label}</span></label>`).join('')}
  </div>
  <label><span><input type="checkbox" name="internships" style="width:auto" ${p.internships?'checked':''}> Legacy: internships only (used when no career levels are selected)</span></label>
  <label>Maximum required experience (years) — optional<input name="max_experience_years" type="number" min="0" max="30" placeholder="Any experience" value="${p.max_experience_years==null?'':Number(p.max_experience_years)}"></label>
  <p class="small">Career fields are optional: selecting only Internship, Entry or another career level matches jobs from any field. Choosing fields as well narrows matches to those fields. Jobs already published when monitoring first starts become your baseline; email alerts are sent only for subsequently detected matches.</p>
  <h3>Career fields</h3><div class="grid">
  ${(window.SecretJJobPreferences?.categories||[]).map(({key:v,label})=>
   `<label><span><input type="checkbox" style="width:auto" name="roles" value="${v}" ${p.role_families.includes(v)?'checked':''}> ${label}</span></label>`).join('')}</div>
  <label><span><input type="checkbox" name="email_alerts" style="width:auto" ${p.email_alerts?'checked':''}> Enable job alerts to my verified email address</span></label>
  <button class="btn" type="submit">Save preferences &amp; scan now</button></form>`;
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
    <p class="muted">Your files are saved privately to your account.</p>
    ${avatar.found?`<img class="avatar" alt="Your profile photo" src="data:${esc(avatar.file.mime_type)};base64,${esc(avatar.file.base64)}">`:
      '<div class="avatar" aria-label="No profile photo"></div>'}
    <div class="filebox"><h3>Profile photo</h3>
      <p class="small muted">Upload a JPG, PNG or WebP. Drag the image to center your face, then use the Zoom control. Preview before saving.</p>
      <input id="avatar-upload" type="file" accept="image/jpeg,image/png,image/webp">${avatar.found?'<button type="button" class="btn secondary" data-delete-avatar>Remove photo</button>':''}</div>
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
  const profileResult=await api(dataUrl('profile'));
  const current=profileResult.profile||{};
  const supported=profileResult.details_ready===false?
    window.SecretJCVParser.fields.filter(field=>!['projects','certifications','languages','awards','volunteering','training','publications'].includes(field)):
    window.SecretJCVParser.fields;
  const merged={};
  for(const field of supported){
    merged[field]=String(current[field]||'').trim()||
      String(parsed[field]||'').trim();
  }
  const count=supported.filter(k=>!String(current[k]||'').trim()&&String(parsed[k]||'').trim()).length;
  if(count)await api(dataUrl('profile'),'PUT',merged);
  return count;
}
async function admin(root){
  if(state.user?.role!=='admin')throw Error('Administrator access required');
  if(!window.SecretJAdmin)throw Error('Administrator console unavailable');
  return window.SecretJAdmin.render(root,api,state);
}

$('#sj-preview-close')?.addEventListener('click',()=>$('#sj-cv-preview').close());
$('#sj-cv-preview')?.addEventListener('close',()=>{
  $('#sj-preview-pdf').removeAttribute('src');
  $('#sj-preview-text').textContent='';
  if(cvPreviewURL){URL.revokeObjectURL(cvPreviewURL);cvPreviewURL=null;}
});
$('#tab-login').addEventListener('click',()=>authMode(false));
$('#tab-register').addEventListener('click',()=>authMode(true));
$('#sj-email-login-toggle').addEventListener('click',async()=>{
  const form=$('#auth-form');
  if(isRegistration)return;
  const email=form.elements.email;
  if(!email.value.trim()||!email.checkValidity()){
    email.reportValidity();
    email.focus();
    return;
  }
  const button=$('#sj-email-login-toggle');
  busyButton(button,true,'Sending code…');
  try{
    const result=await api(authUrl('request-email-login'),'POST',{email:email.value.trim()});
    if(!result.requires_otp||!result.challenge)throw Error('Could not start email-code sign-in');
    showLoginCode(result.challenge,false);
    banner('If this email has an active Secret J account, a sign-in code has been sent. Check your inbox.');
  }catch(error){banner(error.message,true);}
  finally{busyButton(button,false);}
});
$('#auth-form').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget;const button=$('#auth-submit');
  const values=Object.fromEntries(new FormData(form));
  if(isRegistration){
    if(values.password!==values.confirm_password){
      banner('Passwords do not match. Please confirm your password.',true);
      form.elements.confirm_password.focus();
      return;
    }
    delete values.confirm_password;
    if(!form.elements.accept_terms.checked){banner('You must accept the Terms & Conditions and acknowledge the Privacy Policy.',true);return;}
    values.accept_terms=true;
    values.terms_version='2026-11-14';
    values.privacy_version='2026-11-14';
  }
  button.disabled=true;
  try{
    const result=await api(authUrl(isRegistration?'register':'login'),'POST',values);
    form.reset();$('#message').hidden=true;
    if(result.requires_otp){
      if(!result.challenge)throw Error('Sign-in code challenge was not returned');
      showLoginCode(result.challenge,result.otp_purpose==='signup');
      banner(result.otp_purpose==='signup'?'Enter the emailed code to activate your new account.':'We sent a verification code to your email. Enter it to finish signing in.');
      return;
    }
    await signedIn(result.user,{newAccount:isRegistration});
  }catch(e){banner(e.message,true);}
  finally{button.disabled=false;}
});
$('#login-code-form').addEventListener('submit',async event=>{
  event.preventDefault();
  if(!loginChallenge)return banner('Start by requesting a sign-in code.',true);
  const button=$('#sj-login-code-submit');
  busyButton(button,true,'Verifying…');
  try{
    const code=String($('#sj-login-code').value||'').trim();
    const newAccount=signupChallengeActive;
    const result=await api(newAccount?authUrl('verify-signup'):authUrl('verify-login'),'POST',{challenge:loginChallenge,code});
    loginChallenge=null;
    $('#login-code-panel').hidden=true;
    $('#message').hidden=true;
    await signedIn(result.user,{newAccount});
  }catch(error){banner(error.message,true);}
  finally{busyButton(button,false);}
});
$('#sj-login-code-resend').addEventListener('click',async()=>{
  if(!loginChallenge)return;
  const button=$('#sj-login-code-resend');
  busyButton(button,true,'Sending…');
  try{
    await api(signupChallengeActive?authUrl('resend-signup'):authUrl('resend-login'),'POST',{challenge:loginChallenge});
    $('#sj-login-code').value='';
    banner('A new code was sent. Check your inbox.');
  }catch(error){banner(error.message,true);}
  finally{busyButton(button,false);}
});
$('#sj-login-code-cancel').addEventListener('click',()=>{
  cancelLoginCode();
  $('#message').hidden=true;
});
$('#logout').addEventListener('click',async()=>{
  try{await api(authUrl('logout'),'POST');state.user=null;showAuth();banner('Signed out successfully.');}
  catch(e){banner(e.message,true);}
});
$('#account-nav').addEventListener('click',event=>{
  const button=event.target.closest('[data-view]');
  if(button)showView(button.dataset.view,{reuse:true});
});
$('#account-content').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.target;const values=Object.fromEntries(new FormData(form));
  const button=form.querySelector('button[type=submit]');
  if(button)busyButton(button,true,form.id==='preferences-form'?'Saving preferences…':'Saving securely…');
  setAccountProgress(true,form.id==='preferences-form'?
    'Saving your preferences and requesting a fresh job scan…':'Saving your account changes securely…');
  try{
    if(form.id==='email-verify-form'){
      await api('/api/secretj-email?action=verify','POST',{code:String(values.code||'')});
      await showView('preferences');
      banner('Email verified. You can now opt in to job alerts.');
      return;
    }
    if(form.id==='profile-form'){await api(dataUrl('profile'),'PUT',values);state.profile=values;$('#welcome-name').textContent=values.display_name?', '+values.display_name.split(' ')[0]:'';}
    else if(form.id==='preferences-form'){
      await api(dataUrl('preferences'),'PUT',{
        egypt_only:Boolean(form.elements.egypt_only.checked),
        internships:Boolean(form.elements.internships.checked),
        career_levels:[...form.querySelectorAll('input[name=career_levels]:checked')].map(x=>x.value),
        email_alerts:Boolean(form.elements.email_alerts.checked),
        max_experience_years:values.max_experience_years===''?null:Number(values.max_experience_years),
        role_families:[...form.querySelectorAll('input[name=roles]:checked')].map(x=>x.value)
      });
      // Saving preferences immediately starts a NEW account-scoped employer
      // scan. This is separate from the five-minute scheduled monitor.
      // A failed trigger must not pretend that the successful save failed.
      let notice='Preferences saved. ';
      try{
        const trigger=await api('/api/secretj-native-scan','POST',{});
        notice+=trigger.status==='already_running'
          ?'A source scan is already in progress.'
          :'Immediate company-source scan started.';
      }catch{
        notice+='Immediate scan unavailable; the regular five-minute scan remains active.';
      }
      await showView('preferences');
      banner(notice);
      // Refresh the monitoring status after a new scan completes. The Job
      // Feed refreshes independently; never claim completion on HTTP 202.
      if(typeof window!=='undefined'){
        const issuedAt=Date.now();
        const poll=async()=>{
          if(state.view!=='preferences'||Date.now()-issuedAt>25000)return;
          try{
            const result=await api('/api/secretj-native-status');
            const scan=result.immediate_scan;
            if(['complete','failed','timed_out'].includes(scan?.status)){
              await showView('preferences');
              banner(scan.status==='complete'?
                'Immediate source scan completed. Matching opportunities are now available in Job Feed.':
                'Immediate scan could not finish; scheduled monitoring will retry.',
                scan.status!=='complete');
              return;
            }
          }catch{/* Keep periodic monitoring available after transient errors. */}
          setTimeout(poll,2000);
        };
        setTimeout(poll,2000);
      }
      return;
    }else if(form.id==='application-form'){
      await api(dataUrl('applications'),'POST',values);
    }
    banner('Saved securely to your account.');
    await showView(state.view);
  }catch(e){banner(e.message,true);}
  finally{
    busyButton(button,false);
    setAccountProgress(false);
  }
});
$('#account-content').addEventListener('click',async event=>{
  const b=event.target.closest('button');if(!b)return;
  // Admin console controls their own confirmed destructive actions.
  if(b.hasAttribute('data-admin-delete'))return;
  if(b.dataset.sjBusy==='true')return;
  const tracked=!b.dataset.go&&!b.hasAttribute('data-preview-cv')&&!b.hasAttribute('data-download-cv');
  if(tracked){busyButton(b,true,'Working…');setAccountProgress(true,'Updating your account…');}
  try {
    if(b.hasAttribute('data-delete-account')){
      if(state.user?.role!=='member')return banner('Administrator accounts cannot be deleted here.',true);
      const confirmation=prompt('This will permanently delete your account and all its data. Type DELETE to continue.');
      if(confirmation===null)return;
      if(confirmation!=='DELETE')return banner('Deletion cancelled: confirmation did not match.',true);
      const password=prompt('Enter your current account password to permanently delete your account.');
      if(password===null)return;
      await api('/api/secretj-auth?action=delete-account','POST',{confirm:'DELETE',password});
      state.user=null;state.profile=null;showAuth();
      banner('Your account was permanently deleted.');
      return;
    }
    if(b.dataset.go)return showView(b.dataset.go,{reuse:true});
    if(b.hasAttribute('data-email-test')){
      b.disabled=true;
      try{
        const recipientEmail=$('#sj-email-recipient')?.value.trim();
        if(!recipientEmail)throw Error('Enter the address where you want alerts.');
        const result=await api('/api/secretj-email?action=test','POST',{recipient_email:recipientEmail});
        await showView('preferences');
        banner(result.needs_verification?
          'Test email accepted for '+result.delivered_to+'. Enter the code to verify it.':
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
    if(b.hasAttribute('data-linkedin-retry')){
      await showView('profile');
      return;
    }
    if(b.hasAttribute('data-linkedin-disabled'))return banner('LinkedIn setup is not ready. Check the specific diagnostic displayed inside Professional profile.',true);
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
    }else if(b.hasAttribute('data-delete-avatar')){
      if(!confirm('Remove your account photo?'))return;
      await api(dataUrl('avatar'),'DELETE');
      await syncHeaderPhoto();
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
  finally{if(tracked){busyButton(b,false);setAccountProgress(false);}}
});
$('#account-content').addEventListener('change',async event=>{
  const input=event.target;
  const tracked=input.matches('[data-stage]')||
    (input.id==='cv-upload'||input.id==='avatar-upload')&&Boolean(input.files?.[0]);
  if(tracked)setAccountProgress(true,
    input.id==='cv-upload'?'Uploading and processing your CV…':
    input.id==='avatar-upload'?'Preparing your profile photo…':'Updating application status…');
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
          'CV saved to your account. '+count+' profile fields auto-filled. Review and edit any details.':
          'CV saved. No new fields recognized; existing profile details were preserved.');
      }catch(parseError){
        await showView('documents');
        banner('CV saved to your account. Automatic parsing could not complete: '+parseError.message,true);
      }
    }
    if(input.id==='avatar-upload'&&input.files[0]){
      if(!window.SecretJAvatarCrop)throw Error('Photo editor unavailable.');
      const file=await window.SecretJAvatarCrop.open(input.files[0]);
      if(!file)return; // Cancel leaves the stored avatar untouched.
      await api(dataUrl('avatar'),'POST',{mime:'image/webp',content:await readBase64(file)});
      await syncHeaderPhoto();
      await showView('documents');
      banner('Your profile photo was saved to your account.');
    }
  }catch(e){banner(e.message,true);}
  finally{if(tracked)setAccountProgress(false);}
});
(async()=>{
  authMode(new URLSearchParams(location.search).get('mode')==='register');
  const linkedin=new URLSearchParams(location.search).get('linkedin');
  if(linkedin==='error'){
    const reason=new URLSearchParams(location.search).get('reason');
    const message={
      provider:'LinkedIn did not return an approval. Check app permissions and try again.',
      session:'Your Secret J session was not recognized on the LinkedIn callback. Please sign in again on www.jobsnow.tech.',
      response:'LinkedIn returned an incomplete authorization response. Try connecting again.',
      state:'The LinkedIn security request expired or did not match this session. Start a fresh connection.',
      exchange:'LinkedIn approval returned, but the server could not exchange the authorization code for profile access.',
      storage:'LinkedIn approved access, but your connection could not be saved. Please try again.'
    }[reason]||'LinkedIn authorization did not complete.';
    banner(message+' No profile information was changed.',true);
  }
  if(linkedin==='connected')banner('LinkedIn profile connected successfully. Your account information is saved.');
  try {
    const session=await api(authUrl('session'));
    if(session.user)await signedIn(session.user);
    else {
      showAuth();
      window.SecretJStartup?.finish();
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
            'Account services are temporarily unavailable. Please try again later.':
            reason==='migration_required'?
            'Account services are temporarily unavailable. Please try again later.':
            reason==='connection_failed'?
            'Account services are temporarily unavailable. Please try again later.':
            response.status===404?
            'Account services are temporarily unavailable. Please try again later.':
            'Account setup is temporarily unavailable. Please try again later.';
          banner(message,true);
        }else if(!health.registration_enabled){
          banner('Sign up is temporarily unavailable. Existing members can still sign in.');
        }
      }catch{
        banner('Account services are temporarily unavailable. Please try again later.',true);
      }
    }
  }catch(e){showAuth();banner('Account services unavailable. The existing job feed still works; '+e.message,true);}
  finally{window.SecretJStartup?.finish();}
})();
})();
