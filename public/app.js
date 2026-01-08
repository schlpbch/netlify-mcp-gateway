const statusEl = document.getElementById('net-status');
const formattedEl = document.getElementById('response-formatted');
const rawEl = document.getElementById('response-raw');
const toggleRawBtn = document.getElementById('toggle-raw');

let _currentResponse = null;
let showRaw = false;

function setStatus(text, isLoading = false) {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.classList.toggle('text-accent', isLoading);
  statusEl.classList.toggle('text-slate-500', !isLoading);
}

function toggleRawView() {
  showRaw = !showRaw;
  if (formattedEl && rawEl && toggleRawBtn) {
    formattedEl.classList.toggle('hidden', showRaw);
    rawEl.classList.toggle('hidden', !showRaw);
    toggleRawBtn.textContent = showRaw ? 'Formatted' : 'Raw';
  }
}

function showRawJson(obj) {
  if (!rawEl) return;
  rawEl.textContent =
    typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
}

function getStatusColor(status) {
  switch (status?.toUpperCase()) {
    case 'HEALTHY':
    case 'UP':
      return 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30';
    case 'DEGRADED':
      return 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30';
    case 'DOWN':
    case 'ERROR':
      return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30';
    default:
      return 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800';
  }
}

function getStatusIcon(status) {
  switch (status?.toUpperCase()) {
    case 'HEALTHY':
    case 'UP':
      return '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>';
    case 'DEGRADED':
      return '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>';
    case 'DOWN':
    case 'ERROR':
      return '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>';
    default:
      return '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
  }
}

function renderHealth(data) {
  const body = data.body || data;
  const servers = body.servers || [];
  const overallStatus = body.status || 'UNKNOWN';
  const timestamp = body.timestamp
    ? new Date(body.timestamp).toLocaleString()
    : '';

  let html = `
    <div class="space-y-4">
      <!-- Overall Status -->
      <div class="flex items-center justify-between p-3 rounded-lg ${getStatusColor(
        overallStatus
      )}">
        <div class="flex items-center gap-2">
          ${getStatusIcon(overallStatus)}
          <span class="font-semibold">Gateway Status: ${overallStatus}</span>
        </div>
        <span class="text-xs opacity-75">${timestamp}</span>
      </div>

      <!-- Server List -->
      <div class="space-y-2">
        <h4 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Backend Servers</h4>
        <div class="grid gap-2">
  `;

  servers.forEach((server) => {
    const statusColor = getStatusColor(server.status);
    html += `
      <div class="p-3 rounded-lg bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
        <div class="flex items-center justify-between mb-1">
          <div class="flex items-center gap-2">
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${statusColor}">
              ${getStatusIcon(server.status)}
              ${server.status}
            </span>
            <span class="font-medium text-slate-900 dark:text-white">${
              server.name
            }</span>
          </div>
          <span class="text-xs text-slate-500">${server.latency}ms</span>
        </div>
        <p class="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">${
          server.endpoint
        }</p>
        ${
          server.errorMessage
            ? `<p class="text-xs text-red-500 dark:text-red-400 mt-1">${server.errorMessage}</p>`
            : ''
        }
      </div>
    `;
  });

  html += `
        </div>
      </div>
    </div>
  `;

  return html;
}

