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
   const prioritized=['Siemens','Blink22','PwC','talabat'].map(label=>
     sources.find(company=>String(company.name||'').toLowerCase()===label.toLowerCase())).filter(Boolean);
   const companies=prioritized.concat(sources.filter(c=>!prioritized.includes(c))).slice(0,8);
   const companyCard=company=>
     '<article class="sj-land-company" data-home-category="'+category(company.name)+'">'+
     '<div><div class="sj-land-company-name">'+safe(company.name)+'</div>'+
     '<p>Employer monitored by Job Hunter</p></div>'+
     '<button class="sj-land-company-footer" type="button" data-navigate="companies">Explore employer <span aria-hidden="true">↗</span></button></article>';
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
     '<a class="sj-land-profile-link" href="/account.html?view=overview" aria-label="My profile" title="My profile"><span class="sj-land-profile-fallback" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-4 3-6 7-6s7 2 7 6"/></svg></span><img class="sj-land-profile-photo" alt="" hidden></a>':
     '<a class="sj-land-btn soft" href="/account.html?mode=login&after=home">Log in</a>'+
     '<a class="sj-land-btn dark sj-land-signup" href="/account.html?mode=register&after=home">Sign up</a>';
   return `<div class="sj-landing" id="sj-landing">
     <div class="sj-land-topline sj-land-width"><strong>Secret J · Career-focused technology</strong><small>Tools for your next career move</small></div>
     <header class="sj-land-nav sj-land-width">
       <a class="sj-land-logo" href="#home" data-navigate="home" aria-label="Secret J home">
        <img src="/assets/secretj-mark.svg" alt="">Secret J.</a>
       <nav id="sj-land-links" class="sj-land-links" aria-label="Main website navigation">
         <button type="button" data-home-scroll="products">Our Products</button>
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
         <div><button type="button" data-navigate="hunter" class="sj-land-btn dark">Explore Job Hunter ↗</button></div>
        </article>
        <article class="sj-land-product pending">
         <div class="sj-land-product-meta"><span>02 / IN DEVELOPMENT</span><span class="sj-land-product-state">COMING SOON</span></div>
         <div><span class="sj-land-eyebrow">YOUR WORK, PRESENTED</span><h3>Botfolio ✦</h3>
          <p>Our upcoming product will help people present their professional work and portfolio. More details will be shared when it's ready.</p></div>
         <span class="sj-land-muted-action">We're building what's next.</span>
        </article>
       </div>
     </div></section>
     <section class="sj-land-section sj-land-alt" id="companies"><div class="sj-land-width">
       <div class="sj-land-heading"><div><span class="sj-land-eyebrow">DISCOVER THE PEOPLE BEHIND THE ROLES</span><h2>Explore companies</h2>
        <p class="sj-land-intro">Some employers monitored by Job Hunter. Job availability depends on each company's published vacancies.</p></div>
        <button type="button" class="sj-land-section-link" data-navigate="companies">Explore all companies ↗</button>
       </div>
       <div class="sj-land-chips" role="group" aria-label="Filter companies">
        <button type="button" data-home-company-filter="all" aria-selected="true">Highlights</button>
        <button type="button" data-home-company-filter="technology" aria-selected="false">Technology</button>
        <button type="button" data-home-company-filter="business" aria-selected="false">Business &amp; Consulting</button>
        <button type="button" data-home-company-filter="operations" aria-selected="false">Operations</button>
       </div>
       <div class="sj-land-companies">${companies.map(companyCard).join('')}</div>
       <p class="sj-land-empty" data-home-company-empty hidden>No companies in this category. Explore the complete list instead.</p>
       ${companies.length?'':'<p class="sj-land-empty">Company records will appear after the next source update.</p>'}
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
        <p>We're building for people across technical and non-technical careers. Botfolio, our next product, is in development — part of a growing collection of tools for discovering and presenting work.</p>
        <div class="sj-land-about-actions"><button class="sj-land-btn dark" type="button" data-navigate="jobs">Find Jobs ↗</button>
          <a href="${LINKEDIN}" class="sj-land-btn soft" target="_blank" rel="noopener noreferrer">Secret J on LinkedIn ↗</a></div>
       </div>
     </div></section>
     <section class="sj-land-bottom-cta"><div class="sj-land-width sj-land-bottom-inner">
       <div><span class="sj-land-eyebrow">START WITH JOB HUNTER</span><h2>Your next opportunity<br>is worth finding.</h2>
       <p>Explore the first product from Secret J — and stay tuned for what comes next.</p></div>
       <button type="button" class="sj-land-btn dark" data-navigate="jobs">Explore the Job Feed ↗</button>
     </div></section>
     <footer class="sj-land-footer"><div class="sj-land-footer-inner sj-land-width">
       <div><h3>Secret J.</h3><p>Career-focused technology. Thoughtful products for finding opportunities and showcasing your work.</p></div>
       <div class="sj-land-footer-links"><strong>OUR PRODUCTS</strong>
        <button type="button" data-home-scroll="products">All Products</button>
        <button type="button" data-navigate="hunter">Job Hunter · Live</button>
        <button type="button" data-home-scroll="products">Botfolio · Coming Soon</button>
        <button type="button" data-home-scroll="how">How Job Hunter Works</button></div>
       <div class="sj-land-footer-links"><strong>SECRET J</strong>
        <button type="button" data-home-scroll="about">About Us</button>
        <a href="/terms.html">Terms</a><a href="/privacy.html">Privacy</a>
        <a href="${LINKEDIN}" target="_blank" rel="noopener noreferrer">LinkedIn ↗</a></div>
       <div class="sj-land-copy">© ${new Date().getFullYear()} Secret J · Job Hunter available now · Botfolio coming soon.</div>
     </div></footer>
    </div>`;
 }
 function syncAvatar(){
   const link=document.querySelector('#sj-landing .sj-land-profile-link');
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
