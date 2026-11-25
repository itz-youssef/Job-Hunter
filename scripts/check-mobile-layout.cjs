const {chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true}); const page=await browser.newPage();
await page.route('**/api/**',async route=>{let u=new URL(route.request().url()),scope=u.searchParams.get('scope'),data={ok:true};
if(u.pathname.includes('auth'))data.user={id:'test',email:'long.email.address.for.mobile.testing@example.com',role:'admin'};
else if(u.pathname.includes('secretj-botfolio'))Object.assign(data,{ai_ready:true,bots:[{id:'123',name:'A long professional portfolio name for a software engineering candidate',headline:'AI and Software Engineer — computer vision and machine learning applications',published:true},{id:'456',name:'Private portfolio draft',headline:'Software engineer',published:false}]});
else if(u.pathname.includes('email'))Object.assign(data,{configured:true,verified:false});
else if(u.pathname.includes('linkedin'))Object.assign(data,{configured:false});
else if(u.pathname.includes('admin'))Object.assign(data,{users:[],summary:{users:1,active_users:1,applications:0},activity:[]});
else if(scope==='preferences')data.preferences={egypt_only:true,internships:true,role_families:['software'],max_experience_years:2};
else if(scope==='profile')data.profile={display_name:'Mobile Test',headline:'Software engineer'};
else if(scope==='saved')data.jobs=[{job_key:'x'.repeat(100),job_snapshot:{title:'A long software engineering opportunity for mobile layouts',company:'Example',url:'https://example.com'},saved_at:new Date().toISOString()}];
else if(scope==='applications')data.applications=[{job_key:'https://example.com/'+ 'x'.repeat(100),title:'A long software engineering opportunity for mobile layouts',company:'Example',stage:'applied'}];
else data.found=false;
await route.fulfill({json:data});});
let failures=[];for(const w of [320,375,390,430,768,1024,1440]){await page.setViewportSize({width:w,height:812});for(const path of ['/#home','/#hunter','/#jobs','/#companies','/#alerts','/#radar','/#resume','/#cv','/#profile','/#saved','/account.html?view=overview','/account.html?view=saved','/account.html?view=admin','/account.html?view=preferences','/account.html?view=documents','/account.html?view=applications','/account.html?view=profile','/manage-companies.html']){await page.goto('http://127.0.0.1:8765'+path);await page.waitForTimeout(250);let result=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,bad:[...document.querySelectorAll('body *')].filter(e=>{let r=e.getBoundingClientRect();return r.width&&r.right>innerWidth+1&&getComputedStyle(e).position!=='absolute'&&!e.closest('nav')}).slice(0,5).map(e=>e.tagName+'.'+e.className)}));if(result.scroll>w+1)failures.push({w,path,...result});} }
// Verify the brand never turns into an inverse-color tile on real browsers.
// Include both page headers, both themes, and narrow/wide pointer viewports.
const hoverFailures=[];
for(const width of [375,1024]){
 for(const theme of ['light','dark']){
  for(const path of ['/#home','/#hunter','/account.html?view=overview']){
   await page.setViewportSize({width,height:812});
   await page.goto('http://127.0.0.1:8765'+path);
   await page.evaluate(t=>localStorage.setItem('jh-theme',t),theme);
   await page.reload();
   // Wait for the app's asynchronous initial theme setup before comparing hover.
   await page.waitForFunction(expected=>document.documentElement.dataset.theme===expected,theme,{timeout:10000});
   // The editorial homepage intentionally hides the legacy sidebar brand.
   const brand=page.locator(['/#home','/#hunter'].includes(path)?'a.sj-land-logo':'a.brand').first();
   const style=()=>brand.evaluate(el=>{
     function visibleBg(node){
       while(node){
         const bg=getComputedStyle(node).backgroundColor;
         if(bg!=='transparent' && bg!=='rgba(0, 0, 0, 0)')return bg;
         node=node.parentElement;
       }
       return '';
     }
     const text=el.querySelector('span')||el;
     return {background:visibleBg(el),color:getComputedStyle(el).color,
       childColor:getComputedStyle(text).color,
       underline:getComputedStyle(el).textDecorationLine};
   });
   await page.mouse.move(1,1);
   const before=await style();
   await brand.hover();
   const after=await style();
   if(before.background!==after.background||before.color!==after.color||
      before.childColor!==after.childColor||after.underline!=='none')
     hoverFailures.push({path,width,theme,before,after});
  }
 }
}
if(hoverFailures.length)failures.push({brand_hover: hoverFailures});
// Botfolio-specific checks: authenticated workspace, all internal views, both themes,
// small phones through 4K, and a sidebar anchored to the viewport on desktop.
for(const w of [320,375,390,430,600,768,900,1024,1280,1440,1920,2560,3840]){
 await page.setViewportSize({width:w,height:900});
 for(const theme of ['light','dark']){
  await page.goto('http://127.0.0.1:8765/botfolio.html#home');
  await page.evaluate(t=>localStorage.setItem('jh-theme',t),theme);
  await page.reload();
  await page.waitForFunction(()=>!document.getElementById('workspace').hidden && document.getElementById('stat-total').textContent==='2');
  for(const view of ['home','botfolio','create','guides']){
   await page.locator('.bf-sidebar nav [data-bf-view="'+view+'"]').click();
   await page.waitForFunction(v=>document.querySelector('.bf-sidebar nav [aria-current="page"]')?.dataset.bfView===v,view);
   const layout=await page.evaluate(v=>{const rect=s=>document.querySelector(s).getBoundingClientRect();const side=rect('.bf-sidebar'),main=rect('.bf-workspace');return {scroll:document.documentElement.scrollWidth,width:innerWidth,sideLeft:side.left,mainRight:main.right,visible:!document.getElementById(({home:'product-home',botfolio:'portfolio-view',create:'create',guides:'guides'})[v]).hidden,theme:document.documentElement.dataset.theme,homeVisible:!document.getElementById('product-home').hidden,toolVisible:!document.getElementById('portfolio-view').hidden,favicon:document.querySelector('link[rel=icon]')?.getAttribute('href'),title:document.title}},view);
   if(layout.scroll>w+1||!layout.visible||layout.homeVisible!==(view==='home')||layout.toolVisible!==(view==='botfolio')||layout.favicon!=='/favicon.svg'||!layout.title.startsWith('Secret J')||layout.theme!==theme||(w>900&&(Math.abs(layout.sideLeft)>1||Math.abs(layout.mainRight-w)>20)))failures.push({botfolio:view,w,theme,...layout});
  }
 }
}

