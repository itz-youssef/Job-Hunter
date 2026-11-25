'use strict';
/* Editorial landing page for the parent Secret J brand.
   The workspace remains owned by index.html. No demo job records. */
(()=>{
 const LINKEDIN='https://www.linkedin.com/company/secretj/home/';
 const safe=(text)=>String(text??'').replace(/[&<>"']/g,ch=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
 }[ch]));
 const category=name=>{
   const s=String(name||'').toLowerCase();
   if(/siemens|blink22|microsoft|ibm|ericsson|aws|oracle|sap|globant|luxoft|vois|vodafone|linkdev/.test(s))return 'technology';
   if(/pwc|ey|deloitte|bank|hsbc|kpmg|consult|finaria/.test(s))return 'business';
   if(/talabat|uber|henkel|coca|teleperformance|konecta|breadfast/.test(s))return 'operations';
   return 'other';
 };
 function render(data){
   const sources=Array.isArray(data.sources)?data.sources:[];
   const jobs=Array.isArray(data.jobs)?data.jobs:[];
   const preferred=['Siemens','Blink22','ITWorx','Sumerge','Thndr','VOIS','ADCB Egypt','Amazon Egypt'];
   const normalized=name=>String(name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
   const preferredCompanies=preferred.map(label=>
     sources.find(company=>normalized(company.name)===normalized(label))).filter(Boolean);
   const companies=preferredCompanies.concat(sources.filter(c=>!preferredCompanies.includes(c))).slice(0,8);
   // Fixed artwork for known employers only: never interpolate employer data into SVG.
   const logoFor=name=>{
     const key=normalized(name);
     const mark=(brand,symbol,wordmark)=>'<span class="sj-land-company-logo brand-'+brand+'" aria-hidden="true">'+
       '<span class="sj-land-company-logo-mark">'+symbol+'</span>'+
       '<span class="sj-land-company-logo-type">'+wordmark+'</span></span>';
     if(key==='siemens')return mark('siemens','','SIEMENS');
     if(key==='blink22')return mark('blink22','▰▰','Blink22');
     if(key==='itworx')return mark('itworx','▶','ITWorx');
     if(key==='sumerge')return mark('sumerge','S','Sumerge');
     if(key==='thndr')return mark('thndr','ϟ','Thndr');
     if(key==='vois')return mark('vois','','VOIS');
     if(key==='adcb'||key==='adcbegypt')return mark('adcb','◢','ADCB');
     if(key==='amazonegypt'||key==='amazon')return mark('amazon','','amazon<span class="sj-land-amazon-smile">⌣</span>');
     return '';
   };
   const companyCard=company=>{
     const logo=logoFor(company.name);
     return '<article class="sj-land-company" data-home-category="'+category(company.name)+'">'+
     '<div><div class="sj-land-company-heading"><div class="sj-land-company-name">'+safe(company.name)+'</div>'+
     (logo?'<span class="sj-land-company-logo-divider" aria-hidden="true"></span>'+logo:'')+
     '</div><p>Employer monitored by Job Hunter</p></div>'+
     '<button class="sj-land-company-footer" type="button" data-navigate="companies">Explore employer <span aria-hidden="true">↗</span></button></article>';
   };
   const jobCard=job=>{
     const url=data.jobURL(job);
     const action=url==='#'?
       '<button type="button" class="sj-land-job-end" data-navigate="jobs">Explore jobs <span>↗</span></button>':
       '<a class="sj-land-job-end" href="'+safe(url)+'" target="_blank" rel="noopener noreferrer">View employer posting <span aria-hidden="true">↗</span></a>';
     return '<article class="sj-land-job"><span class="sj-land-job-label">JOB HUNTER · RECENTLY DISCOVERED</span>'+
      '<h3>'+safe(data.titleOf(job))+'</h3><p>'+safe(data.companyOf(job))+
      ' · '+safe(data.locationOf(job))+'</p>'+action+'</article>';
   };
   const account=data.member?
     '<details class="sj-land-profile-menu"><summary class="sj-land-profile-link" aria-label="Open profile menu" title="My account"><span class="sj-land-profile-fallback" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-4 3-6 7-6s7 2 7 6"/></svg></span><img class="sj-land-profile-photo" alt="" hidden></summary><div class="sj-land-dropdown sj-land-profile-dropdown"><a href="/account.html?view=overview">Dashboard</a><a href="/account.html?view=profile">My profile</a><a href="/account.html?view=documents">CV &amp; photo</a><a href="/account.html?view=saved">Saved jobs</a><a href="/account.html?view=applications">Applications</a><a href="/account.html?view=preferences">Settings &amp; alerts</a>'+(data.member?.role==='admin'?'<a href="/account.html?view=admin">Admin console</a>':'')+'<div class="sj-land-dropdown-divider"></div><button type="button" data-land-signout>Sign out</button></div></details>':
     '<a class="sj-land-btn soft" href="/account.html?mode=login&after=home">Log in</a>'+
     '<a class="sj-land-btn dark sj-land-signup" href="/account.html?mode=register&after=home">Sign up</a>';
   return `<div class="sj-landing" id="sj-landing">
     <div class="sj-land-topline sj-land-width"><strong>Secret J · Career-focused technology</strong><small>Tools for your next career move</small></div>
     <header class="sj-land-nav sj-land-width">
       <a class="sj-land-logo" href="#home" data-navigate="home" aria-label="Secret J home">
        <img src="/assets/secretj-mark.svg" alt="">Secret J.</a>
       <nav id="sj-land-links" class="sj-land-links" aria-label="Main website navigation">
         <div class="sj-land-products-menu"><button type="button" class="sj-land-products-trigger" aria-haspopup="true" aria-expanded="false">Our Products</button><div class="sj-land-dropdown sj-land-products-dropdown"><button type="button" data-navigate="hunter">Job Hunter <span class="sj-land-dropdown-note">Live ↗</span></button><a href="/botfolio.html">Botfolio <span class="sj-land-dropdown-note">Beta ↗</span></a></div></div>
         <button type="button" data-navigate="jobs">Find Jobs</button>
         <button type="button" data-home-scroll="companies">Explore Companies</button>
         <button type="button" data-home-scroll="how">How It Works</button>
         <button type="button" data-home-scroll="about">About Us</button>
       </nav>
       <div class="sj-land-account"><button type="button" class="sj-land-theme-toggle" data-home-theme-toggle aria-label="Switch to dark mode" aria-pressed="false" title="Switch appearance"><span class="sj-land-theme-icon" aria-hidden="true">◐</span><span class="sj-land-theme-label">Dark</span></button>${account}
         <button type="button" class="sj-land-menu-btn" data-home-menu aria-label="Toggle navigation" aria-controls="sj-land-links" aria-expanded="false">☰</button>
       </div>
     </header>
     <section class="sj-land-hero"><div class="sj-land-hero-inner sj-land-width">
       <div><span class="sj-land-eyebrow">SECRET J · CAREER TECHNOLOGY</span>
        <h1>YOUR CAREER.<br>MORE POSSIBILITIES.</h1>
        <p>Tools that help people discover opportunities, take their next step, and show what they can do. Built for every career journey.</p>
       </div>
       <div class="sj-land-hero-ctas">
         <button type="button" data-navigate="jobs">Explore job opportunities <span aria-hidden="true">↗</span></button>
         <button type="button" data-home-scroll="products">Discover our products <span aria-hidden="true">↗</span></button>
         <button type="button" data-home-scroll="about">Get to know Secret J <span aria-hidden="true">↗</span></button>
       </div>
     </div></section>
     <section class="sj-land-section" id="products"><div class="sj-land-width">
       <div class="sj-land-heading"><div><span class="sj-land-eyebrow">WHAT WE BUILD</span><h2>Meet our products.</h2>
        <p class="sj-land-intro">Different tools. One goal: make career growth easier to navigate, from finding opportunities to presenting your work.</p></div></div>
       <div class="sj-land-product-grid">
        <article class="sj-land-product">
         <div class="sj-land-product-meta"><span>01 / AVAILABLE NOW</span><span class="sj-land-product-state">LIVE</span></div>
         <div><span class="sj-land-eyebrow">JOB DISCOVERY</span><h3>Job Hunter ↗</h3>
          <p>Discover roles from monitored company career pages, choose your preferences, save opportunities, and get optional email alerts for matches.</p></div>
         <div class="sj-land-product-actions"><button type="button" data-navigate="hunter" class="sj-land-btn dark">Explore Job Hunter ↗</button><button type="button" data-navigate="jobs" class="sj-land-btn sj-land-product-open">Open Job Hunter ↗</button></div>
        </article>
        <article class="sj-land-product pending">
         <div class="sj-land-product-meta"><span>02 / AI PORTFOLIO</span><span class="sj-land-product-state">BETA</span></div>
         <div><span class="sj-land-eyebrow">YOUR WORK, PRESENTED</span><h3>Botfolio ✦</h3>
          <p>Turn your CV into a conversational AI portfolio. Create a shareable chatbot and embed it in your professional website.</p></div>
         <div class="sj-land-product-actions"><span class="sj-land-muted-action">Your experience, in conversation.</span><a href="/botfolio.html" class="sj-land-btn sj-land-product-open">Open Botfolio ↗</a></div>
        </article>
       </div>
     </div></section>
     <section class="sj-land-section sj-land-alt" id="companies"><div class="sj-land-width">
       <div class="sj-land-heading"><div><span class="sj-land-eyebrow">DISCOVER THE PEOPLE BEHIND THE ROLES</span><h2>Explore companies</h2>
        <p class="sj-land-intro">Some employers monitored by Job Hunter. Job availability depends on each company's published vacancies.</p></div>
        <button type="button" class="sj-land-section-link" data-navigate="companies">Explore all companies ↗</button>
       </div>
       <div class="sj-land-mobile-company-wall sj-land-mobile-company-wall-top" aria-hidden="true"><span class="sj-land-wall-brand sj-land-wall-brand-0">Microsoft</span><span class="sj-land-wall-brand sj-land-wall-brand-1">IBM</span><span class="sj-land-wall-brand sj-land-wall-brand-2">aws</span><span class="sj-land-wall-brand sj-land-wall-brand-3">EY</span><span class="sj-land-wall-brand sj-land-wall-brand-4">Nestlé</span></div>
       <div class="sj-land-chips" role="group" aria-label="Filter companies">
        <button type="button" data-home-company-filter="all" aria-selected="true">Highlights</button>
        <button type="button" data-home-company-filter="technology" aria-selected="false">Technology</button>
        <button type="button" data-home-company-filter="business" aria-selected="false">Business &amp; Consulting</button>
        <button type="button" data-home-company-filter="operations" aria-selected="false">Operations</button>
       </div>
       <div class="sj-land-companies" aria-busy="${Boolean(data.catalogLoading && !companies.length)}" aria-label="Monitored companies">
        ${companies.length?companies.map(companyCard).join(''):data.catalogLoading
          ?Array.from({length:8},()=>'<div class="sj-land-company sj-land-company-skeleton" aria-hidden="true"><div><span class="sj-land-skeleton-title"></span><span class="sj-land-skeleton-description"></span></div><span class="sj-land-skeleton-action"></span></div>').join('')
          :''}
       </div>
       <div class="sj-land-mobile-company-wall sj-land-mobile-company-wall-bottom" aria-hidden="true"><span class="sj-land-wall-brand sj-land-wall-brand-0">Deloitte.</span><span class="sj-land-wall-brand sj-land-wall-brand-1">pwc</span><span class="sj-land-wall-brand sj-land-wall-brand-2">Schneider Electric</span><span class="sj-land-wall-brand sj-land-wall-brand-3">Uber</span><span class="sj-land-wall-brand sj-land-wall-brand-4">Coca-Cola</span></div>
       <p class="sj-land-empty" data-home-company-empty hidden>No companies in this category. Explore the complete list instead.</p>
       ${companies.length||data.catalogLoading?'':'<p class="sj-land-empty">Company records could not be loaded. Please try refreshing.</p>'}
     </div></section>
     <section class="sj-land-section" id="opportunities"><div class="sj-land-width">
       <div class="sj-land-heading"><div><span class="sj-land-eyebrow">JOB HUNTER · AVAILABLE NOW</span><h2>Discover opportunities</h2>
        <p class="sj-land-intro">Real jobs recently discovered by Job Hunter. Browse the full feed to filter by role, level or company.</p></div>
        <button type="button" class="sj-land-section-link" data-navigate="jobs">View all jobs ↗</button>
       </div>
       <form class="sj-land-search" id="sj-home-search"><input name="q" type="search" maxlength="160" aria-label="Search the job feed" placeholder="Try: software engineer, intern, HR…"><button type="submit">Search ↗</button></form>
       <div class="sj-land-jobs">${jobs.length?jobs.slice(0,6).map(jobCard).join(''):'<p class="sj-land-empty">Recently discovered opportunities will appear here after the next source update.</p>'}</div>
     </div></section>
     <section class="sj-land-section sj-land-dark" id="how"><div class="sj-land-width">
       <span class="sj-land-eyebrow">HOW JOB HUNTER WORKS</span><h2>From searching to finding.</h2>
       <p class="sj-land-intro">One Secret J product designed to make job discovery and tracking feel straightforward.</p>
       <div class="sj-land-steps">
        <div class="sj-land-step"><small>01 / EXPLORE</small><h3>Browse opportunities.</h3><p>Start by exploring jobs and companies. You don't need an account to look around.</p></div>
        <div class="sj-land-step"><small>02 / PERSONALIZE</small><h3>Choose what fits.</h3><p>Create a profile and select your experience level, interests and career preferences.</p></div>
        <div class="sj-land-step"><small>03 / STAY AHEAD</small><h3>Never lose track.</h3><p>Find relevant jobs in your feed, save opportunities, and opt in to email alerts.</p></div>
       </div>
     </div></section>
     <section class="sj-land-section" id="about"><div class="sj-land-width sj-land-about">
       <div class="sj-land-about-art" aria-label="Illustration of Job Hunter features">
         <div class="sj-land-art-preview"><h4>Job Hunter · My matches</h4>
          <div class="sj-land-preview-row"><span>Find opportunities</span><strong>↗</strong></div>
          <div class="sj-land-preview-row"><span>Set career preferences</span><strong>✓</strong></div>
          <div class="sj-land-preview-row"><span>Track your next move</span><strong>↗</strong></div></div>
       </div>
       <div><span class="sj-land-eyebrow">WHO WE ARE · SECRET J</span><h2>Building tools for every career journey.</h2>
        <p>Secret J is an independent career-focused technology company building tools that help people navigate their professional journeys. Our first product, Job Hunter, helps people discover and organize opportunities from monitored company career pages.</p>
        <p>We're building for people across technical and non-technical careers. Botfolio lets you present your professional experience through an AI portfolio — part of our growing collection of career tools.</p>
        <div class="sj-land-about-actions"><button class="sj-land-btn dark" type="button" data-navigate="jobs">Find Jobs ↗</button>
          <a href="${LINKEDIN}" class="sj-land-btn sj-land-linkedin-cta" target="_blank" rel="noopener noreferrer">Secret J on LinkedIn ↗</a></div>
       </div>
     </div></section>
     <section class="sj-land-bottom-cta"><div class="sj-land-width sj-land-bottom-inner">
       <div><span class="sj-land-eyebrow">START WITH JOB HUNTER</span><h2>Your next opportunity<br>is worth finding.</h2>
       <p>Explore the first product from Secret J — and stay tuned for what comes next.</p></div>
       <button type="button" class="sj-land-btn dark" data-navigate="jobs">Explore the Job Feed ↗</button>
     </div></section>
     <footer class="sj-land-footer" aria-label="Secret J footer">
       <div class="sj-land-footer-inner sj-land-width">
         <div class="sj-land-footer-brand">
           <h3>Secret J.</h3>
           <p>Career-focused technology. Thoughtful products for finding opportunities and showcasing your work.</p>
           <span class="sj-land-footer-tagline">YOUR CAREER. MORE POSSIBILITIES.</span>
         </div>
         <div class="sj-land-footer-links"><strong>OUR PRODUCTS</strong>
           <button type="button" data-home-scroll="products">All Products</button>
           <button type="button" data-navigate="hunter">Job Hunter · Live</button>
           <a href="/botfolio.html">Botfolio · Beta</a>
           <button type="button" data-home-scroll="how">How Job Hunter Works</button>
         </div>
         <div class="sj-land-footer-links"><strong>EXPLORE SECRET J</strong>
           <button type="button" data-home-scroll="about">About Us</button>
           <button type="button" data-navigate="companies">Explore Companies</button>
           <button type="button" data-navigate="jobs">Find Jobs</button>
         </div>
         <div class="sj-land-footer-social">
           <strong>CONNECT WITH US</strong>
           <a class="sj-land-linkedin-icon" href="${LINKEDIN}" target="_blank" rel="noopener noreferrer" aria-label="Secret J on LinkedIn (opens in new tab)" title="Secret J on LinkedIn">
             <svg aria-hidden="true" viewBox="0 0 24 24" width="23" height="23" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.327-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.35V9h3.414v1.561h.049c.476-.9 1.637-1.85 3.37-1.85 3.601 0 4.264 2.37 4.264 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 .001-4.124 2.062 2.062 0 0 1-.001 4.124zM7.119 20.452H3.555V9H7.12v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451c.978 0 1.778-.773 1.778-1.729V1.729C24 .774 23.2 0 22.222 0z"/></svg>
           </a>
         </div>
       </div>
       <div class="sj-land-footer-bottom sj-land-width">
         <span>© ${new Date().getFullYear()} Secret J. All rights reserved.</span>
         <nav class="sj-land-footer-legal" aria-label="Legal information">
           <a href="/terms.html">Terms &amp; Conditions</a>
           <a href="/privacy.html">Privacy Policy</a>
         </nav>
       </div>
     </footer>
    </div>`;
 }
 function syncAvatar(){
   const link=document.querySelector('.sj-landing .sj-land-profile-link');
   if(!link)return;
   const source=document.getElementById('sj-profile-photo');
   const target=link.querySelector('.sj-land-profile-photo');
   const fallback=link.querySelector('.sj-land-profile-fallback');
   const valid=source&&!source.hidden&&source.getAttribute('src')?.startsWith('data:image/');
   if(valid){target.src=source.src;target.hidden=false;fallback.hidden=true;}
   else{target.hidden=true;target.removeAttribute('src');fallback.hidden=false;}
 }
 window.SecretJLanding=Object.freeze({render,syncAvatar});
})();
