'use strict';
const { timingSafeEqual } = require('node:crypto');

module.exports = async function handler(req, res) {
  const reply = (status, data) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.end(JSON.stringify(data));
  };

  if (req.method !== 'GET')
    return reply(405, { error: 'Method not allowed' });

  const expected = process.env.ADMIN_TOKEN || '';
  const provided = req.headers['x-admin-token'] || '';

  if (expected.length < 24 || typeof provided !== 'string')
    return reply(401, { error: 'Admin authentication required' });

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b))
    return reply(401, { error: 'Invalid admin token' });

  // Vercel runtime cannot read GitHub Actions secrets directly.
  // Set ALERT_EMAIL on Vercel to the same destination used by Actions.
  const email = (process.env.ALERT_EMAIL || '').trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return reply(503, {
      error: 'Configure ALERT_EMAIL in Vercel Production environment variables to enable private reveal.'
    });

  return reply(200, { email, source: 'Vercel ALERT_EMAIL', verified_at: new Date().toISOString() });
};
