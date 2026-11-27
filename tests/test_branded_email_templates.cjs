'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {codeEmail,testEmail,jobsEmail}=require('../lib/secretj/email-templates');
test('security and alert templates retain the actual code and separate subjects',()=>{
 const messages=['signup','login','alert'].map(kind=>codeEmail(kind,'123456'));
 assert.equal(new Set(messages.map(m=>m.subject)).size,3);
 for(const m of messages){assert.match(m.text,/123456/);assert.match(m.html,/123456/);assert.match(m.html,/cid:secretj-logo/);assert.match(m.html,/viewport/);assert.doesNotMatch(m.subject,/123456/);assert.match(m.text,/10 minutes/);}
 assert.throws(()=>codeEmail('login','bad'));
 assert.match(testEmail().subject,/test email/);
});
test('job email counts, safe links, plain text and HTML escaping',()=>{
 const row={title:'<script>alert(1)</script>',company:'A & B',location:'Cairo',note:'Requirements matched; verify details',url:'https://example.com/role?a=1&b=2'};
 const single=jobsEmail([row]);assert.match(single.subject,/a new opportunity/);
 assert.match(single.html,/&lt;script&gt;/);assert.doesNotMatch(single.html,/<script>/);
 assert.match(single.html,/A &amp; B/);assert.match(single.html,/https:\/\/example.com\/role\?a=1&amp;b=2/);
 assert.match(single.html,/view=preferences/);assert.match(single.text,/Requirements matched/);
 const multiple=jobsEmail([row,{...row,url:'javascript:alert(1)'}]);assert.match(multiple.subject,/2 new opportunities/);assert.doesNotMatch(multiple.html,/href="javascript:/);
});
test('Resend receives HTML, plain text and an embedded PNG with the same sender address',async()=>{
 const {send}=require('../api/secretj-email');const original=global.fetch;let payload,headers;
 global.fetch=async(url,opts)=>{payload=JSON.parse(opts.body);headers=opts.headers;return {ok:true};};
 try{const m=codeEmail('login','123456');await send('user@example.com',m.subject,m.text,{RESEND_API_KEY:'test',SECRETJ_EMAIL_FROM:'alerts@example.org',IDEMPOTENCY_KEY:'test-key'},m);
 assert.equal(payload.from,'Secret J | Security <alerts@example.org>');assert.equal(payload.html,m.html);assert.equal(payload.text,m.text);assert.equal(headers['Idempotency-Key'],'test-key');assert.deepEqual(payload.to,['user@example.com']);assert.equal(payload.attachments[0].content_id,'secretj-logo');assert.equal(Buffer.from(payload.attachments[0].content,'base64').subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 }finally{global.fetch=original;}
});
