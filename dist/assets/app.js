'use strict';

const $ = selector => document.querySelector(selector);
const REPO = 'https://github.com/itz-youssef/Job-Hunter';
const WORKFLOW = `${REPO}/actions/workflows/monitor.yml`;

const esc = value => String(value ?? '').replace(
  /[&<>"']/g,
  character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]
);

function readLocal(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

let saved = readLocal('jobhunter-saved-v2', []);
let requests = readLocal('jobhunter-company-requests-v2', []);
if (!Array.isArray(saved)) saved = [];
if (!Array.isArray(requests)) requests = [];

let state = null;
let view = 'overview';
let search = '';
let filter = 'matches';
let loading = false;

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').style.display = 'block';
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => {
    $('#toast').style.display = 'none';
  }, 6000);
}

function persist(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    toast('Browser storage unavailable. Changes may not survive a refresh.');
  }
}

function date(value) {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? String(value)
    : parsed.toLocaleString();
}

function safeURL(value) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password
    ) return '#';
    return esc(url.href);
  } catch {
    return '#';
  }
}

function logo(name) {
  return `<span class="logo other">${esc(
    String(name || '?').charAt(0).toUpperCase()
  )}</span>`;
}

function heading(title, subtitle, add = false) {
  return `
    <div class="page-heading">
      <div>
        <h1>${esc(title)}</h1>
        <p class="subtitle">${esc(subtitle)}</p>
      </div>
      ${add ? `
        <button class="primary" data-action="add">
          ＋ Add company link
        </button>
      ` : ''}
    </div>
  `;
}

function matches() {
  return state.jobs.filter(
    job => Number(job.score) >= Number(state.settings.min_score ?? 3)
  );
}

function jobKey(job) {
  return `${job.source_id}:${job.id}`;
}

function jobcards(list) {
  if (!list.length) {
    return `
      <div class="empty">
        <h3>No jobs to display.</h3>
        <p>Try another filter or check back after the next published scan.</p>
      </div>
    `;
  }

  return list.map(job => {
    let reasons = [];
    try {
      reasons = JSON.parse(job.reasons || '[]');
      if (!Array.isArray(reasons)) reasons = [];
    } catch {
      reasons = [];
    }

    const key = jobKey(job);
    const isSaved = saved.includes(key);

    return `
      <article class="jobcard">
        <div class="jobtop">
          ${logo(job.company)}
          <div>
            <h3>${esc(job.title)}</h3>
            <div class="jobmeta">
              ${esc(job.company)} · ${esc(job.location || 'Not provided')}
            </div>
          </div>
          <button
            data-save="${esc(key)}"
            aria-label="${isSaved ? 'Unsave' : 'Save'} job"
          >${isSaved ? '♥' : '♡'}</button>
        </div>

        <div class="jobtags">
          <span>${esc(job.employment || 'Employment type not provided')}</span>
          <span>Match score ${esc(job.score)}</span>
          <span>Published: ${esc(job.published || 'Not provided')}</span>
        </div>

        <details>
          <summary class="jobmeta">Description & match details</summary>
          <p class="jobdesc">${esc(reasons.join(' · '))}</p>
          <p class="jobdesc">${esc(job.description || 'Not provided')}</p>
        </details>

        <div class="jobfooter">
          <span>Detected ${esc(date(job.detected))}</span>
          <a href="${safeURL(job.url)}"
             target="_blank" rel="noopener noreferrer">
            View opportunity →
          </a>
        </div>
      </article>
    `;
  }).join('');
}

