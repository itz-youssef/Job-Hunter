
'use strict';

const { timingSafeEqual } = require('node:crypto');
const { isIP } = require('node:net');

const FILE = 'companies.json';
const MAX_COMPANIES = 100;

function respond(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(JSON.stringify(data));
}

function validateUrl(value) {
  if (typeof value !== 'string' || value.length > 2048)
    throw Error('Enter a valid careers URL');

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw Error('Invalid careers URL');
  }

  const host = url.hostname.toLowerCase();

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    isIP(host) ||
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    !host.includes('.')
  ) {
    throw Error('Only public HTTPS careers URLs are allowed');
  }

  url.hash = '';
  return url.toString();
}

function authorized(req) {
  const expected = process.env.ADMIN_TOKEN || '';
  const provided = req.headers['x-admin-token'] || '';

  if (expected.length < 24 || typeof provided !== 'string')
    return false;

  const a = Buffer.from(expected);
  const b = Buffer.from(provided);

  return a.length === b.length && timingSafeEqual(a, b);
}

async function github(path, options = {}) {
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;

  if (!repo || !token)
    throw Error('GitHub environment variables are missing');

  const response = await fetch(
    `https://api.github.com/repos/${repo}/${path}`,
    {
      ...options,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'job-hunter',
        ...(options.headers || {})
      },
      signal: AbortSignal.timeout(12000)
    }
  );

  if (response.status === 404 && options.method !== 'PUT')
    return null;

  const data = await response.json().catch(() => ({}));

  if (!response.ok)
    throw Error(`GitHub API ${response.status}: ${data.message}`);

  return data;
}

async function loadCompanies() {
  const branch = encodeURIComponent(
    process.env.GITHUB_BRANCH || 'main'
  );

  const file = await github(
    `contents/${FILE}?ref=${branch}`
  );

  if (!file) return { companies: [], sha: null };

  const decoded = Buffer.from(
    (file.content || '').replace(/\s/g, ''),
    'base64'
  ).toString('utf8');

  const parsed = JSON.parse(decoded);

  return {
    companies: Array.isArray(parsed)
      ? parsed
      : (parsed.companies || []),
    sha: file.sha
  };
}

async function saveCompanies(companies, sha) {
  const content = Buffer.from(
    JSON.stringify(companies, null, 2) + '\n'
  ).toString('base64');

  const body = {
    message: 'Update monitored careers companies',
    branch: process.env.GITHUB_BRANCH || 'main',
    content
  };

  if (sha) body.sha = sha;

  return github(`contents/${FILE}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { companies } = await loadCompanies();
      return respond(res, 200, { companies });
    }

    if (!['POST', 'DELETE'].includes(req.method))
      return respond(res, 405, {
        error: 'Method not allowed'
      });

    if (!authorized(req))
      return respond(res, 401, {
        error: 'Invalid admin token'
      });

    const body = typeof req.body === 'string'
      ? JSON.parse(req.body)
      : (req.body || {});

    const url = validateUrl(body.url);

    const { companies, sha } = await loadCompanies();

    const normalized = url.replace(/\/$/, '').toLowerCase();

    const index = companies.findIndex(
      item => item.url.replace(/\/$/, '').toLowerCase() === normalized
    );

    if (req.method === 'DELETE') {
      if (index < 0)
        return respond(res, 404, {
          error: 'Company not found'
        });

      companies.splice(index, 1);
      await saveCompanies(companies, sha);

      return respond(res, 200, {
        ok: true,
        companies
      });
    }

    if (index >= 0)
      return respond(res, 409, {
        error: 'Company already registered'
      });

    if (companies.length >= MAX_COMPANIES)
      return respond(res, 400, {
        error: 'Company limit reached'
      });

    const name = String(
      body.name || new URL(url).hostname
    ).trim().slice(0, 100);

    if (!name)
      return respond(res, 400, {
        error: 'Company name required'
      });

    const company = {
      name,
      url,
      added_at: new Date().toISOString()
    };

    companies.push(company);

    await saveCompanies(companies, sha);

    return respond(res, 201, {
      ok: true,
      company,
      companies
    });

  } catch (error) {
    const message = String(error.message || error);

    const isValidation = /url|https|private|local|name|JSON/i.test(message);

    return respond(res, isValidation ? 400 : 500, {
      error: message
    });
  }
};
