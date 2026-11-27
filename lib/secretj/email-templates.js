'use strict';
// Server-only, dependency-free HTML email renderer. Untrusted text is escaped;
// only https destinations are rendered as links. No scripts or tracking pixels.
const SITE='https://www.jobsnow.tech';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean=value=>String(value??'').replace(/[\r\n\u0000-\u001f\u007f]+/g,' ').trim();
const safeLink=value=>{try{const u=new URL(String(value));return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}};
const button=(label,url)=>safeLink(url)?'<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#111111" style="border-radius:5px;"><a href="'+esc(url)+'" style="display:inline-block;padding:13px 20px;color:#ffffff;text-decoration:none;font:700 14px Arial,sans-serif;">'+esc(label)+' &rarr;</a></td></tr></table>':'';
const para=value=>'<p style="margin:0 0 16px;font:15px/1.65 Arial,sans-serif;color:#454545;">'+esc(value)+'</p>';
function layout({category,heading,preheader,body,alerts=false}){
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>'+esc(heading)+'</title></head><body style="margin:0;padding:0;background:#eeeeee;color:#111111;">'+
 '<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">'+esc(preheader)+'</div>'+
 '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#eeeeee"><tr><td align="center" style="padding:20px 10px;">'+
 '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;border:1px solid #dddddd;">'+
 '<tr><td style="padding:22px 24px;"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td width="40" valign="middle"><img src="cid:secretj-logo" alt="J." width="34" height="34" style="display:block;border:0;border-radius:7px;background:#111111;color:#ffffff;font:700 19px Arial,sans-serif;"></td><td valign="middle" style="font:800 21px Arial,sans-serif;color:#111111;">Secret J.</td></tr></table></td></tr>'+
 '<tr><td bgcolor="#111111" style="padding:26px 24px;border-top:3px solid #555555;border-bottom:5px solid #333333;"><div style="font:700 10px Arial,sans-serif;letter-spacing:2px;color:#cccccc;">'+esc(category.toUpperCase())+'</div><h1 style="margin:12px 0 0;color:#ffffff;font:700 29px/1.18 Arial,sans-serif;">'+esc(heading)+'</h1></td></tr>'+
 '<tr><td style="padding:26px 24px;">'+body+'</td></tr>'+
 '<tr><td bgcolor="#f5f5f5" style="padding:22px 24px;border-top:1px solid #dddddd;font:12px/1.7 Arial,sans-serif;color:#555555;"><strong style="color:#111111;">Secret J.</strong> &middot; Your career companion.<br><a href="'+SITE+'" style="color:#333333;">Website</a> &middot; <a href="'+SITE+'/privacy.html" style="color:#333333;">Privacy policy</a>'+(alerts?' &middot; <a href="'+SITE+'/account.html?view=preferences" style="color:#333333;">Manage or turn off email alerts</a>':'')+'<br>'+(alerts?'You receive job alerts only when enabled in your account.':'This message relates to your Secret J account or a request you made.')+'</td></tr></table></td></tr></table></body></html>';
}
function codeEmail(kind,code,minutes=10){
 if(!/^\d{6}$/.test(String(code)))throw new Error('Invalid verification code');
 const templates={
 signup:{subject:'Verify your Secret J account',category:'Account verification',heading:'Welcome to Secret J.',intro:'Verify your email address to finish creating your account.',prefix:'Your Secret J account verification code is: '},
 login:{subject:'Your Secret J sign-in code',category:'Account security',heading:'Confirm your sign-in.',intro:'Use this one-time code to sign in to your Secret J account.',prefix:'Your Secret J sign-in code is: '},
 alert:{subject:'Confirm your Job Hunter alert email',category:'Job Hunter · Email alerts',heading:'Confirm your alert email.',intro:'Your email test was successful. Enter this code in your account to confirm this destination.',prefix:'Your confirmation code: '}
 };
 const t=templates[kind];if(!t)throw new Error('Unknown code template');
 const notice='This code expires in '+minutes+' minutes. Never share it with anyone. If you did not request it, ignore this message.';
 const text=t.prefix+code+'\n\n'+t.intro+'\n\n'+notice;
 const body=para(t.intro)+'<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0 22px;"><tr><td align="center" bgcolor="#f4f4f4" style="padding:20px;border:1px solid #dddddd;color:#111111;font:700 32px/1.3 Courier New,monospace;letter-spacing:5px;">'+esc(code)+'</td></tr></table>'+para(notice);
 return {subject:t.subject,text,html:layout({...t,preheader:'Your verification code is ready. It expires in '+minutes+' minutes.',body}),sender:kind==='alert'?'Secret J | Job Hunter':'Secret J | Security'};
}
function testEmail(){
 const subject='Job Hunter: your test email arrived',heading='Your email is connected.',intro='Your Secret J test email was accepted by the mail provider.',note='You will only receive job alerts when you opt in.';
 return {subject,text:intro+'\n\n'+note,html:layout({category:'Job Hunter · Email test',heading,preheader:'Your email delivery test was successful.',body:para(intro)+para(note)+button('Manage alert preferences',SITE+'/account.html?view=preferences')}),sender:'Secret J | Job Hunter'};
}
function jobsEmail(jobs,{intro='New opportunities detected by your personalized job monitor:',footer='Manage alerts under Secret J > Preferences.'}={}){
 const entries=jobs.map(j=>({title:clean(j.title)||'Role',company:clean(j.company)||'Employer',location:clean(j.location),note:clean(j.note),url:safeLink(j.url)}));
 const count=entries.length;
 const subject=count===1?'Job Hunter: a new opportunity for you':'Job Hunter: '+count+' new opportunities for you';
 const heading=count===1?'A new opportunity.':count+' new opportunities.';
 const plain=entries.map(j=>j.title+' at '+j.company+(j.note?' ['+j.note+']':'')+(j.location?'\n'+j.location:'')+'\n'+j.url).join('\n\n');
 const cards=entries.map(j=>'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;border:1px solid #dddddd;"><tr><td style="padding:18px;"><div style="font:700 10px Arial,sans-serif;letter-spacing:1.3px;color:#666666;">NEW OPPORTUNITY</div><h2 style="margin:8px 0;color:#111111;font:700 18px/1.35 Arial,sans-serif;overflow-wrap:anywhere;">'+esc(j.title)+'</h2>'+para(j.company+(j.location?' · '+j.location:''))+(j.note?para(j.note):'')+button('View opportunity',j.url)+'</td></tr></table>').join('');
 const body=para(intro)+cards+button('Explore your Job Feed',SITE+'/#jobs')+'<p style="margin:20px 0 0;font:12px/1.6 Arial,sans-serif;color:#666666;">Confirm role details on the employer’s website.</p>';
 return {subject,text:intro+'\n\n'+plain+'\n\n'+footer,html:layout({category:'Job Hunter · Personalized opportunities',heading,preheader:count+' new matching '+(count===1?'opportunity':'opportunities')+' from Job Hunter.',body,alerts:true}),sender:'Secret J | Job Hunter'};
}
module.exports={codeEmail,testEmail,jobsEmail,layout,esc,safeLink};