function overview() {
  const active = state.sources.filter(source => source.enabled).length;

  return heading(
    'Your next move starts here.',
    'Real results from your published monitoring history.',
    true
  ) + `
    <section class="hero">
      <div class="hero-text">
        <p class="eyebrow">YOUR JOB RADAR</p>
        <h2>The right role.<br>On your radar.</h2>
        <p>Engineering & AI opportunities, with Egypt in focus.</p>
        <button class="textbutton hero-link" data-view="jobs">
          Explore jobs →
        </button>
      </div>
      <div class="radar" aria-hidden="true"></div>
    </section>

    <div class="stats">
      <div class="stat">
        <div class="stat-top">Matching opportunities</div>
        <div class="stat-value">${matches().length}</div>
        <div class="stat-foot">Based on monitoring preferences</div>
      </div>
      <div class="stat">
        <div class="stat-top">Monitored companies</div>
        <div class="stat-value">${active}</div>
        <div class="stat-foot">${state.sources.length} listed companies</div>
      </div>
      <div class="stat">
        <div class="stat-top">Discovered jobs</div>
        <div class="stat-value">${state.jobs.length}</div>
        <div class="stat-foot">Includes historical listings</div>
      </div>
      <div class="stat">
        <div class="stat-top">Saved on this device</div>
        <div class="stat-value">
          ${state.jobs.filter(job => saved.includes(jobKey(job))).length}
        </div>
        <div class="stat-foot">Your personal shortlist</div>
      </div>
    </div>

    <section class="panel">
      <div class="panel-head">
        <div>
          <h3>Matching opportunities</h3>
          <p>Data published: ${esc(date(state.generated_at))}</p>
        </div>
        <button class="textbutton" data-view="jobs">View all →</button>
      </div>
      ${jobcards(matches().slice(0, 6))}
      <div class="microbar">
        <span>Historical results do not guarantee a vacancy is still open.</span>
        <button class="textbutton" data-action="refresh">
          Refresh displayed data ↻
        </button>
      </div>
    </section>
  `;
}

function filteredJobs() {
  return state.jobs.filter(job => {
    if (view === 'saved' && !saved.includes(jobKey(job))) return false;
    if (
      filter === 'matches' &&
      Number(job.score) < Number(state.settings.min_score ?? 3)
    ) return false;
    if (
      filter === 'early' &&
      !/intern|junior|graduate|trainee|entry.level|work experience/i.test(
        `${job.title} ${job.description}`
      )
    ) return false;

    return `${job.title} ${job.company} ${job.location} ${job.description}`
      .toLowerCase()
      .includes(search.toLowerCase());
  });
}

function jobs() {
  return heading(
    view === 'saved' ? 'Your saved opportunities.' : 'Your job feed.',
    'Search titles, companies, locations and descriptions.'
  ) + `
    <section class="panel">
      <div class="searchrow">
        <input id="job-search" aria-label="Search jobs"
               placeholder="Search roles or skills…" value="${esc(search)}">
        <select id="job-filter" aria-label="Filter jobs">
          <option value="matches" ${filter === 'matches' ? 'selected' : ''}>
            Matching preferences
          </option>
          <option value="all" ${filter === 'all' ? 'selected' : ''}>
            All discovered jobs
          </option>
          <option value="early" ${filter === 'early' ? 'selected' : ''}>
            Early careers
          </option>
        </select>
      </div>
      <div id="job-results">${jobcards(filteredJobs())}</div>
    </section>
  `;
}

