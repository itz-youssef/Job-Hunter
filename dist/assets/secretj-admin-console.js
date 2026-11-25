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
const modelBudgetCards=(u,r)=>{
 if(!u.per_model)return '<h4>Model usage</h4><p>Per-model usage will appear after a research run publishes its report.</p>';
 const names={'nvidia/nemotron-3-ultra-550b-a55b:free':'NVIDIA Nemotron 3 Ultra','gemini-4-hydrogen':'Gemini 4 Hydrogen','gemini-3.8-flash':'Gemini 3.8 Flash','gemini-3.6-flash':'Gemini 3.6 Flash','openai/gpt-oss-120b':'GPT-OSS-120B (Groq)','gemini-3.5-flash-lite':'Gemini 3.5 Flash Lite'};
 const order=Object.keys(names);
 const rows=order.map(name=>{
  const m=u.per_model[name];
  if(!m||!Number.isFinite(Number(m.limit))||Number(m.limit)<=0)return '<div class="sj-quota-card"><strong>'+html(names[name])+'</strong><p class="muted">Not in this report</p></div>';
  const limit=Number(m.limit),used=Math.max(0,Number(m.system_used??(m.remaining!=null?limit-Number(m.remaining):Math.max(Number(m.used_today||0),Number(m.provider_day_used||0))+Number(m.legacy_debit||0)))||0);
  const ratio=Math.round(100*used/limit),fill=Math.min(100,ratio),full=used>=limit;
  const status=full?'System limit reached':m.budget_block==='nightly-reserve'?'Nightly reserve protected':m.budget_block==='token-system-limit'||m.budget_block==='nightly-token-reserve'?'Token budget restricted':m.budget_block==='shared-system-limit'?'Shared limit reached':'Within system limit';
  return '<div class="sj-quota-card"><div class="sj-quota-title"><strong>'+html(names[name])+'</strong><span>'+html(ratio)+'%</span></div><div class="sj-quota-count">'+html(used)+' <small>/ '+html(limit)+' requests</small></div><div class="sj-quota-track" role="progressbar" aria-label="'+html(names[name]+' system usage')+'" aria-valuemin="0" aria-valuemax="'+html(limit)+'" aria-valuenow="'+html(Math.min(used,limit))+'" aria-valuetext="'+html(used+' of '+limit)+'"><i class="'+(full?'full':ratio>=80?'near':'')+'" style="width:'+fill+'%"></i></div><small class="sj-quota-status">'+html(status)+' · '+html(Math.max(0,limit-used))+' remaining</small><small>Cairo: '+html(m.used_today??'—')+' · Provider day: '+html(m.provider_day_used??'—')+(m.legacy_debit?' · Legacy debit: '+html(m.legacy_debit):'')+'</small>'+(m.benchmark_remaining!=null?'<small>Benchmark available: '+html(m.benchmark_remaining)+' · Nightly reserve: '+html(m.nightly_reserve)+'</small>':'')+'</div>';
 }).join('');
 return '<h4>Daily model budgets — system limits</h4><p class="muted">Last published snapshot: '+html(day(r.updated_at))+' · Cairo day '+html(u.day||r.cairo_day||'—')+'. Includes failed API attempts; local quota skips do not consume requests. Not live provider telemetry.</p><div class="sj-quota-grid">'+rows+'</div>';
};
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
 '<section class="sj-admin-section"><div class="sj-admin-heading"><div><h3>AI Intelligence Lab</h3><p class="muted">Experimental career-level and occupational dictionaries. Production matching and alerts remain unchanged.</p></div><a href="https://github.com/itz-youssef/Job-Hunter/actions/workflows/adaptive-dictionary-research.yml" target="_blank" rel="noopener noreferrer">Research runs ↗</a></div><div id="sj-admin-research" class="muted">Loading shadow evaluation…</div></section>'+
 '<section class="sj-admin-section"><div class="sj-admin-heading"><div><h3>Dictionary conflict review</h3><p class="muted">Approve or reject conflicting proposals. Decisions apply to reviewed shadow dictionaries, not live matching or alerts.</p></div><button class="btn secondary" data-dictionary-export>Download dictionaries (.json)</button></div><div id="sj-admin-dictionary-review" aria-live="polite" class="muted">Loading conflicts…</div></section>'+ 
 '<section class="sj-admin-section"><h3>🛡️ Administrative activity</h3>'+
 (overview.activity||[]).map(a=>'<div class="sj-admin-activity"><strong>'+html(a.action)+'</strong><span>'+html(a.actor_email||'Administrator')+'</span><small>'+html(day(a.created_at))+'</small></div>').join('')+
 (!overview.activity?.length?'<p class="muted">No administrative actions yet.</p>':'')+'</section>'+
 '<div class="notice">Security: actions are checked on the server against your active administrator session. This console does not expose passwords, session tokens, or private CV file contents.</div>';
 api(url+'research-shadow').then(result=>{
  const el=root.querySelector('#sj-admin-research');if(!el)return;
  const r=result.report;
  if(!r){el.textContent='Shadow mode · No research report yet. Configure the research Actions secrets and run the benchmark.';return;}
  const c=r.comparison||{},m=c.benchmark||{},u=r.usage||{},rules=r.rules||{};
  const percent=n=>typeof n==='number'?(n*100).toFixed(1)+'%':'—';
  el.innerHTML='<p>'+badge('Shadow only',false)+' '+badge('Production unchanged',true)+' · '+html(r.status)+' · '+html(day(r.updated_at))+'</p>'+
   (Array.isArray(r.missing)&&r.missing.length?'<p>Missing Actions secrets: '+html(r.missing.join(', '))+'</p>':'')+
   '<div class="sj-admin-kpis">'+[
    ['Companies reviewed',r.companies_reviewed],['Companies with evidence',r.companies_with_evidence],['Live source pages',r.live_sources],['Job documents',r.job_documents],['Validated proposals',r.validated],['Career candidates',rules.career],['Family candidates',rules.family],['Cross-checked rules',rules.cross_checked],['Rejected proposals',r.rejected],['Changed career levels',c.changed_level],['Changed job families',c.changed_family],['Model calls today',u.model_request_limit?`${u.model_requests_today} / ${u.model_request_limit}`:u.model_requests_today],['Search credits this month',u.search_credits_month]
   ].map(([k,v])=>'<div class="sj-admin-kpi"><strong>'+html(v??'—')+'</strong><small>'+html(k)+'</small></div>').join('')+'</div>'+
   '<p>Models: '+html((r.models_used||[]).join(', ')||'Not run')+' · Failed batches: '+html(r.failed_batches??'—')+' · Search failures: '+html(r.search_failures??'—')+'</p>'+ (Array.isArray(r.errors)&&r.errors.length?'<p>Research diagnostics: '+html(r.errors.join(', '))+'</p>':'')+
   modelBudgetCards(u,r)+
   (u.groq_token_limit?'<p>Groq rolling 24h token budget: '+html(u.groq_tokens_rolling_24h)+' / '+html(u.groq_token_limit)+' · Nightly token reserve '+html(u.groq_token_nightly_reserve)+'</p>':'')+
   (r.evidence_preparation?'<p>Evidence preparation: '+html(r.evidence_preparation.completed)+' / '+html(r.evidence_preparation.planned)+' · verified excerpts '+html(r.evidence_preparation.excerpts_used)+' · deterministic fallback '+html(r.evidence_preparation.fallback)+'</p>':'')+
   '<p><strong>Existing semantic-role regression set:</strong> '+html(m.old?.n??'—')+' cases. Current precision '+html(percent(m.old?.precision))+' / recall '+html(percent(m.old?.recall))+'; shadow precision '+html(percent(m.shadow?.precision))+' / recall '+html(percent(m.shadow?.recall))+'. Not a production accuracy estimate.</p>'+
   (r.google_slot?'<h4>Second researcher fallback routing</h4><p>'+html((r.google_slot.ordered_models||[]).join(' → '))+'</p>'+ (r.google_slot.attempts||[]).map(x=>'<div class="sj-admin-activity"><strong>'+html(x.model)+'</strong><small>'+html(x.stage)+' · '+html(x.outcome==='skipped'?'Skipped — '+(x.code||'unavailable')+' (no request charged)':x.code||x.outcome)+'</small></div>').join(''):'')+
   (Array.isArray(r.model_benchmark)?'<h4>Model benchmark — existing reference</h4>'+r.model_benchmark.map(x=>'<div class="sj-admin-activity"><strong>'+html(x.model==='gemini-4-hydrogen'?'Independent research slot':x.model)+'</strong><small>'+ (Array.isArray(x.actual_models)?'Actual: '+html(x.actual_models.join(', ')||'None')+' · ':'')+'Answered '+html(x.answered)+' / '+html(x.expected_cases)+' · Precision '+html(percent(x.metrics?.precision))+' · Recall '+html(percent(x.metrics?.recall))+' · Level accuracy '+html(percent(x.level_reference?.accuracy))+' ('+html(x.level_reference?.answered??0)+' / '+html(x.level_reference?.expected_cases??0)+')</small></div>').join(''):'')+
   '<p>'+html(r.note||'No research model has access to email dispatch.')+'</p>'+
   (Array.isArray(c.changes)&&c.changes.length?'<h4>Sample differences — review required</h4>'+c.changes.slice(0,20).map(j=>'<div class="sj-admin-activity"><strong>'+html(j.company)+' · '+html(j.title)+'</strong><small>'+html((j.before?.families||[]).join(', '))+' / '+html(j.before?.level||'unknown')+' → '+html((j.after?.families||[]).join(', '))+' / '+html(j.after?.level||'unknown')+'</small></div>').join(''):'');
 }).catch(()=>{const el=root.querySelector('#sj-admin-research');if(el)el.textContent='Research report unavailable. Production unaffected.';});
 const reviewEl=root.querySelector('#sj-admin-dictionary-review');
 const evidence=r=>{
  const quote=r.evidence?.quote,link=r.evidence?.url;
  let source='';try{const u=new URL(link);if(u.protocol==='https:')source='<a href="'+html(u.href)+'" target="_blank" rel="noopener noreferrer">Open source ↗</a>';}catch{}
  return '<div style="overflow-wrap:anywhere;min-width:0"><strong>'+html(r.level||r.family||'Unknown')+'</strong> · '+html(r.alias||r.title||'')+' <small>'+html(r.source||r.status||'')+'</small>'+(quote?'<p>'+html(quote)+'</p>':'')+(r.evidence?.corroboration?'<p>'+html(r.evidence.corroboration)+'</p>':'')+source+(r.models?.length?'<p class="muted">'+html(r.models.join(', '))+'</p>':'')+'</div>';
 };
 async function loadReview(){
  try{
   const r=await api(url+'dictionary-review');
   if(!root.isConnected)return;
   const rows=r.conflicts||[],counts=r.counts||{};
   reviewEl.innerHTML='<p>'+badge((counts.pending||0)+' pending',false)+' '+badge((counts.reviewed||0)+' reviewed',true)+' · '+html(counts.career||0)+' career proposals · '+html(counts.family||0)+' family proposals</p>'+
    (rows.length?rows.map(c=>'<article class="sj-admin-section" style="margin:12px 0;overflow-wrap:anywhere"><div class="sj-admin-heading"><div><strong>'+html(c.proposal.company)+' · '+html(c.proposal.alias||c.proposal.title||'')+'</strong><p class="muted">'+html(c.reason)+'</p></div>'+badge(c.decision?c.decision.decision==='approve'?'Approved':'Rejected':'Pending review',!!c.decision)+'</div><div class="sj-admin-cols"><div><h4>Existing rule / alternatives</h4>'+(c.existing.length?c.existing.map(evidence).join('<hr>'):'<p class="muted">No existing rule in the snapshot.</p>')+'</div><div><h4>Proposed change</h4>'+evidence(c.proposal)+'</div></div>'+
     (c.decision?'<p class="muted">Reviewed '+html(day(c.decision.reviewed_at))+(c.selected_rule_key&&c.selected_rule_key!==c.key?' · Another proposal selected for this alias':'')+'</p>':'<div class="item-actions"><button class="btn" data-dictionary-decision="approve" data-rule-key="'+html(c.key)+'" data-rule-revision="'+html(c.revision)+'">Approve proposed rule</button><button class="btn secondary" data-dictionary-decision="reject" data-rule-key="'+html(c.key)+'" data-rule-revision="'+html(c.revision)+'">Reject · keep existing</button></div>')+'</article>').join(''):'<p class="muted">No conflicts to review yet. New conflicts appear after the daily research run.</p>');
  }catch(err){reviewEl.textContent='Dictionary review unavailable: '+err.message;}
 }
 loadReview();
 reviewEl.addEventListener('click',async e=>{
  const b=e.target.closest('[data-dictionary-decision]');if(!b||b.disabled)return;
  const action=b.dataset.dictionaryDecision;
  if(!confirm(action==='approve'?'Approve this proposed rule in the reviewed shadow dictionary? Production remains unchanged.':'Reject this proposal and keep the existing reviewed rules?'))return;
  [...reviewEl.querySelectorAll('button')].forEach(x=>x.disabled=true);
  try{await api(url+'dictionary-review','PATCH',{key:b.dataset.ruleKey,revision:b.dataset.ruleRevision,decision:action});await loadReview();}
  catch(err){alert('Could not save review: '+err.message);await loadReview();}
 });
 root.querySelector('[data-dictionary-export]').addEventListener('click',async e=>{
  const b=e.currentTarget;b.disabled=true;
  try{
   const data=await api(url+'dictionary-export');
   if(data?.mode!=='admin-reviewed-shadow')throw Error('Invalid dictionary export');
   const blob=new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'});
   const link=document.createElement('a'),objectUrl=URL.createObjectURL(blob);
   link.href=objectUrl;link.download='secretj-dictionaries-'+new Date().toISOString().slice(0,10)+'.json';
   document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
  }catch(err){alert('Could not download dictionaries: '+err.message);}finally{b.disabled=false;}
 });
 const list=root.querySelector('#sj-admin-users');
 function paint(filter=''){
  const matching=(users.users||[]).filter(u=>
    (u.email+' '+(u.display_name||'')+' '+u.role).toLowerCase().includes(filter.toLowerCase()));
  list.innerHTML=matching.map(u=>'<article class="sj-admin-user"><div><strong>'+html(u.display_name||u.email)+'</strong><small>'+html(u.email)+'</small>'+
   '<div>'+badge(u.role,u.role==='admin')+' '+badge(u.is_active?'Active':'Suspended',u.is_active)+'</div></div>'+
   '<div class="item-actions"><button class="btn secondary" data-admin-detail="'+html(u.id)+'">Details</button>'+
   (u.id===state.user.id?'<small>Your account</small>':
     '<button class="btn secondary" data-admin-id="'+html(u.id)+'" data-admin-field="role" data-admin-value="'+(u.role==='admin'?'member':'admin')+'">'+(u.role==='admin'?'Demote':'Make admin')+'</button>'+
     '<button class="btn secondary" data-admin-id="'+html(u.id)+'" data-admin-field="is_active" data-admin-value="'+(u.is_active?'false':'true')+'">'+(u.is_active?'Suspend':'Activate')+'</button>'+ (u.role==='member'?'<button class="btn sj-delete-account" data-admin-delete="'+html(u.id)+'" data-admin-email="'+html(u.email)+'">Delete account</button>':''))+
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
  const b=e.target.closest('[data-admin-detail],[data-admin-revoke],[data-admin-delete]');
  if(!b||!root.contains(b))return;
  const target=root.querySelector('#sj-admin-detail');
  try{
   if(b.hasAttribute('data-admin-delete')){
     if(state.user?.role!=='admin')throw Error('Administrator access required');
     const email=b.dataset.adminEmail||'this member';
     const confirmed=prompt('Permanently delete '+email+' and all associated data? Type DELETE to confirm.');
     if(confirmed!=='DELETE')return;
     b.disabled=true;
     try{
       await api(url+'delete-user','DELETE',{id:b.dataset.adminDelete,confirm:'DELETE'});
       await render(root,api,state);
     }finally{b.disabled=false;}
     return;
   }
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
