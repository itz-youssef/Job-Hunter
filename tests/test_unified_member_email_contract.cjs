'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const read=path=>fs.readFileSync(path,'utf8');

test('production scanner workflows never receive SMTP secrets or legacy operator address',()=>{
  for(const file of ['.github/workflows/monitor.yml','.github/workflows/custom-companies.yml']){
    const workflow=read(file);
    assert.doesNotMatch(workflow,/\$\{\{\s*secrets\.(?:SMTP_USER|SMTP_PASSWORD|SMTP_FROM|ALERT_EMAIL)/);
    assert.doesNotMatch(workflow,/python -m app\.notify_once/);
  }
  assert.match(read('.github/workflows/custom-companies.yml'),/LEGACY_SMTP_DISABLED:\s*"true"/);
});

test('legacy one-off test workflow cannot send SMTP mail',()=>{
  const workflow=read('.github/workflows/test-email.yml');
  assert.doesNotMatch(workflow,/smtplib|smtp\.send_message|secrets\.SMTP_/);
});

test('custom scan preserves state without using operator SMTP when disabled',()=>{
  const code=read('app/custom_monitor.py');
  assert.match(code,/os\.getenv\("LEGACY_SMTP_DISABLED"\) == "true"/);
  assert.match(code,/os\.getenv\("LEGACY_SMTP_DISABLED"\) != "true"/);
});

test('the website email service uses Resend and the dedicated domain sender',()=>{
  const email=read('api/secretj-email.js');
  const alerts=read('lib/secretj/member-alerts.js');
  assert.match(email,/api\.resend\.com\/emails/);
  assert.match(email,/from:process\.env\.SECRETJ_EMAIL_FROM/);
  assert.match(alerts,/p\.email_alerts=true AND v\.verified_at IS NOT NULL/);
  assert.doesNotMatch(alerts,/process\.env\.ALERT_EMAIL/);
});
