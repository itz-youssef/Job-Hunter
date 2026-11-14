const {chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true}); const page=await browser.newPage();
await page.route('**/api/**',async route=>{let u=new URL(route.request().url()),scope=u.searchParams.get('scope'),data={ok:true};
if(u.pathname.includes('auth'))data.user={id:'test',email:'long.email.address.for.mobile.testing@example.com',role:'admin'};
else if(u.pathname.includes('email'))Object.assign(data,{configured:true,verified:false});
else if(u.pathname.includes('linkedin'))Object.assign(data,{configured:false});
else if(u.pathname.includes('admin'))Object.assign(data,{users:[],summary:{users:1,active_users:1,applications:0},activity:[]});
else if(scope==='preferences')data.preferences={egypt_only:true,internships:true,role_families:['software'],max_experience_years:2};
else if(scope==='profile')data.profile={display_name:'Mobile Test',headline:'Software engineer'};
else if(scope==='saved')data.jobs=[{job_key:'x'.repeat(100),job_snapshot:{title:'A long software engineering opportunity for mobile layouts',company:'Example',url:'https://example.com'},saved_at:new Date().toISOString()}];
else if(scope==='applications')data.applications=[{job_key:'https://example.com/'+ 'x'.repeat(100),title:'A long software engineering opportunity for mobile layouts',company:'Example',stage:'applied'}];
else data.found=false;
await route.fulfill({json:data});});
let failures=[];for(const w of [320,375,390,430,768,1024,1440]){await page.setViewportSize({width:w,height:812});for(const path of ['/#home','/#jobs','/#companies','/#alerts','/#radar','/#resume','/#cv','/#profile','/#saved','/account.html?view=overview','/account.html?view=saved','/account.html?view=admin','/account.html?view=preferences','/account.html?view=documents','/account.html?view=applications','/account.html?view=profile','/manage-companies.html']){await page.goto('http://127.0.0.1:8765'+path);await page.waitForTimeout(250);let result=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,bad:[...document.querySelectorAll('body *')].filter(e=>{let r=e.getBoundingClientRect();return r.width&&r.right>innerWidth+1&&getComputedStyle(e).position!=='absolute'&&!e.closest('nav')}).slice(0,5).map(e=>e.tagName+'.'+e.className)}));if(result.scroll>w+1)failures.push({w,path,...result});} }
// Verify the brand never turns into an inverse-color tile on real browsers.
// Include both page headers, both themes, and narrow/wide pointer viewports.
const hoverFailures=[];
for(const width of [375,1024]){
 for(const theme of ['light','dark']){
  for(const path of ['/#home','/account.html?view=overview']){
   await page.setViewportSize({width,height:812});
   await page.goto('http://127.0.0.1:8765'+path);
   await page.evaluate(t=>localStorage.setItem('jh-theme',t),theme);
   await page.reload();
   await page.waitForTimeout(180);
   const brand=page.locator('a.brand').first();
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
console.log(JSON.stringify(failures,null,2));if(failures.length)process.exitCode=1;await page.setViewportSize({width:375,height:812});await page.goto('http://127.0.0.1:8765/account.html?view=preferences');await page.waitForTimeout(150);await page.screenshot({path:'mobile-account.png',fullPage:true});await browser.close();})();
