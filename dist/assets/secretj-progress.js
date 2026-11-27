'use strict';
(function(root,factory){
 const api=factory(root);
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root){root.SecretJProgress=api;api.install();}
})(typeof window!=='undefined'?window:null,function(win){
 const pending=new Map();let serial=0,showTimer=null,compactTimer=null,startedAt=0,visible=false,installed=false,ui=null;
 const SHOW_DELAY=160,COMPACT_AFTER=2000;
 function ensure(){
  if(ui?.isConnected)return ui;
  const doc=win?.document;if(!doc?.body)return null;
  ui=doc.createElement('div');ui.id='sj-operation-progress';ui.hidden=true;
  ui.setAttribute('role','status');ui.setAttribute('aria-live','polite');ui.setAttribute('aria-atomic','true');
  const rail=doc.createElement('span');rail.className='sj-progress-rail';rail.setAttribute('aria-hidden','true');
  const pill=doc.createElement('span');pill.className='sj-progress-pill';
  const ring=doc.createElement('span');ring.className='sj-progress-spinner';ring.setAttribute('aria-hidden','true');
  const label=doc.createElement('span');label.className='sj-progress-label';pill.append(ring,label);ui.append(rail,pill);doc.body.append(ui);return ui;
 }
 function render(){
  const node=ensure();if(!node)return;
  node.hidden=!visible||pending.size===0;
  const compact=Date.now()-startedAt>=COMPACT_AFTER;
  node.classList.toggle('sj-progress-compact',compact);
  const entries=Array.from(pending.values());
  const latest=entries.filter(x=>x.explicit).at(-1)||entries.at(-1);
  const label=node.querySelector('.sj-progress-label');
  const value=compact?'Still working…':latest?.label||'Loading…';
  if(label.textContent!==value)label.textContent=value;
 }
 function begin(label='Loading…',explicit=true){
  if(!win)return ()=>{};
  const id=++serial;
  if(!pending.size){
   startedAt=Date.now();visible=false;
   showTimer=win.setTimeout(()=>{if(pending.size){visible=true;render();}},SHOW_DELAY);
   compactTimer=win.setTimeout(()=>{if(pending.size&&visible)render();},COMPACT_AFTER);
  }
  pending.set(id,{label,explicit});
  if(visible)render();
  let done=false;
  return ()=>{
   if(done)return;done=true;pending.delete(id);
   if(!pending.size){win.clearTimeout(showTimer);win.clearTimeout(compactTimer);visible=false;}
   if(ui||visible)render();
  };
 }
 async function track(work,label){const finish=begin(label);try{return await (typeof work==='function'?work():work);}finally{finish();}}
 function requestLabel(url,method){
  if(method!=='GET'&&method!=='HEAD'){
   if(/secretj-auth/.test(url.pathname))return 'Updating your account…';
   if(/secretj-botfolio/.test(url.pathname))return url.searchParams.get('action')==='chat'?'Preparing your answer…':'Updating portfolio…';
   if(/email/.test(url.pathname))return 'Processing email…';
   return 'Saving changes…';
  }
  if(/secretj-botfolio/.test(url.pathname))return 'Loading portfolio…';
  if(/secretj-auth/.test(url.pathname))return 'Loading account…';
  if(/secretj-native-status/.test(url.pathname))return 'Loading matching jobs…';
  if(/secretj-data/.test(url.pathname))return 'Loading your workspace…';
  return 'Loading data…';
 }
 function install(){
  if(!win||installed||typeof win.fetch!=='function')return;installed=true;
  const original=win.fetch;
  win.fetch=function(input,init){
   let url,method;try{url=new URL(typeof input==='string'||input instanceof URL?input:input.url,win.location.href);method=String(init?.method||input?.method||'GET').toUpperCase();}catch{return original.apply(this,arguments);}
   // Do not track third-party requests, imagery, silent status polls or telemetry.
   const background=method==='GET'&&(/\/api\/secretj-(health|native-status)$/.test(url.pathname)&&url.searchParams.get('action')!=='feed');
   const covered=url.origin===win.location.origin&&!background&&(/^\/api\//.test(url.pathname)||/^\/(data|custom-status|companies|status|history)\.json$/.test(url.pathname));
   if(!covered)return original.apply(this,arguments);
   const finish=begin(requestLabel(url,method),false);
   try{return Promise.resolve(original.apply(this,arguments)).finally(finish);}catch(error){finish();throw error;}
  };
 }
 return {begin,track,install,SHOW_DELAY,COMPACT_AFTER};
});
