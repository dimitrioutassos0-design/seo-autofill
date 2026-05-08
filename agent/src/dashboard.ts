import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import type { Config } from './config.js';
import { redactSecrets, fieldsForPlatform } from './config.js';
import { createAdapter } from './platform.js';
import { runAll, type RunOptions } from './runner.js';
import type { ScanItem } from './scan.js';

interface DashboardOptions {
  cfg: Config;
  port: number;
}

export function startDashboard(opts: DashboardOptions): void {
  const { cfg, port } = opts;
  let activeRun: { promise: Promise<unknown>; runId?: string; startedAt: string } | null = null;

  const server = createServer(async (req, res) => {
    try {
      await handleRequest(req, res, cfg);
    } catch (err) {
      json(res, 500, { error: (err as Error).message });
    }
  });

  async function handleRequest(req: IncomingMessage, res: ServerResponse, cfg: Config) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const path = url.pathname;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(dashboardHtml());
      return;
    }

    if (req.method === 'GET' && path === '/api/config') {
      return json(res, 200, redactSecrets(cfg));
    }

    if (req.method === 'GET' && path === '/api/stores') {
      const stores = cfg.stores.map((s) => ({
        id: s.id,
        platform: s.platform,
        url: s.platform === 'shopify' ? s.storeDomain : s.baseUrl,
        fields: [...fieldsForPlatform(s.platform)],
      }));
      return json(res, 200, { stores });
    }

    if (req.method === 'GET' && path.startsWith('/api/stores/') && path.endsWith('/scan')) {
      const storeId = decodeURIComponent(path.split('/')[3] ?? '');
      const store = cfg.stores.find((s) => s.id === storeId);
      if (!store) return json(res, 404, { error: 'Store not found' });
      const adapter = createAdapter(store, cfg);
      const limit = Number(url.searchParams.get('limit') ?? 100);
      const items: ScanItem[] = [];
      let count = 0;
      for await (const item of adapter.scan()) {
        items.push(item);
        count++;
        if (count >= limit) break;
      }
      return json(res, 200, { storeId, total: items.length, items });
    }

    if (req.method === 'POST' && path === '/api/run') {
      if (activeRun) return json(res, 409, { error: 'A run is already in progress' });
      const body = await readBody(req);
      const parsed = body ? JSON.parse(body) : {};
      const runOpts: RunOptions = {};
      if (parsed.store) runOpts.storeFilter = parsed.store;
      if (parsed.limit) runOpts.productLimit = parsed.limit;
      const dryRun = parsed.dryRun ?? cfg.dryRun;
      const runCfg = { ...cfg, dryRun };

      activeRun = { promise: Promise.resolve(), startedAt: new Date().toISOString() };
      activeRun.promise = runAll(runCfg, runOpts)
        .then((result) => {
          activeRun = null;
          return result;
        })
        .catch((err) => {
          activeRun = null;
          throw err;
        });

      const result = await activeRun.promise;
      return json(res, 200, result);
    }

    if (req.method === 'GET' && path === '/api/run/status') {
      return json(res, 200, { running: !!activeRun, startedAt: activeRun?.startedAt ?? null });
    }

    if (req.method === 'GET' && path === '/api/reports') {
      const dir = resolve(process.cwd(), cfg.reportsDir);
      try {
        const files = await readdir(dir);
        const jsonFiles = files.filter((f) => f.endsWith('.json')).sort().reverse();
        const reports = await Promise.all(jsonFiles.map(async (f) => {
          try {
            const content = JSON.parse(await readFile(resolve(dir, f), 'utf8'));
            return { file: f, runId: content.runId ?? f, storeId: content.storeId ?? '' };
          } catch {
            return { file: f, runId: f, storeId: '' };
          }
        }));
        return json(res, 200, { reports });
      } catch {
        return json(res, 200, { reports: [] });
      }
    }

    if (req.method === 'GET' && path.startsWith('/api/reports/')) {
      const file = decodeURIComponent(path.slice('/api/reports/'.length));
      const filePath = resolveReportFilePath(cfg.reportsDir, file);
      if (!filePath) return json(res, 400, { error: 'Invalid report file' });
      try {
        const data = await readFile(filePath, 'utf8');
        return json(res, 200, JSON.parse(data));
      } catch {
        return json(res, 404, { error: 'Report not found' });
      }
    }

    json(res, 404, { error: 'Not found' });
  }

  server.listen(port, () => {
    process.stdout.write(`\nSEO Autofill Dashboard running at http://localhost:${port}\n`);
    process.stdout.write(`Stores: ${cfg.stores.map((s) => `${s.id} (${s.platform})`).join(', ')}\n\n`);
  });
}