function renderTools(data) {
  const body = data.body || data;
  const tools = body.tools || [];

  if (tools.length === 0) {
    return '<p class="text-slate-500 dark:text-slate-400">No tools available</p>';
  }

  // Group tools by namespace
  const grouped = {};
  tools.forEach((tool) => {
    const [namespace] = tool.name.split('.');
    if (!grouped[namespace]) grouped[namespace] = [];
    grouped[namespace].push(tool);
  });

  let html = `
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium text-slate-600 dark:text-slate-400">${tools.length} tools available</span>
      </div>
  `;

  Object.entries(grouped).forEach(([namespace, nsTools]) => {
    html += `
      <div class="space-y-2">
        <h4 class="text-xs font-semibold text-accent uppercase tracking-wide flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-accent"></span>
          ${namespace} (${nsTools.length})
        </h4>
        <div class="grid gap-2">
    `;

    nsTools.forEach((tool) => {
      const shortName = tool.name.split('.').slice(1).join('.');
      const summary = tool.summary || tool.description?.split('\n')[0] || '';
      html += `
        <div class="p-3 rounded-lg bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 hover:border-accent/50 transition-colors cursor-pointer tool-card" data-tool='${JSON.stringify(
          tool
        )}'>
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              <h5 class="font-medium text-slate-900 dark:text-white text-sm">${shortName}</h5>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">${summary.substring(
                0,
                150
              )}${summary.length > 150 ? '...' : ''}</p>
            </div>
            <svg class="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
          </div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;
  });

  html += '</div>';
  return html;
}

function renderResources(data) {
  const body = data.body || data;
  const resources = body.resources || [];

  if (resources.length === 0) {
    return '<p class="text-slate-500 dark:text-slate-400">No resources available</p>';
  }

  let html = `
    <div class="space-y-3">
      <span class="text-sm font-medium text-slate-600 dark:text-slate-400">${resources.length} resources available</span>
      <div class="grid gap-2">
  `;

  resources.forEach((resource) => {
    html += `
      <div class="p-3 rounded-lg bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
        <h5 class="font-medium text-slate-900 dark:text-white text-sm">${
          resource.name || resource.uri
        }</h5>
        ${
          resource.description
            ? `<p class="text-xs text-slate-500 dark:text-slate-400 mt-1">${resource.description}</p>`
            : ''
        }
        ${
          resource.uri
            ? `<p class="text-xs text-accent font-mono mt-1">${resource.uri}</p>`
            : ''
        }
      </div>
    `;
  });

  html += '</div></div>';
  return html;
}

function renderPrompts(data) {
  const body = data.body || data;
  const prompts = body.prompts || [];

  if (prompts.length === 0) {
    return '<p class="text-slate-500 dark:text-slate-400">No prompts available</p>';
  }

  // Group prompts by namespace
  const grouped = {};
  prompts.forEach((prompt) => {
    const [namespace] = prompt.name.split('.');
    if (!grouped[namespace]) grouped[namespace] = [];
    grouped[namespace].push(prompt);
  });

  let html = `
    <div class="space-y-4">
      <span class="text-sm font-medium text-slate-600 dark:text-slate-400">${prompts.length} prompts available</span>
  `;

  Object.entries(grouped).forEach(([namespace, nsPrompts]) => {
    html += `
      <div class="space-y-2">
        <h4 class="text-xs font-semibold text-accent uppercase tracking-wide flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-accent"></span>
          ${namespace} (${nsPrompts.length})
        </h4>
        <div class="grid gap-2">
    `;

    nsPrompts.forEach((prompt) => {
      const shortName = prompt.name.split('.').slice(1).join('.');
      html += `
        <div class="p-3 rounded-lg bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
          <h5 class="font-medium text-slate-900 dark:text-white text-sm">${shortName}</h5>
          ${
            prompt.description
              ? `<p class="text-xs text-slate-500 dark:text-slate-400 mt-1">${prompt.description.substring(
                  0,
                  150
                )}${prompt.description.length > 150 ? '...' : ''}</p>`
              : ''
          }
        </div>
      `;
    });

    html += '</div></div>';
  });

  html += '</div>';
  return html;
}

function renderError(data) {
  const error = data.error || data.body?.error || 'Unknown error';
  return `
    <div class="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
      <div class="flex items-center gap-2 text-red-600 dark:text-red-400">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <span class="font-medium">Error</span>
      </div>
      <p class="mt-2 text-sm text-red-600 dark:text-red-400">${error}</p>
    </div>
  `;
}

function renderMetrics(data) {
  const body = data.body || data;
  const requests = body.requests || {};
  const latency = body.latency || {};
  const cache = body.cache || {};
  const endpointsObj = body.endpoints || {};

  // Convert endpoints object to array: { "GET:/path": {...} } -> [{ key: "GET:/path", ... }]
  const endpoints = Object.entries(endpointsObj).map(([key, value]) => ({
    key,
    ...value,
  }));

  // Values are already formatted strings from the API
  const errorRate = requests.errorRate || '0%';
  const cacheHitRate = cache.hitRate || '0%';

  const html = `
    <div class="space-y-4">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold text-slate-900 dark:text-white">Performance Metrics</h3>
        <span class="text-xs text-slate-500">Uptime: ${
          body.uptime || 'N/A'
        }</span>
      </div>

      <!-- Summary Cards -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <!-- Total Requests -->
        <div class="p-3 rounded-lg bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
          <div class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">Requests</div>
          <div class="mt-1 text-2xl font-bold text-slate-900 dark:text-white">${
            requests.total || 0
          }</div>
          <div class="text-xs ${
            requests.errors > 0 ? 'text-red-500' : 'text-green-500'
          }">${requests.errors || 0} errors (${errorRate})</div>
        </div>

        <!-- Cache Hit Rate -->
        <div class="p-3 rounded-lg bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
          <div class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">Cache Hit Rate</div>
          <div class="mt-1 text-2xl font-bold ${
            parseFloat(cacheHitRate) > 50
              ? 'text-green-600 dark:text-green-400'
              : 'text-yellow-600 dark:text-yellow-400'
          }">${cacheHitRate}</div>
          <div class="text-xs text-slate-500">${
            cache.memorySize || 0
          } bytes cached</div>
        </div>

        <!-- P50 Latency -->
        <div class="p-3 rounded-lg bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
          <div class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">P50 Latency</div>
          <div class="mt-1 text-2xl font-bold text-slate-900 dark:text-white">${
            latency.p50 || '0ms'
          }</div>
          <div class="text-xs text-slate-500">avg: ${latency.avg || '0ms'}</div>
        </div>

        <!-- P95/P99 Latency -->
        <div class="p-3 rounded-lg bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
          <div class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">P95 / P99</div>
          <div class="mt-1 text-2xl font-bold text-slate-900 dark:text-white">${
            latency.p95 || '0ms'
          }</div>
          <div class="text-xs text-slate-500">p99: ${latency.p99 || '0ms'}</div>
        </div>
      </div>

      <!-- Endpoint Breakdown -->
      ${
        endpoints.length > 0
          ? `
      <div class="space-y-2">
        <h4 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Endpoint Breakdown</h4>
        <div class="space-y-2 max-h-48 overflow-y-auto">
          ${endpoints
            .map(
              (ep) => `
              <div class="p-2 rounded-lg bg-white/30 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700">
                <div class="flex items-center justify-between">
                  <span class="text-xs font-mono text-slate-600 dark:text-slate-300">${
                    ep.key
                  }</span>
                  <span class="text-xs text-slate-500">${
                    ep.requests || 0
                  } req</span>
                </div>
                <div class="flex items-center gap-4 mt-1 text-xs text-slate-500">
                  <span>avg: ${ep.avgLatency || 0}ms</span>
                  <span>cache: ${ep.cacheHitRate || 0}%</span>
                  <span class="${
                    ep.errors > 0 ? 'text-red-500' : ''
                  }">errors: ${ep.errors || 0}</span>
                </div>
              </div>
            `
            )
            .join('')}
        </div>
      </div>
      `
          : ''
      }

      <!-- Timestamp -->
      <div class="text-xs text-slate-400 text-right">
        Last updated: ${
          body.timestamp ? new Date(body.timestamp).toLocaleString() : 'N/A'
        }
      </div>
    </div>
  `;

  return html;
}

function renderGeneric(data) {
  const body = data.body || data;
  return `
    <div class="p-3 rounded-lg bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
      <pre class="text-xs text-slate-700 dark:text-slate-300 font-mono whitespace-pre-wrap">${JSON.stringify(
        body,
        null,
        2
      )}</pre>
    </div>
  `;
}

function show(obj, endpoint = '') {
  currentResponse = obj;
  showRawJson(obj);

  if (!formattedEl) return;

  // Detect response type and render appropriately
  let html = '';

  if (obj.error) {
    html = renderError(obj);
  } else if (endpoint.includes('/health') || obj.body?.servers) {
    html = renderHealth(obj);
  } else if (endpoint.includes('/tools/list') || obj.body?.tools) {
    html = renderTools(obj);
  } else if (endpoint.includes('/resources/list') || obj.body?.resources) {
    html = renderResources(obj);
  } else if (endpoint.includes('/prompts/list') || obj.body?.prompts) {
    html = renderPrompts(obj);
  } else if (
    endpoint.includes('/metrics') ||
    obj.body?.requests ||
    obj.body?.latency
  ) {
    html = renderMetrics(obj);
  } else {
    html = renderGeneric(obj);
  }

  formattedEl.innerHTML = html;

  // Add click handlers for tool cards
  document.querySelectorAll('.tool-card').forEach((card) => {
    card.addEventListener('click', () => {
      const tool = JSON.parse(card.dataset.tool);
      const endpointInput = document.getElementById('post-endpoint');
      const bodyInput = document.getElementById('post-body');
      if (endpointInput && bodyInput) {
        endpointInput.value = '/mcp/tools/call';
        const args = {};
        if (tool.inputSchema?.properties) {
          Object.entries(tool.inputSchema.properties).forEach(
            ([key, schema]) => {
              if (schema.default !== undefined) {
                args[key] = schema.default;
              } else if (tool.inputSchema.required?.includes(key)) {
                args[key] =
                  schema.type === 'string'
                    ? ''
                    : schema.type === 'number'
                    ? 0
                    : null;
              }
            }
          );
        }
        bodyInput.value = JSON.stringify(
          { name: tool.name, arguments: args },
          null,
          2
        );
      }
    });
  });
}

async function callGet(path) {
  setStatus('Loading...', true);
  show({ status: 'loading' }, path);
  formattedEl.innerHTML =
    '<div class="flex items-center justify-center h-32"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div></div>';

  try {
    const res = await fetch(path, { cache: 'no-store' });
    const ct = res.headers.get('content-type') || '';
    let body = null;
    if (ct.includes('application/json')) {
      body = await res.json();
    } else {
      body = await res.text();
    }
    show({ status: res.status, body }, path);
  } catch (err) {
    show({ error: err.message }, path);
  }
  setStatus('Ready');
}

async function callPost(path, data) {
  setStatus('Loading...', true);
  formattedEl.innerHTML =
    '<div class="flex items-center justify-center h-32"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div></div>';

  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const ct = res.headers.get('content-type') || '';
    let body = null;
    if (ct.includes('application/json')) {
      body = await res.json();
    } else {
      body = await res.text();
    }
    show({ status: res.status, body }, path);
  } catch (err) {
    show({ error: err.message }, path);
  }
  setStatus('Ready');
}

async function copyToClipboard() {
  if (!rawEl || !rawEl.textContent) return;
  try {
    await navigator.clipboard.writeText(rawEl.textContent);
    const copyBtn = document.getElementById('copy-response');
    if (copyBtn) {
      const originalLabel = copyBtn.getAttribute('aria-label');
      copyBtn.setAttribute('aria-label', 'Copied!');
      copyBtn.classList.add('text-accent');
      setTimeout(() => {
        copyBtn.setAttribute('aria-label', originalLabel);
        copyBtn.classList.remove('text-accent');
      }, 2000);
    }
  } catch (err) {
    console.error('Failed to copy:', err);
  }
}

// Resources Reader functionality
let _resourcesList = [];

async function initResourcesDropdown() {
  const select = document.getElementById('resource-select');
  if (!select) return;

  try {
    const response = await fetch('/mcp/resources/list');
    const data = await response.json();
    _resourcesList = data.resources || [];

    // Populate dropdown
    select.innerHTML = '<option value="">Select a resource...</option>';
    _resourcesList.forEach((resource, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = resource.name;
      select.appendChild(option);
    });

    document.getElementById(
      'resource-status'
    ).textContent = `${_resourcesList.length} resource(s) available`;
  } catch (error) {
    document.getElementById('resource-status').textContent =
      'Failed to load resources';
    console.error('Error loading resources:', error);
  }
}

function showResourceDetails(resource) {
  if (!resource) {
    document.getElementById('resource-details').classList.add('hidden');
    return;
  }

  document.getElementById('resource-name').textContent = resource.name;
  document.getElementById('resource-description').textContent =
    resource.description || 'No description available';
  document.getElementById('resource-details').classList.remove('hidden');
}

async function readResource() {
  const select = document.getElementById('resource-select');
  const selectedIndex = select.value;

  if (!selectedIndex) return;

  const resource = _resourcesList[selectedIndex];
  if (!resource) return;

  const resultContainer = document.getElementById('resource-result-container');
  const resultEl = document.getElementById('resource-result');
  const statusEl = document.getElementById('resource-result-status');

  statusEl.textContent = 'Loading...';
  statusEl.classList.add('text-accent');

  try {
    // Debug: log the resource to see what we're sending
    console.log('Reading resource:', resource);
    console.log('Resource URI:', resource.uri);

    const response = await fetch('/mcp/resources/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uri: resource.uri }),
    });

    const data = await response.json();

    console.log('Response status:', response.status, 'Data:', data);

    if (response.ok) {
      // Handle different response formats
      let content = data.contents || data.content || data;
      resultEl.textContent =
        typeof content === 'string'
          ? content
          : JSON.stringify(content, null, 2);
      statusEl.textContent = 'Success';
      statusEl.classList.remove('text-accent');
    } else {
      // Show the error from the backend
      if (data.error) {
        resultEl.textContent = `Error: ${data.error}\n${
          data.message || ''
        }\n\nResource URI: ${resource.uri}`;
      } else {
        resultEl.textContent = JSON.stringify(data, null, 2);
      }
      statusEl.textContent = 'Error';
    }

    resultContainer.classList.remove('hidden');
  } catch (error) {
    resultEl.textContent = `Error: ${error.message}`;
    statusEl.textContent = 'Failed';
    resultContainer.classList.remove('hidden');
    console.error('Error reading resource:', error);
  }
}

// Theme management
function _getThemePreference() {
  const stored = localStorage.getItem('theme');
  if (stored) return stored;
  return globalThis.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function setTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  localStorage.setItem('theme', theme);
}

function toggleTheme() {
  const current = document.documentElement.classList.contains('dark')
    ? 'dark'
    : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  setTheme(next);
}

// Dashboard card rendering functions
function renderToolsCard(data) {
  const body = data.body || data;
  const tools = body.tools || [];

  if (tools.length === 0) {
    return '<p class="text-sm text-slate-500">No tools available</p>';
  }

  // Group by namespace and count
  const grouped = {};
  tools.forEach((tool) => {
    const [namespace] = tool.name.split('.');
    if (!grouped[namespace]) grouped[namespace] = 0;
    grouped[namespace]++;
  });

  const namespaces = Object.entries(grouped).slice(0, 3);

  return `
    <div class="text-3xl font-bold text-slate-900 dark:text-white mb-2">${
      tools.length
    }</div>
    <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">Available tools</p>
    <div class="space-y-1">
      ${namespaces
        .map(
          ([ns, count]) => `
        <div class="flex items-center justify-between text-xs">
          <span class="text-slate-600 dark:text-slate-400">${ns}</span>
          <span class="font-medium text-accent">${count}</span>
        </div>
      `
        )
        .join('')}
      ${
        Object.keys(grouped).length > 3
          ? `<p class="text-xs text-slate-400 mt-1">+${
              Object.keys(grouped).length - 3
            } more</p>`
          : ''
      }
    </div>
  `;
}

function renderPromptsCard(data) {
  const body = data.body || data;
  const prompts = body.prompts || [];

  if (prompts.length === 0) {
    return '<p class="text-sm text-slate-500">No prompts available</p>';
  }

  const preview = prompts.slice(0, 3);

  return `
    <div class="text-3xl font-bold text-slate-900 dark:text-white mb-2">${
      prompts.length
    }</div>
    <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">Available prompts</p>
    <div class="space-y-1">
      ${preview
        .map((prompt) => {
          const shortName = prompt.name.split('.').slice(1).join('.');
          return `
          <div class="text-xs text-slate-600 dark:text-slate-400 truncate">• ${
            shortName || prompt.name
          }</div>
        `;
        })
        .join('')}
      ${
        prompts.length > 3
          ? `<p class="text-xs text-slate-400 mt-1">+${
              prompts.length - 3
            } more</p>`
          : ''
      }
    </div>
  `;
}

function renderResourcesCard(data) {
  const body = data.body || data;
  const resources = body.resources || [];

  if (resources.length === 0) {
    return '<p class="text-sm text-slate-500">No resources available</p>';
  }

  const preview = resources.slice(0, 3);

  return `
    <div class="text-3xl font-bold text-slate-900 dark:text-white mb-2">${
      resources.length
    }</div>
    <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">Available resources</p>
    <div class="space-y-1">
      ${preview
        .map(
          (resource) => `
        <div class="text-xs text-slate-600 dark:text-slate-400 truncate">• ${
          resource.name || resource.uri
        }</div>
      `
        )
        .join('')}
      ${
        resources.length > 3
          ? `<p class="text-xs text-slate-400 mt-1">+${
              resources.length - 3
            } more</p>`
          : ''
      }
    </div>
  `;
}

function renderHealthCard(data) {
  const body = data.body || data;
  const servers = body.servers || [];
  const overallStatus = body.status || 'UNKNOWN';

  const statusCounts = {
    HEALTHY: 0,
    DEGRADED: 0,
    DOWN: 0,
    UNKNOWN: 0,
  };

  servers.forEach((server) => {
    const status = server.status?.toUpperCase() || 'UNKNOWN';
    if (statusCounts[status] !== undefined) {
      statusCounts[status]++;
    }
  });

  const statusColor = getStatusColor(overallStatus);

  return `
    <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full ${statusColor} mb-3">
      ${getStatusIcon(overallStatus)}
      <span class="text-sm font-semibold">${overallStatus}</span>
    </div>
    <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">${
      servers.length
    } backend servers</p>
    <div class="grid grid-cols-2 gap-2 text-xs">
      <div class="flex items-center gap-1">
        <span class="w-2 h-2 rounded-full bg-green-500"></span>
        <span class="text-slate-600 dark:text-slate-400">${
          statusCounts.HEALTHY
        } healthy</span>
      </div>
      <div class="flex items-center gap-1">
        <span class="w-2 h-2 rounded-full bg-yellow-500"></span>
        <span class="text-slate-600 dark:text-slate-400">${
          statusCounts.DEGRADED
        } degraded</span>
      </div>
      <div class="flex items-center gap-1">
        <span class="w-2 h-2 rounded-full bg-red-500"></span>
        <span class="text-slate-600 dark:text-slate-400">${
          statusCounts.DOWN
        } down</span>
      </div>
      <div class="flex items-center gap-1">
        <span class="w-2 h-2 rounded-full bg-slate-400"></span>
        <span class="text-slate-600 dark:text-slate-400">${
          statusCounts.UNKNOWN
        } unknown</span>
      </div>
    </div>
  `;
}

function renderMetricsCard(data) {
  const body = data.body || data;
  const requests = body.requests || {};
  const latency = body.latency || {};
  const cache = body.cache || {};

  const errorRate = requests.errorRate || '0%';
  const cacheHitRate = cache.hitRate || '0%';

  return `
    <div class="grid grid-cols-2 gap-3">
      <div>
        <div class="text-2xl font-bold text-slate-900 dark:text-white">${
          requests.total || 0
        }</div>
        <p class="text-xs text-slate-500 dark:text-slate-400">Requests</p>
      </div>
      <div>
        <div class="text-2xl font-bold ${
          parseFloat(cacheHitRate) > 50
            ? 'text-green-600 dark:text-green-400'
            : 'text-yellow-600 dark:text-yellow-400'
        }">${cacheHitRate}</div>
        <p class="text-xs text-slate-500 dark:text-slate-400">Cache Hit</p>
      </div>
      <div>
        <div class="text-2xl font-bold text-slate-900 dark:text-white">${
          latency.p50 || '0ms'
        }</div>
        <p class="text-xs text-slate-500 dark:text-slate-400">P50 Latency</p>
      </div>
      <div>
        <div class="text-2xl font-bold ${
          requests.errors > 0
            ? 'text-red-600 dark:text-red-400'
            : 'text-green-600 dark:text-green-400'
        }">${errorRate}</div>
        <p class="text-xs text-slate-500 dark:text-slate-400">Error Rate</p>
      </div>
    </div>
  `;
}

function renderCardError(message) {
  return `
    <div class="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
      <span>Failed to load</span>
    </div>
  `;
}

// Load dashboard data on page load
async function loadDashboardData() {
  const endpoints = [
    { id: 'tools', path: '/mcp/tools/list', renderer: renderToolsCard },
    { id: 'prompts', path: '/mcp/prompts/list', renderer: renderPromptsCard },
    {
      id: 'resources',
      path: '/mcp/resources/list',
      renderer: renderResourcesCard,
    },
    { id: 'health', path: '/mcp/health', renderer: renderHealthCard },
    { id: 'metrics', path: '/mcp/metrics', renderer: renderMetricsCard },
  ];

  // Load all endpoints concurrently
  const promises = endpoints.map(async ({ id, path, renderer }) => {
    const contentEl = document.getElementById(`${id}-card-content`);
    if (!contentEl) return;

    try {
      const response = await fetch(path, { cache: 'no-store' });
      const data = await response.json();

      if (response.ok) {
        contentEl.innerHTML = renderer({ body: data });
      } else {
        contentEl.innerHTML = renderCardError(
          data.error || 'Error loading data'
        );
      }
    } catch (error) {
      console.error(`Error loading ${id}:`, error);
      contentEl.innerHTML = renderCardError(error.message);
    }
  });

  await Promise.all(promises);
}

// Expand card to show full details
function expandCard(cardType, data) {
  const expandedView = document.getElementById('expanded-view');
  const expandedTitle = document.getElementById('expanded-title');
  const expandedContent = document.getElementById('expanded-content');

  if (!expandedView || !expandedTitle || !expandedContent) return;

  // Set title
  expandedTitle.textContent =
    cardType.charAt(0).toUpperCase() + cardType.slice(1);

  // Render full content using existing render functions
  let html = '';
  if (cardType === 'tools') {
    html = renderTools(data);
  } else if (cardType === 'prompts') {
    html = renderPrompts(data);
  } else if (cardType === 'resources') {
    html = renderResources(data);
  } else if (cardType === 'health') {
    html = renderHealth(data);
  } else if (cardType === 'metrics') {
    html = renderMetrics(data);
  }

  expandedContent.innerHTML = html;
  expandedView.classList.remove('hidden');

  // Scroll to expanded view
  expandedView.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Add click handlers for cards
function setupCardClickHandlers() {
  const cardTypes = ['tools', 'prompts', 'resources', 'health', 'metrics'];

  cardTypes.forEach((type) => {
    const card = document.getElementById(`${type}-card`);
    if (card) {
      card.addEventListener('click', async () => {
        try {
          const path =
            type === 'health'
              ? '/mcp/health'
              : type === 'metrics'
              ? '/mcp/metrics'
              : `/mcp/${type}/list`;
          const response = await fetch(path, { cache: 'no-store' });
          const data = await response.json();
          expandCard(type, { body: data });
        } catch (error) {
          console.error(`Error expanding ${type}:`, error);
        }
      });
    }
  });

  // Close button
  const closeBtn = document.getElementById('close-expanded');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      document.getElementById('expanded-view')?.classList.add('hidden');
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setStatus('Ready');

  // Theme toggle
  const themeToggle = document.getElementById('theme-toggle');
  themeToggle?.addEventListener('click', toggleTheme);

  // Listen for system theme changes
  globalThis
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', (e) => {
      if (!localStorage.getItem('theme')) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    });

  // Load dashboard cards
  loadDashboardData();
  setupCardClickHandlers();

  // Raw/Formatted toggle
  toggleRawBtn?.addEventListener('click', toggleRawView);

  // GET buttons (kept for backward compatibility)
  document
    .getElementById('btn-tools')
    ?.addEventListener('click', () => callGet('/mcp/tools/list'));
  document
    .getElementById('btn-resources')
    ?.addEventListener('click', () => callGet('/mcp/resources/list'));
  document
    .getElementById('btn-prompts')
    ?.addEventListener('click', () => callGet('/mcp/prompts/list'));
  document
    .getElementById('btn-health')
    ?.addEventListener('click', () => callGet('/mcp/health'));
  document
    .getElementById('btn-metrics')
    ?.addEventListener('click', () => callGet('/mcp/metrics'));

  // Resources Reader
  initResourcesDropdown();
  document
    .getElementById('resource-select')
    ?.addEventListener('change', (e) => {
      const selectedIndex = e.target.value;
      if (selectedIndex) {
        showResourceDetails(_resourcesList[selectedIndex]);
      } else {
        showResourceDetails(null);
      }
    });
  document
    .getElementById('read-resource-btn')
    ?.addEventListener('click', readResource);
  document.getElementById('copy-resource')?.addEventListener('click', () => {
    const resultEl = document.getElementById('resource-result');
    if (resultEl?.textContent) {
      navigator.clipboard
        .writeText(resultEl.textContent)
        .then(() => {
          const copyBtn = document.getElementById('copy-resource');
          const originalLabel = copyBtn.getAttribute('aria-label');
          copyBtn.setAttribute('aria-label', 'Copied!');
          copyBtn.classList.add('text-accent');
          setTimeout(() => {
            copyBtn.setAttribute('aria-label', originalLabel);
            copyBtn.classList.remove('text-accent');
          }, 2000);
        })
        .catch((err) => console.error('Failed to copy:', err));
    }
  });
});
