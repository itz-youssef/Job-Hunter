'use strict';

const { timingSafeEqual } = require('node:crypto');
const { isIP } = require('node:net');

const FILE = 'companies.json';
const MAX_COMPANIES = 150;

function respond(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.end(JSON.stringify(data));
}

function authorized(req) {
  const secret = process.env.ADMIN_TOKEN || '';
  const sent = req.headers['x-admin-token'] || '';
  if (secret.length < 24 || typeof sent !== 'string') return false;
  const a = Buffer.from(secret, 'utf8');
  const b = Buffer.from(sent, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

function validatedUrl(value) {
  if (typeof value !== 'string' || value.length > 2048)
    throw new Error('Enter a valid careers URL');
  let url;
  try { url = new URL(value.trim()); }
  catch { throw new Error('Invalid careers URL'); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password ||
      (url.port && url.port !== '443') || isIP(host) ||
      host === 'localhost' || host.endsWith('.localhost') ||
      host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.'))
    throw new Error('Only public HTTPS careers URLs are allowed');
  url.hash = '';
  return url.toString();
}

function companyName(value) {
  if (typeof value !== 'string')
    throw new Error('Company name must be text');
  const name = value.trim().replace(/\s+/g, ' ');
  if (!name || name.length > 100)
    throw new Error('Company name must contain 1–100 characters');
  return name;
}

function parseBody(req) {
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return req.body || {};
}

async function github(path, options = {}) {
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token || !/^[\w.-]+\/[\w.-]+$/.test(repo))
    throw new Error('GitHub connection is not configured');
  const response = await fetch(
    'https://api.github.com/repos/' + repo + '/' + path,
    {
      ...options,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + token,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'job-hunter',
        ...(options.headers || {})
      },
      signal: AbortSignal.timeout(12000)
    }
  );
  if (response.status === 404 && options.method !== 'PUT') return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error('GitHub API ' + response.status + ': ' + (data.message || 'Request failed'));
    error.status = response.status === 409 ? 409 : 502;
    throw error;
  }
  return data;
}

async function loadCompanies() {
  const ref = encodeURIComponent(process.env.GITHUB_BRANCH || 'main');
  const file = await github('contents/' + FILE + '?ref=' + ref);
  if (!file) return { companies: [], sha: null };
  const decoded = Buffer.from((file.content || '').replace(/\s/g, ''), 'base64').toString('utf8');
  const parsed = JSON.parse(decoded);
  const companies = Array.isArray(parsed) ? parsed : parsed.companies;
  if (!Array.isArray(companies))
    throw new Error('Invalid companies.json format');
  return { companies, sha: file.sha };
}

async function saveCompanies(companies, sha) {
  const body = {
    message: 'Update custom careers watchlist',
    branch: process.env.GITHUB_BRANCH || 'main',
    content: Buffer.from(JSON.stringify(companies, null, 2) + '\n').toString('base64')
  };
  if (sha) body.sha = sha;
  return github('contents/' + FILE, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

module.exports = async function handler(req, res) {
  const method = req.method || 'GET';
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method))
    return respond(res, 405, { error: 'Method not allowed' });
  if (method !== 'GET' && !authorized(req))
    return respond(res, 401, { error: 'Invalid admin token' });

  try {
    if (method === 'GET') {
      const { companies } = await loadCompanies();
      return respond(res, 200, { companies });
    }

    const body = parseBody(req);
    if (!body || typeof body !== 'object' || Array.isArray(body))
      return respond(res, 400, { error: 'Expected JSON object' });

    const url = validatedUrl(body.url);
    const { companies, sha } = await loadCompanies();
    const index = companies.findIndex(c => validatedUrl(c.url) === url);

    if (method === 'DELETE') {
      if (index === -1) return respond(res, 404, { error: 'Company not found' });
      companies.splice(index, 1);
      await saveCompanies(companies, sha);
      return respond(res, 200, { ok: true, companies });
    }

    if (method === 'PATCH') {
      if (index === -1) return respond(res, 404, { error: 'Company not found' });
      if (!Object.hasOwn(body, 'name') && !Object.hasOwn(body, 'pinned'))
        return respond(res, 400, { error: 'Provide name or pinned' });
      const updated = { ...companies[index] };
      if (Object.hasOwn(body, 'name')) {
        const name = companyName(body.name);
        const duplicate = companies.some((c, i) =>
          i !== index && String(c.name || '').toLowerCase() === name.toLowerCase()
        );
        if (duplicate) return respond(res, 409, { error: 'Company name already exists' });
        updated.name = name;
      }
      if (Object.hasOwn(body, 'pinned')) {
        if (typeof body.pinned !== 'boolean')
          return respond(res, 400, { error: 'Pinned must be true or false' });
        updated.pinned = body.pinned;
      }
      updated.updated_at = new Date().toISOString();
      companies[index] = updated;
      await saveCompanies(companies, sha);
      return respond(res, 200, { ok: true, company: updated, companies });
    }

    if (index !== -1)
      return respond(res, 409, { error: 'Company already registered' });
    if (companies.length >= MAX_COMPANIES)
      return respond(res, 400, { error: 'Company limit reached' });

    const name = companyName(body.name || new URL(url).hostname);
    if (companies.some(c => String(c.name || '').toLowerCase() === name.toLowerCase()))
      return respond(res, 409, { error: 'Company name already exists' });
    if (Object.hasOwn(body, 'pinned') && typeof body.pinned !== 'boolean')
      return respond(res, 400, { error: 'Pinned must be true or false' });

    const company = {
      name,
      url,
      pinned: body.pinned === true,
      added_at: new Date().toISOString()
    };
    companies.push(company);
    await saveCompanies(companies, sha);
    return respond(res, 201, { ok: true, company, companies });
  } catch (error) {
    if (error.status) return respond(res, error.status, { error: error.message });
    if (error instanceof SyntaxError || /company|url|https|invalid|public/i.test(error.message))
      return respond(res, 400, { error: error.message });
    return respond(res, 500, { error: 'Unable to update companies. Check Vercel logs.' });
  }
};
