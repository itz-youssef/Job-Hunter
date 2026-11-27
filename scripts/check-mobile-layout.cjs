const {chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true}); const page=await browser.newPage();
await page.route('**/api/**',async route=>{let u=new URL(route.request().url()),scope=u.searchParams.get('scope'),data={ok:true};
if(u.pathname.includes('auth'))data.user={id:'test',email:'long.email.address.for.mobile.testing@example.com',role:'admin'};
else if(u.pathname.includes('secretj-botfolio'))Object.assign(data,{ai_ready:true,bots:[{id:'123',name:'A long professional portfolio name for a software engineering candidate',headline:'AI and Software Engineer — computer vision and machine learning applications',published:true},{id:'456',name:'Private portfolio draft',headline:'Software engineer',published:false}]});
else if(u.pathname.includes('email'))Object.assign(data,{configured:true,verified:false});
else if(u.pathname.includes('linkedin'))Object.assign(data,{configured:false});
else if(u.pathname.includes('admin'))Object.assign(data,{users:[],summary:{users:1,active_users:1,applications:0},activity:[]});
else if(scope==='preferences')data.preferences={egypt_only:true,internships:true,role_families:['software'],max_experience_years:2};
else if(scope==='avatar')Object.assign(data,{found:true,file:{mime_type:'image/png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII='}});
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
// Job Hunter visual-only refinement: compare the same rendered DOM with the
// stylesheet enabled and disabled. No layout movement, extra controls or routes.
for(const width of [375,1440]){
 for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:900});
  for(const path of ['/#hunter','/#jobs','/#saved','/#companies','/#alerts','/#home','/#profile']){
   await page.goto('http://127.0.0.1:8765'+path);
   await page.evaluate(t=>localStorage.setItem('jh-theme',t),theme);
   await page.reload();
   await page.waitForFunction(t=>document.documentElement.dataset.theme===t,theme);
   const data=await page.evaluate(async()=>{
    await document.fonts.ready;
    const sheet=[...document.styleSheets].find(s=>s.href?.includes('/secretj-jobhunter-refinement.css'));
    if(!sheet)return {missingStylesheet:true};
    const snapshot=()=>[...document.querySelectorAll('#main-content :is(h1,h2,h3,button,a,input,select,article,.panel,.job-card,.company-card,.section-top,.job-filter-panel,.jh-intro-preview,.jh-intro-steps,.jh-intro-features,.jh-intro-job-grid),.sidebar #navigation button')].map(el=>{
     const r=el.getBoundingClientRect(),s=getComputedStyle(el);
     return {x:r.x,y:r.y,w:r.width,h:r.height,color:s.color,background:s.backgroundColor,shadow:s.boxShadow};
    });
    const enabled=snapshot();sheet.disabled=true;
    const disabled=snapshot();sheet.disabled=false;
    const geometry=enabled.length===disabled.length&&enabled.every((r,i)=>['x','y','w','h'].every(k=>Math.abs(r[k]-disabled[i][k])<.5));
    const visual=enabled.some((r,i)=>['color','background','shadow'].some(k=>r[k]!==disabled[i]?.[k]));
    const primary=document.querySelector('.jh-intro .jh-intro-actions .sj-land-btn.dark[data-navigate="jobs"],body.jh-workspace #main-content .btn.primary:not(:disabled)');
    const shell=getComputedStyle(document.querySelector('.workspace-shell')),main=getComputedStyle(document.getElementById('main-content'));
    const active=document.querySelector('.sidebar #navigation button.active');
    return {geometry,visual,workspace:document.body.classList.contains('jh-workspace'),intro:!!document.querySelector('.jh-intro'),accent:primary?getComputedStyle(primary).backgroundColor:null,active:active?getComputedStyle(active).backgroundColor:null,shellArt:shell.backgroundImage,mainArt:main.backgroundImage,mainBg:main.backgroundColor};
   });
   const scoped=['/#jobs','/#saved','/#companies','/#alerts'].includes(path),intro=path==='/#hunter';
   if(data.missingStylesheet||!data.geometry||data.workspace!==scoped||data.intro!==intro||data.visual!==(scoped||intro))failures.push({jobhunter_refinement:path,width,theme,...data});
   const expectedAccent=scoped?(theme==='dark'?'rgb(237, 237, 237)':'rgb(32, 32, 32)'):(theme==='dark'?'rgb(211, 166, 68)':'rgb(89, 64, 71)');
   if(scoped&&(data.active!==expectedAccent||data.mainBg!=='rgba(0, 0, 0, 0)'||data.mainArt!=='none'||!data.shellArt.includes('radial-gradient')))failures.push({jobhunter_continuous_workspace:path,width,theme,...data});
   if(data.accent&&data.accent!==expectedAccent)failures.push({jobhunter_refinement_accent:path,width,theme,...data});
   if(path==='/#hunter'||path==='/#jobs')await page.screenshot({path:'jobhunter-'+path.slice(2)+'-'+theme+'-'+width+'.png',animations:'disabled'});
  }
 }
}

