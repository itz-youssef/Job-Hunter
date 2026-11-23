(() => {
'use strict';
// Share the same preference key and theme attribute as the main Job Hunter UI.
const button=document.getElementById('account-theme-toggle');
const icon=document.getElementById('account-theme-icon');
const label=document.getElementById('account-theme-label');
if(!button||!icon||!label)return;
function applyTheme(theme){
  const dark=theme==='dark';
  document.documentElement.dataset.theme=dark?'dark':'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#000000':'#ffffff');
  label.textContent=dark?'Light':'Dark';
  icon.textContent=dark?'☼':'◐';
  button.setAttribute('aria-pressed',String(dark));
  button.setAttribute('aria-label',dark?'Switch to light mode':'Switch to dark mode');
  button.title=dark?'Switch to light mode':'Switch to dark mode';
}
applyTheme(document.documentElement.dataset.theme==='dark'?'dark':'light');
button.addEventListener('click',()=>{
  const next=document.documentElement.dataset.theme==='dark'?'light':'dark';
  applyTheme(next);
  try{localStorage.setItem('jh-theme',next);}catch{}
});
window.addEventListener('storage',event=>{
  if(event.key!=='jh-theme')return;
  if(event.newValue==='dark'||event.newValue==='light')applyTheme(event.newValue);
});
window.addEventListener('pageshow',()=>{
  try{
    const saved=localStorage.getItem('jh-theme');
    if(saved==='dark'||saved==='light')applyTheme(saved);
  }catch{}
});
})();
