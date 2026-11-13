'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const sql = fs.readFileSync(
  'database/migrations/001_secret_j_multitenant.sql', 'utf8',
);

const privateTables = [
  'secret_j_profiles',
  'secret_j_user_roles',
  'secret_j_job_preferences',
  'secret_j_saved_jobs',
  'secret_j_applications',
  'secret_j_cv_documents',
  'secret_j_admin_audit',
];

test('schema only introduces isolated Secret J tables', () => {
  const created = [...sql.matchAll(/CREATE TABLE public\.([a-z_]+)/g)].map(m => m[1]);
  assert.deepEqual(created.sort(), [...privateTables].sort());
  assert.doesNotMatch(sql, /(?:DROP|TRUNCATE)\s+TABLE/i);
  assert.doesNotMatch(sql, /ALTER\s+TABLE\s+(?:public\.)?(?:jobs|sources|outbox|companies)\b/i);
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
});

test('every table has RLS enabled and every member row policy is owner-scoped', () => {
  for(const table of privateTables) {
    assert.match(sql, new RegExp(
      'ALTER TABLE public\\.' + table + ' ENABLE ROW LEVEL SECURITY;'
    ));
  }
  for(const table of privateTables.filter(t => !t.includes('audit'))) {
    assert.match(sql, new RegExp(
      'ON public\\.' + table + '[\\s\\S]{0,160}user_id = \\(SELECT auth\\.user_id\\(\\)\\)'
    ));
  }
  assert.doesNotMatch(sql, /TO\s+(?:PUBLIC|anonymous)\s+USING/i);
});

test('admin role is read only to authenticated browser clients', () => {
  assert.match(sql, /secret_j_roles_read_self[\s\S]*?FOR SELECT TO authenticated/);
  assert.match(sql, /GRANT SELECT ON TABLE public\.secret_j_user_roles TO authenticated/);
  assert.doesNotMatch(sql, /GRANT (?:ALL|INSERT|UPDATE|DELETE)[^;]*secret_j_user_roles TO authenticated/i);
  assert.match(sql, /No grants on secret_j_admin_audit/);
});

test('CVs are referenced only as object keys in a private bucket', () => {
  assert.match(sql, /CREATE TABLE public\.secret_j_cv_documents/);
  assert.match(sql, /object_key TEXT NOT NULL UNIQUE/);
  assert.match(sql, /is_primary BOOLEAN NOT NULL/);
  assert.doesNotMatch(sql, /(?:pdf_blob|cv_blob|password_hash|password TEXT)/i);
  assert.match(sql, /mime_type TEXT NOT NULL CHECK/);
  assert.match(sql, /size_bytes INTEGER NOT NULL CHECK/);
});

test('new schema cannot start without Neon Data API and managed authentication', () => {
  assert.match(sql, /to_regprocedure\('auth\.user_id\(\)'\)/);
  assert.match(sql, /rolname = 'authenticated'/);
  assert.match(sql, /No browser mutation grants on user_roles/);
});

test('private member data is restricted to the authenticated identity', () => {
  for(const table of [
    'secret_j_profiles',
    'secret_j_job_preferences',
    'secret_j_saved_jobs',
    'secret_j_applications',
    'secret_j_cv_documents',
  ]) {
    assert.match(sql, new RegExp(
      'CREATE POLICY secret_j_\\w+_owner\\s+ON public\\.' + table +
      ' FOR ALL TO authenticated\\s+USING \\(user_id = \\(SELECT auth\\.user_id\\(\\)\\)\\)' +
      '\\s+WITH CHECK \\(user_id = \\(SELECT auth\\.user_id\\(\\)\\)\\)',
      'i'
    ));
  }
});

test('auth provider owns identities, not a duplicate insecure users table', () => {
  assert.doesNotMatch(sql, /CREATE TABLE public\.(?:users|sessions|accounts)\b/i);
  assert.match(sql, /Neon-managed neon_auth\.\* tables/);
});
