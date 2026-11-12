'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const companies = require('../api/companies.js');
const email = require('../api/email-destination.js');

const SECRET = 'test-admin-token-12345678901234567890';

function req(method, body = {}, token = SECRET) {
  return {
    method,
    body,
    headers: { 'x-admin-token': token }
  };
}

async function call(handler, request) {
  return new Promise((resolve, reject) => {
    const headers = {};
    const response = {
      statusCode: 200,
      setHeader(key, value) { headers[key] = value; },
      end(body) { resolve({ status: this.statusCode, body: JSON.parse(body), headers }); }
    };
    Promise.resolve(handler(request, response)).catch(reject);
  });
}

test('company PIN and edit are authenticated, persisted and do not mutate URLs', async () => {
  const oldEnv = { ...process.env };
  const originalFetch = global.fetch;
  process.env.ADMIN_TOKEN = SECRET;
  process.env.GITHUB_REPO = 'test/Job-Hunter';
  process.env.GITHUB_TOKEN = 'local-test-token';
  process.env.GITHUB_BRANCH = 'main';
  let registry = [{ name: 'Original', url: 'https://example.com/careers', added_at: '2026-01-01' }];
  let writes = 0;
  global.fetch = async (_url, opts) => {
    if (opts.method === 'PUT') {
      const payload = JSON.parse(opts.body);
      registry = JSON.parse(Buffer.from(payload.content, 'base64').toString('utf8'));
      writes++;
      return { ok: true, status: 200, json: async () => ({ commit: { sha: 'latest' } }) };
    }
    return { ok: true, status: 200, json: async () => ({
      content: Buffer.from(JSON.stringify(registry)).toString('base64'), sha: 'oldsha'
    }) };
  };
  try {
    const unauthorized = await call(companies, req('PATCH', { url: registry[0].url, name: 'Changed' }, 'invalid'));
    assert.equal(unauthorized.status, 401);
    assert.equal(writes, 0);

    const pinned = await call(companies, req('PATCH', { url: registry[0].url, pinned: true }));
    assert.equal(pinned.status, 200);
    assert.equal(pinned.body.company.pinned, true);
    assert.equal(registry[0].url, 'https://example.com/careers');

    const renamed = await call(companies, req('PATCH', { url: registry[0].url, name: 'New Company' }));
    assert.equal(renamed.status, 200);
    assert.equal(registry[0].name, 'New Company');
    assert.equal(registry[0].pinned, true);

    const invalid = await call(companies, req('PATCH', { url: registry[0].url, pinned: 'yes' }));
    assert.equal(invalid.status, 400);
    assert.equal(writes, 2);
  } finally {
    global.fetch = originalFetch;
    process.env = oldEnv;
  }
});

test('full email address is never exposed without admin authentication', async () => {
  const oldEnv = { ...process.env };
  process.env.ADMIN_TOKEN = SECRET;
  process.env.ALERT_EMAIL = 'example@domain.test';
  try {
    const denied = await call(email, req('GET', {}, 'incorrect'));
    assert.equal(denied.status, 401);
    assert.ok(!JSON.stringify(denied.body).includes('example@domain.test'));
    const allowed = await call(email, req('GET'));
    assert.equal(allowed.status, 200);
    assert.equal(allowed.body.email, 'example@domain.test');
    assert.match(allowed.headers['Cache-Control'], /no-store/);
  } finally {
    process.env = oldEnv;
  }
});

test('new HTML inline scripts parse as JavaScript', () => {
  const html = fs.readFileSync(path.join(__dirname, '../dist/index.html'), 'utf8');
  const scriptContents = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  assert.ok(scriptContents.length >= 1);
  for (const match of scriptContents)
    assert.doesNotThrow(() => new vm.Script(match[1]));
  assert.match(html, /data-edit-name/);
  assert.match(html, /data-pin/);
});
