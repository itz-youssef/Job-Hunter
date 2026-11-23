'use strict';
/* A Job Hunter product introduction: no gate before the existing public feed. */
(()=>{
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function render(data={}){
  const jobs=Array.isArray(data.jobs)?data.jobs.slice(0,3):[];
  const cards=jobs.map(j=>{
    const title=esc(data.titleOf(j)),company=esc(data.companyOf(j)),location=esc(data.locationOf(j));
    return '<article class="jh-intro-job"><span class="sj-land-eyebrow">RECENTLY DISCOVERED</span><h3>'+title+'</h3><p>'+company+' · '+location+'</p><button type="button" data-navigate="jobs">See jobs ↗</button></article>';
  }).join('');
  const action=data.member?
    '<a class="sj-land-btn soft" href="/account.html?view=preferences">Manage preferences ↗</a>':
    '<a class="sj-land-btn soft" href="/account.html?mode=register&after=home">Create an account ↗</a>';
  return `<div class="sj-landing jh-intro" id="job-hunter-intro">
   <div class="sj-land-topline sj-land-width"><strong>SECRET J / OUR PRODUCTS</strong><small>JOB HUNTER · AVAILABLE NOW</small></div>
   <header class="sj-land-nav sj-land-width">
    <a class="sj-land-logo" href="#home" data-navigate="home" aria-label="Secret J company home"><img src="/assets/secretj-mark.svg" alt="">Secret J.</a>
    <nav class="sj-land-links" id="sj-land-links" aria-label="Job Hunter navigation">
     <button type="button" data-home-scroll="how">How it works</button>
     <button type="button" data-home-scroll="features">Features</button>
     <button type="button" data-home-scroll="sample-jobs">Recent jobs</button>
     <button type="button" data-home-scroll="questions">FAQ</button>
     <button type="button" data-navigate="home">Secret J Home</button>
    </nav>
    <div class="sj-land-account">
     <button type="button" class="sj-land-theme-toggle" data-home-theme-toggle aria-label="Switch to dark mode" aria-pressed="false" title="Switch appearance"><span class="sj-land-theme-icon" aria-hidden="true">◐</span><span class="sj-land-theme-label">Dark</span></button>
     ${data.member?
       '<a class="sj-land-profile-link" href="/account.html?view=overview" aria-label="My profile" title="My profile"><span class="sj-land-profile-fallback" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-4 3-6 7-6s7 2 7 6"/></svg></span><img class="sj-land-profile-photo" alt="" hidden></a>':
       '<a class="sj-land-btn soft" href="/account.html?mode=login&after=home">Log in</a>'}
     <button type="button" class="sj-land-btn dark" data-navigate="jobs">Open Job Feed ↗</button>
     <button type="button" class="sj-land-menu-btn" data-home-menu aria-label="Toggle navigation" aria-controls="sj-land-links" aria-expanded="false">☰</button>
    </div>
   </header>
   <section class="jh-intro-hero"><div class="sj-land-width jh-intro-hero-grid">
    <div><span class="sj-land-eyebrow">JOB HUNTER · A SECRET J PRODUCT</span>
     <h1>LESS SEARCHING.<br>MORE FINDING.</h1>
     <p>Looking for your next job? Job Hunter brings opportunities from monitored company career pages into one place, helping you find roles that fit your goals.</p>
     <div class="jh-intro-actions"><button type="button" class="sj-land-btn dark" data-navigate="jobs">Find jobs now ↗</button>
      <button type="button" class="sj-land-btn soft" data-home-scroll="how">How it works ↓</button></div>
     <small>You can browse jobs without an account.</small>
    </div>
    <div class="jh-intro-preview" aria-label="Illustration of Job Hunter tools">
     <div class="jh-intro-preview-head"><strong>Job Hunter</strong><span>DISCOVER JOBS</span></div>
     <h2>Find what fits you.</h2><div class="jh-intro-preview-search">⌕ &nbsp; Search by role, company or keyword</div>
     <div class="jh-intro-preview-row">Software &amp; Technology <span>↗</span></div>
     <div class="jh-intro-preview-row">Internships &amp; Training <span>↗</span></div>
     <div class="jh-intro-preview-row">Business &amp; Operations <span>↗</span></div>
     <small>Illustrative product preview. Browse the feed for real openings.</small>
    </div>
   </div></section>
   <section class="sj-land-section" id="how"><div class="sj-land-width">
    <span class="sj-land-eyebrow">GET STARTED IN THREE STEPS</span><h2>Job searching, made simpler.</h2>
    <div class="jh-intro-steps">
     <article><span>01</span><h3>Explore opportunities.</h3><p>Find jobs by title, company or keyword. Looking around doesn't require signing in.</p></article>
     <article><span>02</span><h3>Choose what fits.</h3><p>Create an account to select the industries, career levels and roles that interest you.</p></article>
     <article><span>03</span><h3>Stay updated.</h3><p>Save promising roles and choose whether to receive email alerts for new matches.</p></article>
    </div>
   </div></section>
   <section class="sj-land-section sj-land-alt" id="features"><div class="sj-land-width">
    <span class="sj-land-eyebrow">MADE FOR REAL PEOPLE</span><h2>What can Job Hunter do for you?</h2>
    <p class="sj-land-intro">Whether you're a student, a graduate, or an experienced professional, you can start in a few clicks.</p>
    <div class="jh-intro-features">
     <article><span>⌕</span><h3>Discover jobs</h3><p>Explore vacancies collected from monitored company career pages in one place.</p></article>
     <article><span>☷</span><h3>Personalized opportunities</h3><p>Select your preferences and focus on openings that fit your career direction.</p></article>
     <article><span>♡</span><h3>Save for later</h3><p>Keep a shortlist of roles you'd like to revisit when you're ready.</p></article>
     <article><span>✉</span><h3>Optional notifications</h3><p>Receive email alerts when you enable them. You're in control of what you follow.</p></article>
    </div>
   </div></section>
   <section class="sj-land-section" id="sample-jobs"><div class="sj-land-width">
    <div class="sj-land-heading"><div><span class="sj-land-eyebrow">DISCOVER OPPORTUNITIES</span><h2>See the jobs for yourself.</h2><p class="sj-land-intro">A preview from the latest detected job catalog.</p></div>
      <button type="button" class="sj-land-section-link" data-navigate="jobs">See all jobs ↗</button></div>
    <div class="jh-intro-job-grid">${cards||'<p class="sj-land-empty">The latest listings will appear here after the next catalog update.</p>'}</div>
   </div></section>
   <section class="sj-land-section sj-land-dark" id="questions"><div class="sj-land-width jh-intro-faq-grid">
    <div><span class="sj-land-eyebrow">GOOD TO KNOW</span><h2>Quick answers.</h2><p>Everything you need before you start.</p></div>
    <div class="jh-intro-faq">
     <details><summary>Do I need an account to browse?</summary><p>No. You can explore public jobs immediately. An account lets you save preferences and personalize your feed.</p></details>
     <details><summary>Does Job Hunter apply on my behalf?</summary><p>No. Job Hunter helps you discover and organize opportunities. Applications are completed through the employer's official page.</p></details>
     <details><summary>Can I change my preferences?</summary><p>Yes. You can edit your choices from your account at any time.</p></details>
     <details><summary>Will I receive emails automatically?</summary><p>No. Email alerts are optional and can be managed from your account.</p></details>
    </div>
   </div></section>
   <section class="sj-land-bottom-cta"><div class="sj-land-width sj-land-bottom-inner">
    <div><span class="sj-land-eyebrow">READY WHEN YOU ARE</span><h2>Your next opportunity starts here.</h2><p>Browse jobs first. Personalize when you want.</p></div>
    <div class="jh-intro-actions"><button type="button" data-navigate="jobs" class="sj-land-btn dark">Explore Job Feed ↗</button>${action}</div>
   </div></section>
   <footer class="sj-land-footer"><div class="sj-land-footer-inner sj-land-width">
    <div><h3>Job Hunter.</h3><p>A job discovery product by Secret J, built for technical and non-technical careers.</p></div>
    <div class="sj-land-footer-links"><strong>JOB HUNTER</strong><button type="button" data-navigate="jobs">Job Feed</button>
     <button type="button" data-navigate="companies">Companies</button><button type="button" data-home-scroll="how">How It Works</button></div>
    <div class="sj-land-footer-links"><strong>SECRET J</strong><button type="button" data-navigate="home">Company Home</button>
     <a href="/terms.html">Terms</a><a href="/privacy.html">Privacy</a>
     <a href="https://www.linkedin.com/company/secretj/home/" target="_blank" rel="noopener noreferrer">LinkedIn ↗</a></div>
    <div class="sj-land-copy">© ${new Date().getFullYear()} Secret J · Job Hunter is a Secret J product.</div>
   </div></footer>
  </div>`;
 }
 window.SecretJJobHunterIntro=Object.freeze({render});
})();
