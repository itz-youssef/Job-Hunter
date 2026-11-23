'use strict';
/* Welcome walkthrough: shown only after a successful new-account creation. */
(() => {
  const STORAGE_PREFIX='sj-welcome-tour-new-account-v2:';
  const shownInPage=new Set();
  const slides=[
    {eyebrow:'WELCOME',title:'Welcome to Secret J',desc:'Your space to discover career opportunities and organize your next move. Here is a quick tour.',icon:'✦'},
    {eyebrow:'DISCOVER',title:'Find opportunities that fit',desc:'Open Job Feed to search internships and full-time roles, then filter by company, job type and date.',icon:'⌕'},
    {eyebrow:'PERSONALIZE',title:'Make Job Hunter yours',desc:'Set your career preferences. Matching results and optional email alerts follow your selected criteria.',icon:'◎'},
    {eyebrow:'STAY ORGANIZED',title:'Your CV and saved jobs',desc:'Save promising openings, track applications and keep your CV and profile in your private account workspace.',icon:'▤'},
    {eyebrow:'YOU ARE READY',title:'Start exploring',desc:'Your account is ready. Explore jobs, save your progress and update your preferences whenever you like.',icon:'✓'}
  ];
  function showForNewAccount(accountId,onClose){
    // Called only by the successful register/verify-signup path. Never by
    // anonymous visits, session hydration, or an existing user's login.
    const id=String(accountId||'');
    if(!/^[0-9a-f-]{36}$/i.test(id))return false;
    const key=STORAGE_PREFIX+id;
    if(shownInPage.has(id)||document.querySelector('.sj-tour-shade'))return false;
    try{if(localStorage.getItem(key))return false;}catch{}
    shownInPage.add(id);
    try{localStorage.setItem(key,'1');}catch{}

    const style=document.createElement('style');
    style.textContent=`
      .sj-tour-shade{position:fixed;inset:0;background:rgba(0,0,0,.83);z-index:2147483000;display:grid;place-items:center;padding:20px}
      .sj-tour-panel{background:#151515;border:1px solid #525252;color:#fff;border-radius:22px;padding:30px;width:min(490px,100%);box-shadow:0 30px 90px #0008;font:inherit}
      .sj-tour-icon{display:grid;place-items:center;width:60px;height:60px;border-radius:16px;border:1px solid #5b5b5b;background:#242424;font-size:32px;margin-bottom:23px}
      .sj-tour-eyebrow{font-size:11px;letter-spacing:2px;color:#b5d8ff;font-weight:800}
      .sj-tour-title{font-size:clamp(24px,5vw,32px);line-height:1.16;margin:10px 0 12px;font-weight:800}
      .sj-tour-desc{font-size:15px;line-height:1.7;color:#d2d2d2;min-height:78px}
      .sj-tour-progress{display:flex;gap:7px;margin:22px 0}
      .sj-tour-dot{height:5px;border-radius:8px;flex:1;background:#454545}
      .sj-tour-dot.active{background:#b5d8ff}
      .sj-tour-actions{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}
      .sj-tour-btn{padding:11px 19px;border:1px solid #777;background:transparent;color:white;border-radius:9px;font:inherit;font-weight:700;cursor:pointer}
      .sj-tour-btn.primary{background:white;color:black;border-color:white}
      .sj-tour-btn:focus-visible{outline:3px solid #b5d8ff;outline-offset:2px}
      @media(prefers-reduced-motion:reduce){.sj-tour-shade *{scroll-behavior:auto!important}}
    `;
    document.head.append(style);
    const backdrop=document.createElement('div');backdrop.className='sj-tour-shade';
    backdrop.innerHTML=`<section class="sj-tour-panel" role="dialog" aria-modal="true" aria-labelledby="sj-tour-title" aria-describedby="sj-tour-description">
      <div class="sj-tour-icon" aria-hidden="true"></div><div class="sj-tour-eyebrow"></div>
      <h2 class="sj-tour-title" id="sj-tour-title"></h2><p class="sj-tour-desc" id="sj-tour-description"></p>
      <div class="sj-tour-progress" aria-label="Tour progress"></div><div class="sj-tour-actions">
      <button type="button" class="sj-tour-btn" data-sj-tour="skip">Skip tour</button>
      <div style="display:flex;gap:8px"><button type="button" class="sj-tour-btn" data-sj-tour="back">Back</button>
      <button type="button" class="sj-tour-btn primary" data-sj-tour="next">Next</button></div>
      </div></section>`;
    const previousFocus=document.activeElement;
    let step=0;
    const button=act=>backdrop.querySelector('[data-sj-tour="'+act+'"]');
    function paint(){
      const data=slides[step];
      backdrop.querySelector('.sj-tour-icon').textContent=data.icon;
      backdrop.querySelector('.sj-tour-eyebrow').textContent=data.eyebrow+' · '+(step+1)+' / '+slides.length;
      backdrop.querySelector('.sj-tour-title').textContent=data.title;
      backdrop.querySelector('.sj-tour-desc').textContent=data.desc;
      backdrop.querySelector('.sj-tour-progress').innerHTML=slides.map((_,i)=>'<span class="sj-tour-dot'+(i<=step?' active':'')+'"></span>').join('');
      button('back').hidden=step===0;button('next').textContent=step===slides.length-1?'Start exploring':'Next';
      button('next').focus();
    }
    const keyHandler=event=>{
      if(event.key==='Escape'){event.preventDefault();close();}
      if(event.key!=='Tab')return;
      const items=[...backdrop.querySelectorAll('button:not([hidden])')];
      const idx=items.indexOf(document.activeElement);
      if(event.shiftKey&&idx===0){event.preventDefault();items[items.length-1].focus();}
      else if(!event.shiftKey&&idx===items.length-1){event.preventDefault();items[0].focus();}
    };
    function close(){document.removeEventListener('keydown',keyHandler,true);backdrop.remove();previousFocus?.focus?.();if(typeof onClose==='function')onClose();}
    backdrop.addEventListener('click',event=>{
      const action=event.target.closest('[data-sj-tour]')?.dataset.sjTour;
      if(action==='skip')return close();
      if(action==='back'){step=Math.max(0,step-1);paint();}
      if(action==='next'){if(step===slides.length-1)close();else{step++;paint();}}
    });
    document.body.append(backdrop);
    document.addEventListener('keydown',keyHandler,true);
    paint();
    return true;
  }
  window.SecretJWelcomeTour=Object.freeze({showForNewAccount});
})();