export function resolveReportFilePath(reportsDir: string, file: string): string | null {
  if (!file || file !== basename(file) || !file.toLowerCase().endsWith('.json')) {
    return null;
  }
  return resolve(process.cwd(), reportsDir, file);
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
  });
}

function dashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SEO Autofill Dashboard</title>
<style>
  :root {
    --bg: #090a0d;
    --surface: #13151b;
    --surface-2: #1a1d25;
    --border: #2b303b;
    --text: #e4e4ed;
    --text-dim: #8888a0;
    --accent: #4f8cff;
    --accent-hover: #3f7bf0;
    --accent-glow: rgba(79, 140, 255, 0.16);
    --green: #34d399;
    --green-bg: rgba(52, 211, 153, 0.1);
    --red: #f87171;
    --red-bg: rgba(248, 113, 113, 0.1);
    --amber: #fbbf24;
    --amber-bg: rgba(251, 191, 36, 0.1);
    --radius: 8px;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Inter', -apple-system, system-ui, sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
  }
  .topbar {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 16px 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 100;
    backdrop-filter: blur(12px);
  }
  .topbar h1 {
    font-size: 18px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .topbar h1 .logo {
    width: 28px;
    height: 28px;
    background: var(--accent);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 700;
    color: #fff;
  }
  .topbar-actions { display: flex; gap: 10px; align-items: center; }
  .container { max-width: 1320px; margin: 0 auto; padding: 28px 32px; overflow-x: hidden; }

  .tabs {
    display: flex;
    gap: 4px;
    background: var(--surface);
    border-radius: 10px;
    padding: 4px;
    margin-bottom: 24px;
    border: 1px solid var(--border);
    width: fit-content;
    max-width: 100%;
    overflow-x: auto;
  }
  .tab {
    padding: 8px 20px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-dim);
    cursor: pointer;
    border: none;
    background: transparent;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .tab:hover { color: var(--text); background: var(--surface-2); }
  .tab.active { color: #fff; background: var(--accent); }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }
  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px;
  }
  .stat-card .label { font-size: 12px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
  .stat-card .value { font-size: 28px; font-weight: 700; }
  .stat-card .sub { font-size: 12px; color: var(--text-dim); margin-top: 4px; }

  .panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    margin-bottom: 24px;
  }
  .panel-header {
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .panel-header h2 { font-size: 15px; font-weight: 600; }
  .panel-body { padding: 0; }
  .table-scroll { overflow-x: auto; }
  .data-table { min-width: 900px; }

  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th {
    text-align: left;
    padding: 10px 16px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-dim);
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
    font-weight: 500;
    position: sticky;
    top: 0;
  }
  td {
    padding: 10px 16px;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: var(--surface-2); }

  .badge {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .badge-green { background: var(--green-bg); color: var(--green); }
  .badge-red { background: var(--red-bg); color: var(--red); }
  .badge-amber { background: var(--amber-bg); color: var(--amber); }
  .badge-dim { background: var(--surface-2); color: var(--text-dim); }

  .field-grid { display: flex; gap: 6px; flex-wrap: wrap; }
  .field-chip {
    padding: 3px 8px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 500;
  }
  .field-chip.missing { background: var(--red-bg); color: var(--red); }
  .field-chip.filled { background: var(--green-bg); color: var(--green); }

  .btn {
    padding: 8px 18px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--text);
    transition: all 0.15s;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .btn:hover { background: var(--border); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  .btn-primary:hover { background: var(--accent-hover); }
  .btn-sm { padding: 5px 12px; font-size: 12px; }

  .run-bar {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px;
    margin-bottom: 24px;
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }
  .run-bar label { font-size: 13px; color: var(--text-dim); }
  .run-bar select, .run-bar input[type=number] {
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 6px 12px;
    border-radius: 8px;
    font-size: 13px;
  }
  .run-bar select:focus, .run-bar input:focus { outline: none; border-color: var(--accent); }
  .product-toolbar {
    margin-bottom: 16px;
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
  }

  .toast {
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px 20px;
    font-size: 13px;
    z-index: 200;
    display: none;
    animation: slideIn 0.2s ease;
    max-width: 420px;
  }
  .toast.show { display: block; }
  @keyframes slideIn { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

  .progress-bar {
    width: 100%;
    height: 6px;
    background: var(--surface-2);
    border-radius: 3px;
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 3px;
    transition: width 0.4s;
  }

  .empty-state {
    padding: 48px 24px;
    text-align: center;
    color: var(--text-dim);
    font-size: 14px;
  }

  .report-item {
    padding: 14px 20px;
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    transition: background 0.1s;
  }
  .report-item:hover { background: var(--surface-2); }
  .report-item:last-child { border-bottom: none; }
  .report-meta { font-size: 12px; color: var(--text-dim); }

  .spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .cell-text {
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .products-table {
    min-width: 1080px;
    table-layout: fixed;
  }
  .products-table th:nth-child(1), .products-table td:nth-child(1) { width: 52px; }
  .products-table th:nth-child(2), .products-table td:nth-child(2) { width: 170px; }
  .products-table th:nth-child(3), .products-table td:nth-child(3) { width: 120px; }
  .products-table th:nth-child(4), .products-table td:nth-child(4) { width: 78px; }
  .products-table th:nth-child(n+5), .products-table td:nth-child(n+5) { width: 165px; }
  .product-name, .sku-cell {
    overflow-wrap: anywhere;
  }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    z-index: 300;
    display: none;
    align-items: center;
    justify-content: center;
  }
  .modal-overlay.show { display: flex; }
  .modal {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    max-width: 700px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
    padding: 24px;
  }
  .modal h3 { margin-bottom: 16px; font-size: 16px; }
  .modal pre {
    background: var(--surface-2);
    padding: 16px;
    border-radius: 8px;
    font-size: 12px;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.5;
  }
  .modal .close-btn {
    float: right;
    background: none;
    border: none;
    color: var(--text-dim);
    font-size: 20px;
    cursor: pointer;
  }

  @media (max-width: 768px) {
    .container { padding: 16px; }
    .topbar { padding: 12px 16px; }
    .stats-grid { grid-template-columns: repeat(2, 1fr); }
    .run-bar { flex-direction: column; align-items: stretch; }
    .run-bar > div { width: 100%; }
    .run-bar div[style*="margin-left:auto"] { margin-left: 0 !important; }
    .run-bar select, .run-bar input[type=number], .btn-primary { width: 100%; }
    .stats-grid { gap: 10px; }
    .stat-card { padding: 14px; }
  }
  @media (max-width: 480px) {
    .tabs { width: 100%; gap: 2px; }
    .tab { flex: 1; padding: 8px 8px; font-size: 12px; }
    .product-toolbar { flex-direction: column; align-items: stretch; }
    .product-toolbar select { width: 100%; }
  }
</style>
</head>
<body>

<div class="topbar">
  <h1><span class="logo">S</span> SEO Autofill</h1>
  <div class="topbar-actions">
    <span id="status-indicator" style="font-size:12px;color:var(--text-dim)"></span>
  </div>
</div>

<div class="container">
  <div class="tabs">
    <button class="tab active" data-tab="overview" onclick="switchTab('overview')">Overview</button>
    <button class="tab" data-tab="products" onclick="switchTab('products')">Products</button>
    <button class="tab" data-tab="run" onclick="switchTab('run')">Run Agent</button>
    <button class="tab" data-tab="reports" onclick="switchTab('reports')">Reports</button>
  </div>

  <!-- Overview Tab -->
  <div id="tab-overview" class="tab-content">
    <div class="stats-grid" id="stats-grid"></div>
    <div class="panel">
      <div class="panel-header">
        <h2>Stores</h2>
        <button class="btn btn-sm" onclick="loadOverview()">Refresh</button>
      </div>
      <div class="panel-body table-scroll">
        <table class="data-table">
          <thead><tr><th>Store ID</th><th>Platform</th><th>URL</th><th>Target Fields</th><th>Products</th><th>Missing</th><th>Coverage</th></tr></thead>
          <tbody id="stores-table"></tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Products Tab -->
  <div id="tab-products" class="tab-content" style="display:none">
    <div class="product-toolbar">
      <select id="store-select" onchange="loadProducts()" style="background:var(--surface);border:1px solid var(--border);color:var(--text);padding:8px 14px;border-radius:8px;font-size:13px"></select>
      <select id="filter-select" onchange="filterProducts()" style="background:var(--surface);border:1px solid var(--border);color:var(--text);padding:8px 14px;border-radius:8px;font-size:13px">
        <option value="all">All products</option>
        <option value="missing">Has missing fields</option>
        <option value="filled">Fully filled</option>
      </select>
      <span id="product-count" style="font-size:12px;color:var(--text-dim)"></span>
    </div>
    <div class="panel">
      <div class="panel-body table-scroll" style="max-height:65vh;overflow-y:auto">
        <table class="products-table">
          <thead id="products-thead"></thead>
          <tbody id="products-table"></tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Run Tab -->
  <div id="tab-run" class="tab-content" style="display:none">
    <div class="run-bar">
      <div>
        <label>Store</label><br>
        <select id="run-store" style="background:var(--surface-2);border:1px solid var(--border);color:var(--text);padding:8px 14px;border-radius:8px;font-size:13px;margin-top:4px">
          <option value="">All stores</option>
        </select>
      </div>
      <div>
        <label>Product limit</label><br>
        <input type="number" id="run-limit" placeholder="No limit" min="1" style="width:100px;margin-top:4px">
      </div>
      <div>
        <label>Mode</label><br>
        <select id="run-mode" style="background:var(--surface-2);border:1px solid var(--border);color:var(--text);padding:8px 14px;border-radius:8px;font-size:13px;margin-top:4px">
          <option value="dry">Dry run</option>
          <option value="live">Live (write changes)</option>
        </select>
      </div>
      <div style="margin-left:auto;align-self:flex-end">
        <button class="btn btn-primary" id="run-btn" onclick="startRun()">
          Run Agent
        </button>
      </div>
    </div>

    <div id="run-result" style="display:none" class="panel">
      <div class="panel-header"><h2>Run Result</h2></div>
      <div class="panel-body" style="padding:20px">
        <pre id="run-result-pre" style="background:var(--surface-2);padding:16px;border-radius:8px;font-size:12px;white-space:pre-wrap"></pre>
      </div>
    </div>

    <div class="panel" style="margin-top:16px">
      <div class="panel-header"><h2>How It Works</h2></div>
      <div class="panel-body" style="padding:20px;font-size:13px;color:var(--text-dim);line-height:1.7">
        <p><strong style="color:var(--text)">1. Scan</strong> &mdash; The agent scans each store for products with missing SEO fields.</p>
        <p><strong style="color:var(--text)">2. Generate</strong> &mdash; For each missing field, the LLM generates content using product context (name, categories, attributes, images).</p>
        <p><strong style="color:var(--text)">3. Validate</strong> &mdash; Generated text is checked for length, placeholders, banned claims, and duplicates.</p>
        <p><strong style="color:var(--text)">4. Apply</strong> &mdash; Validated content is batch-written to the store. Existing values are never overwritten.</p>
        <p style="margin-top:8px"><strong style="color:var(--text)">Dry run</strong> simulates the full pipeline but skips the write step.</p>
      </div>
    </div>
  </div>

  <!-- Reports Tab -->
  <div id="tab-reports" class="tab-content" style="display:none">
    <div class="panel">
      <div class="panel-header">
        <h2>Run History</h2>
        <button class="btn btn-sm" onclick="loadReports()">Refresh</button>
      </div>
      <div class="panel-body" id="reports-list"></div>
    </div>
  </div>
</div>

<!-- Modal -->
<div class="modal-overlay" id="modal-overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <button class="close-btn" onclick="closeModal()">&times;</button>
    <h3 id="modal-title"></h3>
    <pre id="modal-body"></pre>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
const API = '';
let allProducts = [];
let storesData = [];

async function api(path, opts) {
  const res = await fetch(API + path, opts);
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = data && (data.error || data.message) ? (data.error || data.message) : 'Request failed with status ' + res.status;
    throw new Error(msg);
  }
  return data;
}

function switchTab(name) {
  document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + name).style.display = 'block';
  document.querySelector('[data-tab="' + name + '"]').classList.add('active');
  if (name === 'overview') loadOverview();
  if (name === 'products') loadProducts();
  if (name === 'reports') loadReports();
}

function toast(msg, duration = 3000) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), duration);
}