function companies() {
  return heading(
    'Companies on your radar.',
    'Monitoring status comes from the published scan.',
    true
  ) + `
    <section class="panel">
      <div class="tablewrap">
        <table>
          <thead>
            <tr>
              <th>COMPANY</th>
              <th>STATUS</th>
              <th>LAST CHECK</th>
              <th>CAREERS</th>
            </tr>
          </thead>
          <tbody>
            ${state.sources.map(source => `
              <tr>
                <td><strong>${esc(source.name)}</strong></td>
                <td>
                  <span class="status-pill ${
                    source.enabled && source.status === 'Healthy'
                      ? 'good' : 'warn'
                  }">
                    ${esc(source.enabled
                      ? source.status || 'Awaiting scan'
                      : 'Not monitored')}
                  </span>
                </td>
                <td>${esc(date(source.last_check))}</td>
                <td>
                  <a href="${safeURL(source.url)}"
                     target="_blank" rel="noopener noreferrer">Open →</a>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </section>

    <section class="panel" style="margin-top:24px">
      <div class="panel-head"><h3>Links saved for future setup</h3></div>
      <div class="hint">
        These links are stored only in this browser.
        They are not monitored until a compatible source is configured.
      </div>
      ${requests.length ? requests.map((item, index) => `
        <div class="activity">
          <strong>${esc(item.name)}</strong>
          <span class="status-pill">Not monitored</span>
          <p>
            <a href="${safeURL(item.url)}"
               target="_blank" rel="noopener noreferrer">Careers website →</a>
          </p>
          <button class="textbutton" data-remove="${index}">Remove</button>
        </div>
      `).join('') : `
        <div class="activity">No additional links saved yet.</div>
      `}
    </section>
  `;
}

function alerts() {
  return heading(
    'Email & monitoring preferences.',
    'Notifications run independently of this website.'
  ) + `
    <div class="forms">
      <section class="panel form-panel">
        <h3>Email alerts</h3>
        <p>
          The monitoring workflow sends pending alerts for newly discovered
          matching jobs. Existing jobs from the initial baseline do not
          generate alerts.
        </p>
        <p>
          Email credentials and the recipient are managed in GitHub Secrets.
          They are not included in this public website.
        </p>
        <p>
          Check the workflow logs for delivery results. This page does not
          verify email delivery.
        </p>
        <a class="secondary" href="${WORKFLOW}"
           target="_blank" rel="noopener noreferrer">
          Open monitoring runs →
        </a>
      </section>

      <section class="panel form-panel">
        <h3>Current matching preferences</h3>
        <p><strong>Keywords</strong><br>
          ${esc(state.settings.keywords || 'Not specified')}
        </p>
        <p><strong>Locations</strong><br>
          ${esc(state.settings.locations || 'Not specified')}
        </p>
        <p><strong>Minimum score</strong><br>
          ${esc(state.settings.min_score)}
        </p>
        <div class="hint">
          These preferences are read-only here.
          Editing monitoring configuration requires an authenticated
          configuration workflow, which is not connected to this page yet.
        </div>
      </section>
    </div>
  `;
}

function deploy() {
  return heading(
    'How your website works.',
    'A public dashboard backed by your monitoring workflow.'
  ) + `
    <section class="panel form-panel">
      <h3>Website</h3>
      <p>
        Displays the latest published job snapshot. Refreshing this page
        reloads that snapshot; it does not scan company websites.
      </p>
      <h3>Monitoring</h3>
      <p>
        GitHub Actions runs the Python monitoring engine, saves job history
        and processes email alerts. Check the workflow for its schedule
        and execution results.
      </p>
      <h3>Data freshness</h3>
      <p>Last export: ${esc(date(state.generated_at))}</p>
      <p>
        A successful export does not mean every company scan succeeded.
        Check each company's last check and status.
      </p>
      <a class="secondary" href="${WORKFLOW}"
         target="_blank" rel="noopener noreferrer">
        Open GitHub Actions →
      </a>
    </section>
  `;
}

function render() {
  if (!state) return;

  document.querySelectorAll('nav button').forEach(button => {
    button.classList.toggle('active', button.dataset.view === view);
  });

  $('#breadcrumb').textContent = {
    overview: 'Overview',
    jobs: 'Job feed',
    saved: 'Saved jobs',
    companies: 'Companies',
    alerts: 'Email & preferences',
    deploy: 'How it works'
  }[view];

  $('#feed-count').textContent = matches().length;
  $('#main-content').innerHTML = {
    overview,
    jobs,
    saved: jobs,
    companies,
    alerts,
    deploy
  }[view]();
}

async function load() {
  if (loading) return;
  loading = true;

  try {
    const response = await fetch(
      new URL('data.json', document.baseURI),
      { cache: 'no-store' }
    );
    if (!response.ok) throw new Error('Data is not published yet.');

    const data = await response.json();
    if (
      data.mode !== 'snapshot' ||
      !Array.isArray(data.jobs) ||
      !Array.isArray(data.sources) ||
      !data.settings
    ) throw new Error('Invalid published data.');

    state = data;
    $('#preview-banner').hidden = true;
    render();
  } catch {
    if (state) {
      toast('Refresh failed. Showing the last loaded snapshot.');
    } else {
      $('#main-content').innerHTML = `
        <section class="panel form-panel">
          <h1>Waiting for the first data publication.</h1>
          <p>
            The website needs data.json from the monitoring workflow.
            No demo jobs are displayed.
          </p>
          <button class="primary" data-action="refresh">Try again</button>
          <p><a href="${WORKFLOW}" target="_blank"
                rel="noopener noreferrer">Open workflow →</a></p>
        </section>
      `;
    }
  } finally {
    loading = false;
  }
}

document.addEventListener('click', event => {
  const element = event.target.closest('button,[data-view]');
  if (!element) return;

  if (element.dataset.view && state) {
    view = element.dataset.view;
    if (view === 'saved') filter = 'all';
    render();
    window.scrollTo(0, 0);
  }

  if (element.dataset.action === 'refresh') load();

  if (element.dataset.action === 'add') {
    $('#source-dialog').showModal();
  }

  if (element.id === 'close-dialog') {
    $('#source-dialog').close();
  }

  if (element.dataset.save) {
    const key = element.dataset.save;
    saved = saved.includes(key)
      ? saved.filter(item => item !== key)
      : [...saved, key];

    persist('jobhunter-saved-v2', saved);
    render();
  }

  if (element.hasAttribute('data-remove')) {
    requests.splice(Number(element.dataset.remove), 1);
    persist('jobhunter-company-requests-v2', requests);
    render();
  }
});

document.addEventListener('input', event => {
  if (event.target.id === 'job-search' && state) {
    search = event.target.value;
    $('#job-results').innerHTML = jobcards(filteredJobs());
  }
});

document.addEventListener('change', event => {
  if (event.target.id === 'job-filter' && state) {
    filter = event.target.value;
    $('#job-results').innerHTML = jobcards(filteredJobs());
  }
});

document.addEventListener('submit', event => {
  if (event.target.id !== 'source-form') return;
  event.preventDefault();

  try {
    const form = new FormData(event.target);
    const name = String(form.get('name') || '').trim();
    const url = new URL(String(form.get('url') || '').trim());

    if (!name) throw new Error('Enter a company name.');
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password
    ) throw new Error('Enter a public HTTPS careers link.');

    if (
      requests.some(item => item.url === url.href) ||
      state?.sources.some(item => item.url === url.href)
    ) throw new Error('This link is already listed.');

    requests.push({ name, url: url.href });
    persist('jobhunter-company-requests-v2', requests);

    $('#source-dialog').close();
    event.target.reset();
    view = 'companies';
    render();
    toast('Link saved on this device. Monitoring has not been enabled.');
  } catch (error) {
    toast(error.message);
  }
});

// Update the existing dialog so it accurately describes this version.
$('#source-dialog h2').textContent = 'Save a company link';
$('#source-form > p').textContent =
  'Save an official careers link for future monitoring setup.';
$('#source-form .hint').textContent =
  'Stored only in this browser. Adding a link does not start monitoring.';
$('#source-form button[type="submit"]').textContent = 'Save link →';
$('.deploy-nav').textContent = '→ How it works';
$('#preview-banner').hidden = true;

load();

setInterval(() => {
  if (
    !document.hidden &&
    !$('#source-dialog').open &&
    !document.querySelector('input:focus,textarea:focus,select:focus')
  ) load();
}, 60000);