// Verify actual cross-product navigation by clicking the shared brand and account link.
for(const w of [375,1440]){
 await page.setViewportSize({width:w,height:900});
 await page.goto('http://127.0.0.1:8765/botfolio.html#botfolio');
 await page.evaluate(()=>window.scrollTo(0,0));
 await page.locator('.bf-nav .brand').click();
 try{await page.waitForURL(u=>u.pathname==='/' || u.pathname==='/index.html',{waitUntil:'domcontentloaded',timeout:10000});}catch(err){throw new Error('Brand navigation failed at '+w+'; actual URL: '+page.url(),{cause:err});}
 await page.locator('#sj-landing .sj-land-logo').waitFor({state:'visible'});
 if(new URL(page.url()).hash!=='#home')failures.push({botfolio_navigation:'home',w,url:page.url()});
 await page.goto('http://127.0.0.1:8765/botfolio.html#botfolio');
 await page.locator('#bf-account-link').click();
 await page.waitForURL(u=>u.pathname==='/account.html'&&u.searchParams.get('view')==='overview',{waitUntil:'domcontentloaded'});
 if(!new URL(page.url()).searchParams.get('view') || new URL(page.url()).searchParams.get('view')!=='overview')failures.push({botfolio_navigation:'account',w,url:page.url()});
}
console.log(JSON.stringify(failures,null,2));if(failures.length)process.exitCode=1;await page.setViewportSize({width:375,height:812});await page.goto('http://127.0.0.1:8765/account.html?view=preferences');await page.waitForTimeout(150);await page.screenshot({path:'mobile-account.png',fullPage:true});await browser.close();})();