async function loadOverview() {
  try {
    setStatus('Scanning stores...');
    const data = await api('/api/stores');
    storesData = data.stores;
    populateStoreSelects(data.stores);

    let totalProducts = 0, productsNeedingSeo = 0, missingFields = 0, totalFields = 0, filledFields = 0;
    const rows = [];

    for (const store of data.stores) {
      try {
        const scan = await api('/api/stores/' + encodeURIComponent(store.id) + '/scan?limit=500');
        const products = scan.items;
        const missing = products.filter(p => p.missing_fields.length > 0).length;
        const tf = products.length * store.fields.length;
        const mf = products.reduce((s, p) => s + p.missing_fields.filter(f => store.fields.includes(f)).length, 0);
        const ff = tf - mf;
        const pct = tf ? Math.round((ff / tf) * 100) : 100;

        totalProducts += products.length;
        productsNeedingSeo += missing;
        missingFields += mf;
        totalFields += tf;
        filledFields += ff;

        rows.push('<tr>' +
          '<td style="font-weight:600">' + esc(store.id) + '</td>' +
          '<td><span class="badge ' + (store.platform === 'shopify' ? 'badge-green' : 'badge-amber') + '">' + esc(store.platform) + '</span></td>' +
          '<td style="color:var(--text-dim);font-size:12px">' + esc(store.url) + '</td>' +
          '<td><div class="field-grid">' + store.fields.map(f => '<span class="field-chip filled">' + esc(f) + '</span>').join('') + '</div></td>' +
          '<td>' + products.length + '</td>' +
          '<td>' + (missing > 0 ? '<span style="color:var(--red)">' + missing + '</span>' : '<span style="color:var(--green)">0</span>') + '</td>' +
          '<td><div class="progress-bar"><div class="progress-fill" style="width:' + pct + '%"></div></div><span style="font-size:11px;color:var(--text-dim)">' + pct + '%</span></td>' +
        '</tr>');
      } catch (e) {
        rows.push('<tr><td style="font-weight:600">' + esc(store.id) + '</td><td colspan="6" style="color:var(--red)">Error: ' + esc(e.message) + '</td></tr>');
      }
    }

    const totalPct = totalFields ? Math.round((filledFields / totalFields) * 100) : 100;

    document.getElementById('stats-grid').innerHTML =
      statCard('Total Products', totalProducts, '') +
      statCard('Products Needing SEO', productsNeedingSeo > 0 ? productsNeedingSeo : 'None', productsNeedingSeo > 0 ? 'red' : 'green', missingFields + ' empty fields') +
      statCard('Field Coverage', totalPct + '%', totalPct === 100 ? 'green' : totalPct > 70 ? 'amber' : 'red') +
      statCard('Stores', data.stores.length, '');

    document.getElementById('stores-table').innerHTML = rows.join('');
    setStatus('Ready');
  } catch (e) {
    setStatus('Unable to load stores');
    document.getElementById('stats-grid').innerHTML = '';
    document.getElementById('stores-table').innerHTML = '<tr><td colspan="7" class="empty-state">Unable to load stores: ' + esc(e.message) + '</td></tr>';
    toast('Unable to load stores: ' + e.message, 5000);
  }
}

