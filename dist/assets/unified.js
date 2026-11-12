
/* Unified Job Hunter dashboard */
(() => {
  'use strict';

  const state = {
    companies: [],
    statuses: [],
    data: {},
    version: null,
    baseMonitored: null,
    baseListed: null,
    view: location.hash.slice(1) || 'overview'
  };

  const $ = (s, root = document) => root.querySelector(s);
  const norm = v => String(v || '').trim().toLowerCase();

  const el = (tag, text, cls) => {
    const x = document.createElement(tag);
    if (text != null) x.textContent = String(text);
    if (cls) x.className = cls;
    return x;
  };

  const add = (parent, child) =>
    (parent.appendChild(child), child);

  const status = c =>
    state.statuses.find(s => s.url === c.url);

  const labels = {
    monitoring: 'Monitoring',
    needs_adapter: 'Needs adapter',
    access_blocked: 'Access blocked',
    error: 'Scan error',
    pending: 'Awaiting scan'
  };

  async function request(method, body, token) {
    const r = await fetch('/api/companies', {
      method,
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': token || ''
      },
      body: method === 'GET'
        ? undefined
        : JSON.stringify(body)
    });

    const result = await r.json().catch(() => ({}));
    if (!r.ok)
      throw Error(result.error || `HTTP ${r.status}`);

    return result;
  }

  async function json(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw Error(`HTTP ${r.status}`);
    return r.json();
  }

  function builtIn() {
    const result = new Map();

    for (const field of ['companies', 'sources']) {
      const value = state.data[field];

      const list = Array.isArray(value)
        ? value
        : (value && typeof value === 'object'
            ? Object.values(value) : []);

      for (const c of list) {
        const name = typeof c === 'string'
          ? c
          : (c?.company || c?.name ||
             c?.company_name || '');

        if (name && !result.has(norm(name))) {
          result.set(norm(name), {
            name,
            url: typeof c === 'object'
              ? (c.url || c.careers_url || '')
              : '',
            status: typeof c === 'object'
              ? (c.status || 'Configured')
              : 'Configured'
          });
        }
      }
    }

    return result;
  }

  function link(url, label) {
    const a = el('a', label);

    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:')
        throw Error('Not HTTPS');

      a.href = parsed.href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    } catch {
      a.textContent = '';
    }

    return a;
  }

  function row(parent, name, detail, label, url, onRemove) {
    const r = add(parent, el('div', null, 'jh-row'));
    const info = add(r, el('div', null, 'jh-name'));

    add(info, el('strong', name));
    add(info, el('small', detail));

    const pill = add(r, el('span', label, 'jh-pill'));
    pill.dataset.status =
      norm(label).replaceAll(' ', '_');

    if (url)
      add(r, link(url, 'Careers'));

    if (onRemove) {
      const btn = add(r, el('button', 'Remove', 'jh-remove'));
      btn.type = 'button';
      btn.onclick = onRemove;
    }
  }

  function renderCompanies() {
    const main = $('#main-content');

    if (!main || state.view !== 'companies')
      return;

    main.replaceChildren();

    const wrap = add(
      main, el('section', null, 'jh-unified')
    );
    wrap.id = 'jh-unified';

    const top = add(wrap, el('div', null, 'jh-top'));

    add(top, el('h1', 'Companies'));

    const btn = add(
      top, el('button', '+ Add company', 'jh-primary')
    );

    btn.onclick = () =>
      $('#source-dialog')?.showModal();

    add(wrap, el(
      'p',
      'All companies in one place. Monitoring means the latest scan succeeded. Saving a URL alone does not guarantee extraction.',
      'jh-help'
    ));

    const entries = add(
      wrap, el('div', null, 'jh-entries')
    );

    const native = builtIn();

    const managed = new Set(
      state.companies.map(c => norm(c.name))
    );

    for (const [key, c] of native) {
      if (!managed.has(key)) {
        row(
          entries, c.name, 'Built-in company',
          c.status, c.url
        );
      }
    }

    const controls = add(
      wrap, el('div', null, 'jh-controls')
    );

    add(controls, el(
      'label',
      'Admin token (only needed to remove a company): '
    ));

    const token = add(controls, el('input'));
    token.type = 'password';
    token.autocomplete = 'off';
    token.placeholder = 'Private admin password';

    const feedback = add(
      controls, el('span', '', 'jh-help')
    );

    for (const c of state.companies) {
      const result = status(c);
      const label = result?.status || 'pending';

      row(
        entries,
        c.name,
        result
          ? `${result.message || ''} · ${result.matched_jobs || 0} matched jobs`
          : 'Waiting for first scan',
        labels[label] || label,
        c.url,
        async () => {
          if (!token.value) {
            feedback.textContent = 'Enter admin token first.';
            return;
          }

          if (!confirm(
            `Remove ${c.name} from monitoring?`
          )) return;

          try {
            await request(
              'DELETE',
              { url: c.url },
              token.value
            );

            token.value = '';
            await refresh();
            renderCompanies();
          } catch (e) {
            feedback.textContent = e.message;
          }
        }
      );
    }

    if (!entries.children.length)
      add(entries, el('p', 'No companies registered.'));

    if ($('#breadcrumb'))
      $('#breadcrumb').textContent = 'Companies';

    document.querySelectorAll(
      'nav button[data-view]'
    ).forEach(b =>
      b.classList.toggle(
        'active', b.dataset.view === 'companies'
      )
    );
  }

  function leaf(root, text) {
    return [...root.querySelectorAll('*')].find(
      e => e.children.length === 0 &&
           norm(e.textContent) === norm(text)
    );
  }

  function updateOverview() {
    if (state.view !== 'overview') return;

    const main = $('#main-content');
    if (!main) return;

    const label = leaf(main, 'Monitored companies');
    const parent = label?.parentElement;

    const number = parent &&
      [...parent.querySelectorAll('*')].find(
        e => !e.children.length &&
             /^\d+$/.test(e.textContent.trim())
      );

    if (!number) return;

    if (state.baseMonitored === null)
      state.baseMonitored = +number.textContent;

    const native = builtIn();

    const extra = state.companies.filter(
      c => !native.has(norm(c.name)) &&
           status(c)?.status === 'monitoring'
    ).length;

    const expected = String(
      state.baseMonitored + extra
    );

    if (number.textContent.trim() !== expected)
      number.textContent = expected;

    const listed = [...main.querySelectorAll('*')].find(
      e => !e.children.length &&
           /^\d+ listed companies$/i.test(
             e.textContent.trim()
           )
    );

    if (listed) {
      if (state.baseListed === null)
        state.baseListed =
          +listed.textContent.split(' ')[0];

      const count = state.companies.filter(
        c => !native.has(norm(c.name))
      ).length;

      const wanted =
        `${state.baseListed + count} listed companies`;

      if (listed.textContent.trim() !== wanted)
        listed.textContent = wanted;
    }
  }

  async function refresh() {
    const results = await Promise.allSettled([
      request('GET'),
      json('/custom-status.json'),
      json('/data.json')
    ]);

    if (results[0].status === 'fulfilled')
      state.companies =
        results[0].value.companies || [];

    if (results[1].status === 'fulfilled')
      state.statuses =
        results[1].value.companies || [];

    if (results[2].status === 'fulfilled') {
      const data = results[2].value;

      if (
        state.version &&
        data.generated_at &&
        state.version !== data.generated_at &&
        !document.querySelector('dialog[open]')
      ) {
        location.reload();
        return;
      }

      state.version =
        data.generated_at || state.version;

      state.data = data;
    }

    if (state.view === 'companies')
      renderCompanies();
    else
      updateOverview();
  }

  function showCompanies() {
    state.view = 'companies';
    history.replaceState(null, '', '#companies');
    renderCompanies();
  }

  function boot() {
    const form = $('#source-form');

    if (form &&
        !form.elements.namedItem('admin_token')) {
      const label = el('label', 'Admin token');
      const input = add(label, el('input'));

      input.name = 'admin_token';
      input.type = 'password';
      input.required = true;
      input.autocomplete = 'off';

      form.insertBefore(
        label,
        form.querySelector('[type="submit"]')
      );
    }

    document.querySelectorAll(
      'a[href="/manage-companies.html"]'
    ).forEach(a => a.remove());

    const style = add(document.head, el('style'));

    style.textContent = `
      .jh-unified {
        max-width: 1100px;
        margin: auto;
        color: #222842;
      }
      .jh-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
      }
      .jh-top h1 { font-size: 27px; }
      .jh-primary {
        background: #6155e8;
        color: white;
        border: 0;
        border-radius: 8px;
        padding: 12px;
        cursor: pointer;
      }
      .jh-help {
        color: #737d92;
        font-size: 13px;
      }
      .jh-entries {
        border: 1px solid #e3e6ef;
        border-radius: 12px;
        background: white;
        overflow: hidden;
      }
      .jh-row {
        padding: 16px;
        display: flex;
        align-items: center;
        gap: 16px;
        flex-wrap: wrap;
        border-bottom: 1px solid #e7eaf2;
      }
      .jh-name {
        flex: 1;
        min-width: 180px;
        display: grid;
        gap: 5px;
      }
      .jh-name small { color: #777f90; }
      .jh-pill {
        font-size: 12px;
        background: #efeff9;
        border-radius: 99px;
        padding: 6px 9px;
      }
      .jh-pill[data-status="monitoring"] {
        background: #e5f6ee;
        color: #226542;
      }
      .jh-pill[data-status="needs_adapter"],
      .jh-pill[data-status="access_blocked"] {
        background: #fff1d9;
        color: #855614;
      }
      .jh-remove {
        border: 0;
        border-radius: 8px;
        background: #fce9eb;
        color: #9a2738;
        padding: 8px;
        cursor: pointer;
      }
      .jh-controls {
        padding: 20px 0;
        display: flex;
        gap: 10px;
        align-items: center;
        flex-wrap: wrap;
      }
      .jh-controls input {
        padding: 10px;
        border: 1px solid #cdd2dd;
        border-radius: 6px;
      }
    `;

    const main = $('#main-content');

    if (main) {
      new MutationObserver(() => {
        if (
          state.view === 'companies' &&
          !$('#jh-unified')
        ) {
          renderCompanies();
        } else {
          updateOverview();
        }
      }).observe(main, {
        childList: true,
        subtree: true
      });
    }

    if (state.view === 'companies')
      renderCompanies();

    refresh();
    setInterval(refresh, 60000);
  }

  // Handle adding companies using the original dialog
  document.addEventListener('submit', async e => {
    if (e.target?.id !== 'source-form') return;

    e.preventDefault();
    e.stopImmediatePropagation();

    const form = e.target;

    const name = form.elements
      .namedItem('name')?.value.trim();

    const url = form.elements
      .namedItem('url')?.value.trim();

    const token = form.elements
      .namedItem('admin_token')?.value;

    const button = form.querySelector(
      'button[type="submit"]'
    );

    if (button?.disabled) return;
    if (button) button.disabled = true;

    try {
      await request(
        'POST',
        { name, url },
        token
      );

      form.reset();
      $('#source-dialog')?.close();

      await refresh();
      showCompanies();
    } catch (err) {
      let feedback = $('#jh-feedback');

      if (!feedback) {
        feedback = add(
          form, el('p', '', 'jh-help')
        );
        feedback.id = 'jh-feedback';
      }

      feedback.textContent = err.message;
      feedback.style.color = '#b42336';
    } finally {
      if (button) button.disabled = false;
    }
  }, true);

  // Use the original navigation, but unify Companies
  document.addEventListener('click', e => {
    const b = e.target.closest?.(
      'nav button[data-view]'
    );

    if (!b) return;

    state.view = b.dataset.view;

    if (state.view === 'companies') {
      e.preventDefault();
      e.stopImmediatePropagation();
      showCompanies();
    } else {
      history.replaceState(
        null, '', '#' + state.view
      );
    }
  }, true);

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', boot);
  else
    boot();
})();