// Botfolio-specific checks: authenticated workspace, all internal views, both themes,
// small phones through 4K, and a sidebar anchored to the viewport on desktop.
for(const w of [320,375,390,430,600,768,900,1024,1280,1440,1920,2560,3840]){
 await page.setViewportSize({width:w,height:900});
 for(const theme of ['light','dark']){
  await page.goto('http://127.0.0.1:8765/botfolio.html#home');
  await page.evaluate(t=>localStorage.setItem('jh-theme',t),theme);
  await page.reload();
  await page.waitForFunction(()=>!document.getElementById('workspace').hidden && document.getElementById('stat-total').textContent==='2');
  const heroArtwork=await page.locator('.bf-intro-hero').evaluate(el=>getComputedStyle(el,'::before').backgroundImage);
  const expectedArtwork=theme==='dark'?'jobhunter-abstract-dark.svg':'botfolio-hero-burgundy.svg';
  if(!heroArtwork.includes(expectedArtwork))failures.push({botfolio_hero:w,theme,heroArtwork,expectedArtwork});
  const asset=await page.request.get('http://127.0.0.1:8765/assets/'+expectedArtwork);
  if(!asset.ok())failures.push({botfolio_hero_asset:w,theme,status:asset.status()});
  if(theme==='light'){
   const colors=await page.locator('.bf-intro-hero').evaluate(el=>({resume:getComputedStyle(el.querySelector('h1 em')).color,send:getComputedStyle(el.querySelector('.bf-preview-prompt span')).backgroundColor}));
   if(colors.resume!=='rgb(89, 64, 71)'||colors.send!==colors.resume)failures.push({botfolio_accent:w,...colors});
   const geometry=await page.locator('.bf-intro-hero').evaluate(el=>{
    const box=e=>{const r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
    const hero=box(el),main=box(document.querySelector('.bf-workspace')),copy=box(el.querySelector('.bf-intro-copy')),preview=box(el.querySelector('.bf-intro-preview'));
    const art=getComputedStyle(el,'::before'),extra=getComputedStyle(el,'::after');
    const overlap=(a,b)=>a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1;
    const contained=b=>b.left>=hero.left-1&&b.right<=hero.right+1&&b.top>=hero.top-1&&b.bottom<=hero.bottom+1;
    return {hero,main,copy,preview,artSize:art.backgroundSize,artImage:art.backgroundImage,artBounds:[art.top,art.right,art.bottom,art.left],extra:extra.content,overlap:overlap(copy,preview),contained:contained(copy)&&contained(preview),stacked:preview.top>=copy.bottom-1,title:getComputedStyle(el.querySelector('h1')).textTransform,button:getComputedStyle(el.querySelector('.primary')).backgroundImage,buttonColor:getComputedStyle(el.querySelector('.primary')).backgroundColor};
   });
   if(Math.abs(geometry.hero.left-geometry.main.left)>1||Math.abs(geometry.hero.right-geometry.main.right)>1||!geometry.artSize.includes('100% 100%')||geometry.artBounds.some(x=>x!=='0px')||geometry.extra!=='none'||geometry.overlap||!geometry.contained||geometry.stacked!==(geometry.hero.width<960)||geometry.artImage.includes('robot')||geometry.artImage.includes('botfolio-hero-icons.svg')!==(geometry.hero.width>=960)||geometry.title==='uppercase'||geometry.button!=='none'||geometry.buttonColor!=='rgb(21, 21, 21)')failures.push({botfolio_hero_geometry:w,...geometry});
   if(!(await page.request.get('http://127.0.0.1:8765/assets/botfolio-hero-icons.svg')).ok())failures.push({botfolio_art_asset:w});
  }else if(await page.locator('.bf-intro-hero h1').evaluate(el=>getComputedStyle(el).textTransform)!=='uppercase')failures.push({botfolio_dark_title:w});
  if([375,1440,2560].includes(w)){await page.locator('.bf-intro-hero').screenshot({path:'botfolio-hero-'+theme+'-'+w+'.png',animations:'disabled'});}
  for(const [selector,assetName] of [['.bf-intro-alt','botfolio-features-grey.svg'],['.bf-intro-close','botfolio-closing-grey.svg']]){
   const section=page.locator(selector);
   const g=await section.evaluate(el=>{
    const r=el.getBoundingClientRect(),main=document.querySelector('.bf-workspace').getBoundingClientRect(),art=getComputedStyle(el,'::before');
    const children=[...el.querySelectorAll('article,h2,.actions')].map(x=>x.getBoundingClientRect());
    const grid=el.querySelector('.bf-intro-features'),icon=grid?.querySelector('article>span');
    return {width:r.width,left:r.left,right:r.right,mainLeft:main.left,mainRight:main.right,art:art.backgroundImage,size:art.backgroundSize,extra:getComputedStyle(el,'::after').backgroundImage,contained:children.every(x=>x.left>=r.left-1&&x.right<=r.right+1),columns:grid?getComputedStyle(grid).gridTemplateColumns.split(' ').length:0,icon:icon?getComputedStyle(icon,'::before').backgroundImage:null,eyebrow:getComputedStyle(el.querySelector('.eyebrow')).color};
   });
   if(!g.contained||Math.abs(g.left-g.mainLeft)>1||Math.abs(g.right-g.mainRight)>1)failures.push({botfolio_section:selector,w,theme,...g});
   if(theme==='light'){
    if(!g.art.includes(assetName)||g.size!=='100% 100%'||g.eyebrow!=='rgb(65, 65, 65)')failures.push({botfolio_section_art:selector,w,...g});
    if(selector==='.bf-intro-alt'&&(g.columns!==(g.width>=1120?4:g.width>=600?2:1)||!g.icon.includes('data:image/svg+xml')||g.extra.includes('botfolio-features-wireframe.svg')!==(g.width>=1120)))failures.push({botfolio_feature_grid:w,...g});
    if(!(await page.request.get('http://127.0.0.1:8765/assets/'+assetName)).ok())failures.push({botfolio_section_asset:assetName,w});
   }else if(g.art.includes('-grey.svg')||g.extra.includes('botfolio-features-wireframe.svg')||(selector==='.bf-intro-close'&&!g.art.includes('jobhunter-abstract-dark.svg')))failures.push({botfolio_dark_section:selector,w,...g});
   if([375,1440,2560].includes(w))await section.screenshot({path:'botfolio-section-'+(selector.endsWith('alt')?'features':'closing')+'-'+theme+'-'+w+'.png',animations:'disabled'});
  }
  const foot=await page.locator('.bf-intro-footer').evaluate(el=>{
   const r=el.getBoundingClientRect(),main=document.querySelector('.bf-workspace').getBoundingClientRect(),grid=el.querySelector('.bf-intro-footer-inner');
   const blocks=[...grid.children].map(n=>n.getBoundingClientRect()),links=[...el.querySelectorAll('a')].map(a=>({label:a.textContent.trim(),href:a.getAttribute('href')}));
   return {width:r.width,left:r.left,right:r.right,mainLeft:main.left,mainRight:main.right,columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,background:getComputedStyle(el).backgroundColor,contained:blocks.every(b=>b.left>=r.left-1&&b.right<=r.right+1),links,legacyHidden:getComputedStyle(document.querySelector('.bf-footer')).display==='none',social:el.querySelector('.bf-footer-linkedin')?.getAttribute('aria-label')};
  });
  if(!foot.contained||Math.abs(foot.left-foot.mainLeft)>1||Math.abs(foot.right-foot.mainRight)>1||foot.columns!==(foot.width>=1040?4:foot.width>=380?2:1)||foot.background!==(theme==='dark'?'rgb(11, 11, 11)':'rgb(255, 255, 255)')||!foot.legacyHidden||foot.links.length!==10||!foot.social||!foot.links.some(x=>x.href==='/terms.html')||!foot.links.some(x=>x.href==='/privacy.html'))failures.push({botfolio_footer:w,theme,...foot});
  if([375,1440].includes(w))await page.locator('.bf-intro-footer').screenshot({path:'botfolio-footer-'+theme+'-'+w+'.png',animations:'disabled'});
  for(const view of ['home','botfolio','create','guides']){
   await page.locator('.bf-sidebar nav [data-bf-view="'+view+'"]').click();
   await page.waitForFunction(v=>document.querySelector('.bf-sidebar nav [aria-current="page"]')?.dataset.bfView===v,view);
   const layout=await page.evaluate(v=>{const rect=s=>document.querySelector(s).getBoundingClientRect();const side=rect('.bf-sidebar'),main=rect('.bf-workspace');return {scroll:document.documentElement.scrollWidth,width:innerWidth,sideLeft:side.left,mainRight:main.right,visible:!document.getElementById(({home:'product-home',botfolio:'portfolio-view',create:'create',guides:'guides'})[v]).hidden,theme:document.documentElement.dataset.theme,homeVisible:!document.getElementById('product-home').hidden,toolVisible:!document.getElementById('portfolio-view').hidden,favicon:document.querySelector('link[rel=icon]')?.getAttribute('href'),title:document.title}},view);
   if(layout.scroll>w+1||!layout.visible||layout.homeVisible!==(view==='home')||layout.toolVisible!==(view==='botfolio')||layout.favicon!=='/favicon.svg'||!layout.title.startsWith('Secret J')||layout.theme!==theme||(w>900&&(Math.abs(layout.sideLeft)>1||Math.abs(layout.mainRight-w)>20)))failures.push({botfolio:view,w,theme,...layout});
  }
 }
}

// Public chat: real browser interaction, long messages, theme switching, mobile and short embed.
let chatCalls=0,failChat=false;
await page.route('**/api/secretj-botfolio?action=public*',route=>route.fulfill({json:{ok:true,bot:{name:'A long professional portfolio name',headline:'AI and Software Engineer — computer vision and machine learning'}}}));
await page.route('**/api/secretj-botfolio?action=chat',async route=>{
 chatCalls++;
 const body=route.request().postDataJSON();
 if(!body.id||!body.message||!Array.isArray(body.history))throw Error('Invalid chat contract');
 return route.fulfill({status:failChat?429:200,json:failChat?{ok:false,error:'Daily limit reached'}:{ok:true,answer:'A professional answer. '.repeat(90)+'<script>not markup</script>'}});
});
for(const [w,h] of [[320,600],[375,812],[768,600],[1440,900],[1920,1080],[800,360]]){
 for(const theme of ['light','dark']){
  await page.setViewportSize({width:w,height:h});
  await page.goto('http://127.0.0.1:8765/botfolio-chat.html?id=123');
  await page.evaluate(t=>localStorage.setItem('bf-chat-theme',t),theme);await page.reload();
  await page.locator('#chat-form').waitFor({state:'visible'});
  await page.locator('#suggestions button').first().click();
  await page.waitForFunction(()=>!document.querySelector('#messages .bf-typing')&&document.querySelectorAll('#messages .bubble.assistant').length===2);
  const geometry=await page.evaluate(()=>{const b=s=>document.querySelector(s).getBoundingClientRect();return {scroll:document.documentElement.scrollWidth,theme:document.documentElement.dataset.theme,formBottom:b('#chat-form').bottom,formTop:b('#chat-form').top,messagesBottom:b('#messages').bottom,scrollable:document.querySelector('#messages').scrollHeight>document.querySelector('#messages').clientHeight,safe:!document.querySelector('#messages script'),text:document.querySelector('#messages .bubble.assistant:last-of-type')?.textContent}});
  if(geometry.scroll>w+1||geometry.theme!==theme||geometry.formBottom>h+1||geometry.formTop<0||geometry.messagesBottom>geometry.formTop||!geometry.scrollable||!geometry.safe)failures.push({public_chat:w,h,theme,...geometry});
  if([375,1440].includes(w))await page.screenshot({path:'botfolio-public-chat-'+theme+'-'+w+'.png',animations:'disabled'});
  await page.locator('#theme').click();
  if(await page.evaluate(()=>document.documentElement.dataset.theme)===theme)failures.push({public_chat_theme:w,h,theme});
 }
}
failChat=true;await page.locator('#message').fill('Retry question');await page.locator('#chat-form button').click();await page.waitForFunction(()=>document.getElementById('chat-status').textContent==='Daily limit reached');
if(await page.locator('#message').inputValue()!=='Retry question')failures.push({public_chat_retry:'message lost'});
if(chatCalls!==13)failures.push({public_chat_calls:chatCalls});
await page.unroute('**/api/secretj-botfolio?action=public*');await page.unroute('**/api/secretj-botfolio?action=chat');

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
 await page.locator('#bf-profile-photo').waitFor({state:'visible'});
 await page.locator('#bf-profile-menu summary').click();
 await page.locator('.bf-account-dropdown').waitFor({state:'visible'});
 const links=await page.locator('#bf-profile-menu .bf-account-dropdown a:visible').allTextContents();
 if(links.join('|')!=='Dashboard|My profile|CV & photo|Saved jobs|Applications|Settings & alerts|Admin console')failures.push({botfolio_account_links:w,links});
 const menuRect=await page.locator('.bf-account-dropdown').boundingBox();
 if(!menuRect||menuRect.x<0||menuRect.x+menuRect.width>w+1)failures.push({botfolio_account_overflow:w,menuRect});
 await page.locator('#bf-account-link').click();
 await page.waitForURL(u=>u.pathname==='/account.html'&&u.searchParams.get('view')==='overview',{waitUntil:'domcontentloaded'});
 if(!new URL(page.url()).searchParams.get('view') || new URL(page.url()).searchParams.get('view')!=='overview')failures.push({botfolio_navigation:'account',w,url:page.url()});
}
// Real footer deep links: verify the destination page and rendered target section.
for(const [label,section,hash] of [['All Products','products','#home'],['About Us','about','#home'],['How Job Hunter Works','how','#hunter']]){
 await page.goto('http://127.0.0.1:8765/botfolio.html#home');
 await page.locator('.bf-intro-footer').getByRole('link',{name:label,exact:true}).click();
 await page.waitForURL(u=>u.searchParams.get('section')===section&&u.hash===hash);
 await page.locator('#'+section).waitFor({state:'visible'});
 await page.waitForFunction(id=>{const r=document.getElementById(id)?.getBoundingClientRect();return r&&r.top<innerHeight&&r.bottom>0;},section,{timeout:15000});
}
// Member-only admin link, photo fallback, guest controls, safe signout.
await page.setViewportSize({width:375,height:812});
let mockUser={id:'member',role:'member'},logoutCalls=0;
await page.route('**/api/secretj-auth?*',async route=>{
 const action=new URL(route.request().url()).searchParams.get('action');
 if(action==='logout'){if(route.request().method()!=='POST')throw Error('Logout must POST');logoutCalls++;mockUser=null;return route.fulfill({json:{ok:true}});}
 return route.fulfill({json:{ok:true,user:mockUser}});
});
await page.route('**/api/secretj-data?scope=avatar',route=>route.fulfill({json:{ok:true,found:false}}));
await page.goto('http://127.0.0.1:8765/botfolio.html#botfolio');
await page.locator('#bf-profile-fallback').waitFor({state:'visible'});
await page.locator('#bf-profile-menu summary').click();
await page.locator('.bf-account-dropdown').waitFor({state:'visible'});
if(await page.locator('#bf-admin-link').isVisible()||!await page.locator('#bf-profile-fallback').isVisible())failures.push({botfolio_member_menu:'role or fallback'});
await page.keyboard.press('Escape');
if(await page.locator('#bf-profile-menu').evaluate(el=>el.open))failures.push({botfolio_menu:'escape'});
await page.locator('#bf-profile-menu summary').click();
await page.locator('#bf-signout').click();
await page.locator('#bf-guest-nav').waitFor({state:'visible'});
if(logoutCalls!==1||await page.locator('#bf-profile-menu').isVisible()||await page.locator('#workspace').isVisible())failures.push({botfolio_signout:logoutCalls});
await page.goto('http://127.0.0.1:8765/#home');
const explore=page.locator('#products a:has-text("Explore Botfolio")'),open=page.locator('#products a:has-text("Open Botfolio")');
if(await explore.getAttribute('href')!=='/botfolio.html#home'||await open.getAttribute('href')!=='/botfolio.html#botfolio')failures.push({botfolio_products:'incorrect routes'});
console.log(JSON.stringify(failures,null,2));if(failures.length)process.exitCode=1;await page.setViewportSize({width:375,height:812});await page.goto('http://127.0.0.1:8765/account.html?view=preferences');await page.waitForTimeout(150);await page.screenshot({path:'mobile-account.png',fullPage:true});await browser.close();})();
