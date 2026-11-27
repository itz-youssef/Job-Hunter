'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('dist/assets/secretj-progress.js','utf8');
function browser(fetch){
 let now=0,seq=0;const timers=new Map(),nodes=new Map();
 function make(){
  const classes=new Set(),children=[];
  return {hidden:false,isConnected:false,textContent:'',className:'',children,
   setAttribute(){},classList:{toggle(name,value){if(value)classes.add(name);else classes.delete(name);},contains:n=>classes.has(n)},
   append(...n){children.push(...n);},
   querySelector(sel){const walk=n=>{if(n.className===sel.slice(1))return n;for(const c of n.children){const hit=walk(c);if(hit)return hit;}};return walk(this);}
  };
 }
 const body={append(node){node.isConnected=true;nodes.set(node.id,node);}};
 const window={document:{body,createElement:make},location:{href:'https://secret.example/',origin:'https://secret.example'},fetch,
   setTimeout(fn,ms){const id=++seq;timers.set(id,{fn,at:now+ms});return id;},clearTimeout(id){timers.delete(id);}};
 vm.runInNewContext(source,{window,URL,Date:{now:()=>now},Promise,Map,Array});
 function tick(ms){const target=now+ms;while(true){const next=[...timers].filter(([,x])=>x.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].fn();}now=target;}
 const node=()=>nodes.get('sj-operation-progress');
 return {window,p:window.SecretJProgress,tick,node};
}
test('fast operations have no artificial minimum delay or visual flash',async()=>{
 const b=browser(async()=>({ok:true}));const res=await b.window.fetch('/api/secretj-data');assert.equal(res.ok,true);b.tick(2000);assert.equal(b.node(),undefined);
});
test('overlapping operations compact after two seconds and stay truthful until all finish',()=>{
 const b=browser(async()=>({ok:true}));const first=b.p.begin('Reading CV…');const second=b.p.begin('Saving…');
 b.tick(159);assert.equal(b.node(),undefined);b.tick(1);assert.equal(b.node().hidden,false);
 assert.equal(b.node().querySelector('.sj-progress-label').textContent,'Saving…');
 second();second();assert.equal(b.node().hidden,false);assert.equal(b.node().querySelector('.sj-progress-label').textContent,'Reading CV…');
 b.tick(1840);assert.ok(b.node().classList.contains('sj-progress-compact'));assert.equal(b.node().hidden,false);assert.equal(b.node().querySelector('.sj-progress-label').textContent,'Still working…');
 first();assert.equal(b.node().hidden,true);
});
test('fetch preserves response identity, ignores third-party and status polling, clears rejected requests',async()=>{
 let resolve,reject;const response={ok:true};const b=browser(()=>new Promise((r,j)=>{resolve=r;reject=j;}));
 const external=b.window.fetch('https://third.example/api/data');b.tick(2000);assert.equal(b.node(),undefined);resolve(response);assert.equal(await external,response);
 const poll=b.window.fetch('/api/secretj-native-status');b.tick(2000);assert.equal(b.node(),undefined);resolve(response);await poll;
 const request=b.window.fetch('/api/secretj-native-status?action=feed');b.tick(160);assert.equal(b.node().hidden,false);resolve(response);assert.equal(await request,response);assert.equal(b.node().hidden,true);
 const bad=b.window.fetch('/api/secretj-data');b.tick(160);const err=Error('network error');reject(err);await assert.rejects(bad,e=>e===err);assert.equal(b.node().hidden,true);
 await assert.rejects(b.p.track(()=>{throw err;},'Reading CV…'),e=>e===err);b.tick(2000);assert.equal(b.node().hidden,true);
});

test('silent refresh never flashes or extends concurrent foreground progress',async()=>{
 const waiting=new Map(),seen=new Map();
 const b=browser((url,opts)=>{seen.set(url,opts);return new Promise((resolve,reject)=>waiting.set(url,{resolve,reject}));});
 const background=b.window.fetch('/api/secretj-data?scope=avatar',{sjSilent:true,credentials:'same-origin'});
 b.tick(3000);assert.equal(b.node(),undefined);
 assert.equal(seen.get('/api/secretj-data?scope=avatar').sjSilent,undefined);
 assert.equal(seen.get('/api/secretj-data?scope=avatar').credentials,'same-origin');
 const foreground=b.window.fetch('/api/secretj-data?scope=saved',{method:'POST'});
 b.tick(160);assert.equal(b.node().hidden,false);
 assert.equal(b.node().querySelector('.sj-progress-label').textContent,'Saving changes…');
 waiting.get('/api/secretj-data?scope=saved').resolve({ok:true});await foreground;
 assert.equal(b.node().hidden,true);
 b.tick(4000);assert.equal(b.node().hidden,true);
 waiting.get('/api/secretj-data?scope=avatar').resolve({ok:true});await background;
 const failed=b.window.fetch('/api/secretj-native-status?action=feed',{sjSilent:true});
 b.tick(3000);waiting.get('/api/secretj-native-status?action=feed').reject(Error('offline'));
 await assert.rejects(failed,/offline/);assert.equal(b.node().hidden,true);
});