function statCard(label, value, color, sub) {
  const style = color === 'green' ? 'color:var(--green)' : color === 'red' ? 'color:var(--red)' : color === 'amber' ? 'color:var(--amber)' : '';
  return '<div class="stat-card"><div class="label">' + esc(label) + '</div><div class="value" style="' + style + '">' + esc(value) + '</div>' + (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div>';
}

function populateStoreSelects(stores) {
  const sel1 = document.getElementById('store-select');
  const sel2 = document.getElementById('run-store');
  if (sel1.children.length <= 1) {
    sel1.innerHTML = stores.map(s => '<option value="' + esc(s.id) + '">' + esc(s.id) + ' (' + esc(s.platform) + ')</option>').join('');
  }
  if (sel2.children.length <= 1) {
    sel2.innerHTML = '<option value="">All stores</option>' + stores.map(s => '<option value="' + esc(s.id) + '">' + esc(s.id) + ' (' + esc(s.platform) + ')</option>').join('');
  }
}

async function ensureStoresLoaded() {
  if (storesData.length) return;
  const data = await api('/api/stores');
  storesData = data.stores;
  populateStoreSelects(data.stores);
}

async function loadProducts() {
  try {
    await ensureStoresLoaded();
    const storeId = document.getElementById('store-select').value;
    if (!storeId) return;
    const store = storesData.find(s => s.id === storeId);
    const fields = store ? store.fields : ['description','short_description','yoast_title','yoast_metadesc'];
    const data = await api('/api/stores/' + encodeURIComponent(storeId) + '/scan?limit=500');
    allProducts = data.items;

    document.getElementById('products-thead').innerHTML = '<tr><th>ID</th><th>Name</th><th>SKU</th><th>Type</th>' +
      fields.map(f => '<th>' + esc(f.replace(/_/g, ' ')) + '</th>').join('') + '</tr>';

    renderProducts(fields);
  } catch (e) {
    document.getElementById('product-count').textContent = '';
    document.getElementById('products-table').innerHTML = '<tr><td class="empty-state">Unable to load products: ' + esc(e.message) + '</td></tr>';
    toast('Unable to load products: ' + e.message, 5000);
  }
}

function filterProducts() {
  const store = storesData.find(s => s.id === document.getElementById('store-select').value);
  renderProducts(store ? store.fields : []);
}

function renderProducts(fields) {
  const filter = document.getElementById('filter-select').value;
  let items = allProducts;
  if (filter === 'missing') items = items.filter(p => p.missing_fields.length > 0);
  if (filter === 'filled') items = items.filter(p => p.missing_fields.length === 0);
  document.getElementById('product-count').textContent = items.length + ' of ' + allProducts.length + ' products';

  const rows = items.map(p => {
    const cells = fields.map(f => {
      const val = p.current[f] || '';
      const isMissing = p.missing_fields.includes(f);
      if (isMissing) return '<td><span class="badge badge-red">empty</span></td>';
      const display = val.length > 60 ? val.slice(0, 60) + '...' : val;
      return '<td class="cell-text" title="' + esc(val) + '"><span style="color:var(--green)">' + esc(display) + '</span></td>';
    }).join('');
    return '<tr><td style="font-weight:600;color:var(--text-dim)">' + esc(p.id) + '</td>' +
      '<td class="product-name" style="font-weight:500">' + esc(p.name) + '</td>' +
      '<td class="sku-cell" style="color:var(--text-dim);font-size:12px">' + esc(p.sku || '-') + '</td>' +
      '<td style="color:var(--text-dim)">' + esc(p.type) + '</td>' +
      cells + '</tr>';
  }).join('');

  document.getElementById('products-table').innerHTML = rows || '<tr><td colspan="' + (4 + fields.length) + '" class="empty-state">No products match this filter</td></tr>';
}

async function startRun() {
  const btn = document.getElementById('run-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Running...';
  document.getElementById('run-result').style.display = 'none';

  const store = document.getElementById('run-store').value || undefined;
  const limitEl = document.getElementById('run-limit');
  const limit = limitEl.value ? Number(limitEl.value) : undefined;
  const dryRun = document.getElementById('run-mode').value === 'dry';

  try {
    setStatus('Run in progress...');
    const result = await api('/api/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ store, limit, dryRun }),
    });

    document.getElementById('run-result').style.display = 'block';
    document.getElementById('run-result-pre').textContent = JSON.stringify(result, null, 2);
    toast('Run completed: ' + (result.runId || 'done'));
    setStatus('Ready');
  } catch (e) {
    toast('Run failed: ' + e.message, 5000);
    setStatus('Run failed');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Run Agent';
  }
}

async function loadReports() {
  const list = document.getElementById('reports-list');
  let data;
  try {
    data = await api('/api/reports');
  } catch (e) {
    list.innerHTML = '<div class="empty-state">Unable to load reports: ' + esc(e.message) + '</div>';
    toast('Unable to load reports: ' + e.message, 5000);
    return;
  }

  if (!data.reports.length) {
    list.innerHTML = '<div class="empty-state">No reports yet. Run the agent to generate reports.</div>';
    return;
  }

  list.innerHTML = data.reports.map(r => {
    return '<div class="report-item">' +
      '<div><strong>' + esc(r.storeId || r.file) + '</strong><br><span class="report-meta">' + esc(r.runId) + '</span></div>' +
      '<button class="btn btn-sm" data-report-file="' + esc(r.file) + '">View</button></div>';
  }).join('');
  list.querySelectorAll('[data-report-file]').forEach(btn => {
    btn.addEventListener('click', () => viewReport(btn.getAttribute('data-report-file')));
  });
}

async function viewReport(file) {
  if (!file) {
    toast('Unable to load report: missing file name', 5000);
    return;
  }
  try {
  const data = await api('/api/reports/' + encodeURIComponent(file));
  document.getElementById('modal-title').textContent = 'Report: ' + (data.storeId || file);

  let html = '';
  if (data.summary) {
    html += 'Run: ' + data.runId + '\\n';
    html += 'Store: ' + data.storeId + '\\n';
    html += 'Total: ' + data.summary.total + '\\n';
    html += 'Status breakdown: ' + JSON.stringify(data.summary.byStatus) + '\\n\\n';
  }
  if (data.rows) {
    html += data.rows.map(r =>
      r.productId + ' | ' + r.name + ' | ' + r.field + ' | ' + r.status + (r.reason ? ' (' + r.reason + ')' : '') +
      (r.generated ? '\\n  → ' + r.generated.slice(0, 120) + (r.generated.length > 120 ? '...' : '') : '')
    ).join('\\n');
  }

  document.getElementById('modal-body').textContent = html || JSON.stringify(data, null, 2);
  document.getElementById('modal-overlay').classList.add('show');
  } catch (e) {
    toast('Unable to load report: ' + e.message, 5000);
  }
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('show');
}

function esc(s) {
  if (s === undefined || s === null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function setStatus(msg) {
  document.getElementById('status-indicator').textContent = msg;
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

loadOverview();
</script>
</body>
</html>`;
}
