'use strict';

/**
 * Server-only Secret J authentication boundary.
 * Do not send DATABASE_URL, session tokens or passwords to the browser.
 */
const { createHash, randomBytes, randomUUID, scrypt: callbackScrypt,
  timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(callbackScrypt);
const COOKIE = 'sj_session';
const SESSION_AGE = 7 * 24 * 60 * 60;
let queryOverride = null;

function db() {
  if (queryOverride) return queryOverride;
  const url = process.env.DATABASE_URL;
  if (!url || !/^postgres(?:ql)?:\/\/.+/i.test(url)) {
    const error = new Error('Neon database has not been configured');
    error.status = 503;
    throw error;
  }
  // Lazy import preserves original API tests without DATABASE_URL.
  const { neon } = require('@neondatabase/serverless');
  return neon(url);
}
function query(text, values = []) { return db()(text, values); }
function setQueryForTests(fn) {
  if (process.env.NODE_ENV !== 'test') throw Error('Test injection is disabled');
  queryOverride = fn;
}
function fail(status, message) { return Object.assign(new Error(message), { status }); }
function hash(value) { return createHash('sha256').update(String(value)).digest('hex'); }
function cleanEmail(email) {
  const result = String(email || '').trim().toLowerCase();
  if (result.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) {
    throw fail(400, 'Enter a valid email address');
  }
  return result;
}
function validateText(input, max, label) {
  if (typeof input !== 'string' || input.length > max) {
    throw fail(400, label + ' is invalid or too long');
  }
  return input.trim();
}
function parseBody(req) {
  let body = req.body || {};
  if (typeof body === 'string') {
    if (body.length > 1_250_000) throw fail(413, 'Request too large');
    try { body = JSON.parse(body); }
    catch { throw fail(400, 'Invalid JSON'); }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
    JSON.stringify(body).length > 1_250_000) throw fail(400, 'Invalid request');
  return body;
}
function reply(res, status, data) {
  res.statusCode = status;
  for (const [k,v] of Object.entries({
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer',
    'Vary':'Cookie'
  })) res.setHeader(k,v);
  res.end(JSON.stringify(data));
}
function sameOrigin(req) {
  if (['GET','HEAD'].includes(req.method)) return true;
  const host = req.headers?.host;
  const origin = req.headers?.origin;
  if (typeof host !== 'string' || typeof origin !== 'string') return false;
  try {
    const source = new URL(origin);
    return source.host.toLowerCase() === host.toLowerCase() &&
      (source.protocol === 'https:' ||
       (source.protocol === 'http:' && /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)));
  } catch { return false; }
}
function guardOrigin(req) { if (!sameOrigin(req)) throw fail(403, 'Origin not permitted'); }
function cookies(req) {
  return Object.fromEntries(String(req.headers?.cookie || '').split(';')
    .map(item => item.trim()).filter(item => item.includes('='))
    .map(item => {
      const offset = item.indexOf('=');
      return [item.slice(0,offset),item.slice(offset+1)];
    }));
}
function sessionCookie(value, clear=false) {
  const secure = Boolean(process.env.VERCEL || process.env.NODE_ENV === 'production');
  const pieces = [
    COOKIE + '=' + (clear ? '' : value),
    'HttpOnly', 'SameSite=Lax', 'Path=/',
    'Max-Age=' + (clear ? 0 : SESSION_AGE)
  ];
  if (secure) pieces.push('Secure');
  return pieces.join('; ');
}
async function userForRequest(req) {
  const token = cookies(req)[COOKIE];
  if (!token || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const rows = await query(
    `SELECT u.id,u.email,u.role,u.is_active
       FROM public.sj_sessions s JOIN public.sj_users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at>now() AND u.is_active=true
      LIMIT 1`, [hash(token)]
  );
  return rows[0] || null;
}
async function requireUser(req) {
  const user = await userForRequest(req);
  if (!user) throw fail(401, 'Sign in to continue');
  return user;
}
async function requireAdmin(req) {
  const user = await requireUser(req);
  if (user.role !== 'admin') throw fail(403, 'Administrator access required');
  return user;
}
async function issueSession(res, userId) {
  const token = randomBytes(32).toString('base64url');
  await query(
    `INSERT INTO public.sj_sessions(token_hash,user_id,expires_at)
     VALUES($1,$2,now()+interval '7 days')`,
    [hash(token), userId]
  );
  res.setHeader('Set-Cookie', sessionCookie(token));
}
async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const result = await scrypt(password,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024});
  return 'scrypt$16384$' + salt + '$' + result.toString('hex');
}
async function checkPassword(password, stored) {
  const parts = String(stored||'').split('$');
  if (parts.length!==4 || parts[0]!=='scrypt' || parts[1]!=='16384' ||
      !/^[0-9a-f]{32}$/.test(parts[2]) || !/^[0-9a-f]{128}$/.test(parts[3])) return false;
  const derived = await scrypt(password,parts[2],64,{N:16384,r:8,p:1,maxmem:64*1024*1024});
  return timingSafeEqual(derived,Buffer.from(parts[3],'hex'));
}
function publicUser(user) {return {id:user.id,email:user.email,role:user.role};}
function safeError(res, error) {
  const status = [400,401,403,404,405,409,413,429,503].includes(error?.status)
    ? error.status : error?.code === '23505' ? 409 : 500;
  const message = status===500 ? 'Request could not be completed' :
    status===409 ? 'This record already exists' : error.message;
  return reply(res,status,{ok:false,error:message});
}
function clientIp(req) {
  // Trusted Vercel front proxy supplies x-forwarded-for; do not log raw IP.
  return String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    .split(',')[0].trim().slice(0,100);
}
async function allowAuthAttempt(req,email) {
  const keys = [
    ['ip',clientIp(req),20,3600],
    ['email',email,10,900]
  ];
  for (const [kind,value,limit,windowSeconds] of keys) {
    const key = hash(kind+':'+value);
    const rows=await query(
      `INSERT INTO public.sj_auth_attempts(key_hash,attempts,window_started_at)
       VALUES($1,1,now())
       ON CONFLICT(key_hash) DO UPDATE SET
         attempts=CASE WHEN sj_auth_attempts.window_started_at < now()-($2::int * interval '1 second')
           THEN 1 ELSE sj_auth_attempts.attempts+1 END,
         window_started_at=CASE WHEN sj_auth_attempts.window_started_at < now()-($2::int * interval '1 second')
           THEN now() ELSE sj_auth_attempts.window_started_at END
       RETURNING attempts`, [key,windowSeconds]
    );
    if (rows[0].attempts > limit) throw fail(429, 'Too many attempts. Try again later');
  }
}
function allowedMethod(req, allowed) {
  if (!allowed.includes(req.method)) throw fail(405, 'Method not allowed');
  if (req.method!=='GET') guardOrigin(req);
}
module.exports = {
  query, fail, hash, cleanEmail, validateText, parseBody, reply, sameOrigin,
  guardOrigin, cookies, sessionCookie, userForRequest, requireUser, requireAdmin,
  issueSession, hashPassword, checkPassword, publicUser, safeError,
  allowAuthAttempt, allowedMethod, randomUUID, setQueryForTests
};
