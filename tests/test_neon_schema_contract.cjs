'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const migration=fs.readFileSync('database/migrations/001_secret_j_multitenant.sql','utf8');
const tables=['sj_users','sj_sessions','sj_auth_attempts','sj_profiles','sj_preferences','sj_saved_jobs','sj_applications','sj_cv_files','sj_avatars','sj_admin_audit'];
test('migration creates only isolated Secret J tables; never edits scanner tables',()=>{
  const made=[...migration.matchAll(/CREATE TABLE IF NOT EXISTS public\.(\w+)/g)].map(m=>m[1]);
  assert.deepEqual(made.sort(),tables.slice().sort());
  assert.doesNotMatch(migration,/\b(?:DROP|TRUNCATE)\s+TABLE/i);
  assert.doesNotMatch(migration,/\bALTER TABLE (?:public\.)?(?:jobs|sources|outbox|companies|history)\b/i);
  assert.doesNotMatch(migration,/REVOKE ALL ON ALL TABLES IN SCHEMA public/i);
  assert.match(migration,/^BEGIN;/m);
  assert.match(migration,/^COMMIT;/m);
});
test('no public Neon Data API grants or browser access to password/session tables',()=>{
  for(const name of tables)assert.match(migration,new RegExp('ALTER TABLE public\\.'+name+' ENABLE ROW LEVEL SECURITY'));
  assert.match(migration,/REVOKE ALL ON TABLE public\.sj_users/);
  assert.doesNotMatch(migration,/GRANT\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE)[^;]*\bTO PUBLIC\b/i);
  assert.doesNotMatch(migration,/CREATE POLICY/i);
});
test('users have unique email, safe server-only password hashes, roles and sessions',()=>{
  assert.match(migration,/email TEXT NOT NULL UNIQUE/);
  assert.match(migration,/password_hash TEXT NOT NULL/);
  assert.match(migration,/CHECK \(role IN \('member','admin'\)\)/);
  assert.match(migration,/token_hash CHAR\(64\) PRIMARY KEY/);
  assert.match(migration,/expires_at TIMESTAMPTZ NOT NULL/);
  assert.doesNotMatch(migration,/password_plain|password TEXT/i);
});
test('every personal data table belongs to a user',()=>{
  for(const table of ['sj_profiles','sj_preferences','sj_saved_jobs','sj_applications','sj_cv_files','sj_avatars'])
    assert.match(migration,new RegExp('CREATE TABLE IF NOT EXISTS public\\.'+table+' \\([\\s\\S]*?user_id UUID[^\\n]*REFERENCES public\\.sj_users'));
});
test('CV/avatar content is private and size bounded, no public file urls',()=>{
  assert.match(migration,/content BYTEA NOT NULL/);
  assert.match(migration,/size_bytes INTEGER NOT NULL CHECK \(size_bytes BETWEEN 1 AND 786432\)/);
  assert.match(migration,/size_bytes INTEGER NOT NULL CHECK \(size_bytes BETWEEN 1 AND 102400\)/);
  assert.doesNotMatch(migration,/public_url|bucket_public/i);
});
test('application and saved job ownership is part of unique key',()=>{
  assert.match(migration,/PRIMARY KEY \(user_id,job_key\)/);
  assert.match(migration,/UNIQUE\(user_id,job_key\)/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS public\.sj_admin_audit/);
});
test('Neon URI only read in server-side code and from environment',()=>{
  const core=fs.readFileSync('api/_secretj/core.js','utf8');
  assert.match(core,/process\.env\.DATABASE_URL/);
  assert.doesNotMatch(core,/postgresql:\/\/[^"']+@ep-/);
  assert.match(core,/@neondatabase\/serverless/);
  const frontend=fs.readFileSync('dist/assets/secretj-account.js','utf8');
  assert.doesNotMatch(frontend,/DATABASE_URL|password_hash|sj_sessions|neondb_owner/);
});
