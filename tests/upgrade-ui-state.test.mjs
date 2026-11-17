import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

// Execute the actual UI module. Only its imports are replaced with controlled
// external dependencies: these tests exercise UI state, not EVM/crypto behavior.
const appSource = fs.readFileSync(new URL('../upgrade/app.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../upgrade/index.html', import.meta.url), 'utf8');
const ZERO = '0x' + '0'.repeat(64);
const ACCOUNT = '0x' + '1'.repeat(40);
const OTHER_ACCOUNT = '0x' + '2'.repeat(40);
const REGISTRY = '0x' + '9'.repeat(40);
const ORG = '0x' + 'a'.repeat(64);
const OTHER_ORG = '0x' + 'b'.repeat(64);
const ID = '0x' + 'c'.repeat(64);
const OTHER_ID = '0x' + 'd'.repeat(64);
const HASH = '0x' + 'e'.repeat(64);
const BLOCK_HASH = '0x' + 'f'.repeat(64);
const OLD_BLOCK = 12345678;

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function microtasks() {
  for (let i = 0; i < 16; i++) await Promise.resolve();
}
function snapshot(org = ORG) {
  return {
    institution: { key: ACCOUNT, epoch: 7, revision: 1, enabled: true },
    record: {
      commitment: HASH,
      issuedBy: ACCOUNT,
      keyEpoch: 7,
      previousId: OTHER_ID,
      replacedBy: OTHER_ID,
      registeredAt: 1700000000,
      validUntil: 2100000000,
      revokedAt: 0,
      revocationKind: 0,
      reasonHash: ZERO,
    },
    query: {
      mode: 'testnet',
      chainId: 11155111,
      registryAddress: REGISTRY,
      institution: org,
      blockNumber: OLD_BLOCK,
      blockHash: BLOCK_HASH,
      blockTimestamp: 1800000000,
      at: '2026-11-07T00:00:00.000Z',
    },
  };
}
function proposal(id = 41) {
  return {
    id,
    action: 1,
    institution: ORG,
    key: OTHER_ACCOUNT,
    enabled: true,
    credentialId: ID,
    reasonHash: HASH,
    approvals: 1,
    threshold: 2,
    deadline: 2100000000,
    executed: false,
    cancelled: false,
    stale: false,
    alreadyApproved: false,
  };
}
function verification() {
  return {
    technicalPass: true,
    status: '有效',
    integrity: true,
    keyEpoch: 7,
    institutionEnabled: true,
    holder: '未验证',
    school: '未审批',
    query: snapshot().query,
  };
}
function packageFixture() {
  return {
    payload: {
      schemaVersion: 3,
      chainId: 11155111,
      registryAddress: REGISTRY,
      institution: ORG,
      issuer: ACCOUNT,
      keyEpoch: 7,
      credentialId: ID,
      previousId: ZERO,
      title: 'UI TEST ONLY',
      holderRef: '虚构测试对象',
      validUntil: 2100000000,
    },
    salt: HASH,
  };
}
function memoryStorage(seed = new Map()) {
  return {
    getItem: (key) => (seed.has(String(key)) ? seed.get(String(key)) : null),
    setItem: (key, value) => seed.set(String(key), String(value)),
    removeItem: (key) => seed.delete(String(key)),
    clear: () => seed.clear(),
    key: (index) => [...seed.keys()][index] ?? null,
    get length() {
      return seed.size;
    },
    backing: seed,
  };
}
function dom() {
  const elements = new Map();
  let document;
  class Element {
    constructor(tagName = 'div', id = '', attrs = '') {
      this.tagName = tagName.toUpperCase();
      this.id = id;
      this.value = attrs.match(/\bvalue="([^"]*)"/)?.[1] ?? '';
      this.disabled = /(?:^|\s)disabled(?:\s|=|$)/.test(attrs);
      this.hidden = /(?:^|\s)hidden(?:\s|=|$)/.test(attrs);
      this.dataset = {};
      this.attributes = new Map();
      this.listeners = new Map();
      this.children = [];
      this.files = [];
      this.textContent = '';
      this.innerHTML = '';
      this.parentElement = null;
      this.style = {};
      this.tabIndex = 0;
      for (const [, key, value] of attrs.matchAll(/data-([\w-]+)="([^"]*)"/g))
        this.dataset[key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
      const classes = new Set(
        (attrs.match(/\bclass="([^"]*)"/)?.[1] ?? '').split(/\s+/).filter(Boolean),
      );
      this.classList = {
        add: (...names) => names.forEach((n) => classes.add(n)),
        remove: (...names) => names.forEach((n) => classes.delete(n)),
        contains: (n) => classes.has(n),
        toggle: (n, force) => {
          const enabled = force ?? !classes.has(n);
          enabled ? classes.add(n) : classes.delete(n);
          return enabled;
        },
      };
    }
    addEventListener(name, listener) {
      if (!this.listeners.has(name)) this.listeners.set(name, []);
      this.listeners.get(name).push(listener);
    }
    dispatchEvent(event) {
      event.target ??= this;
      const results = [
        this['on' + event.type]?.(event),
        ...(this.listeners.get(event.type) ?? []).map((fn) => fn(event)),
      ];
      return results.find((result) => result?.then);
    }
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    }
    getAttribute(name) {
      return this.attributes.get(name) ?? null;
    }
    removeAttribute(name) {
      this.attributes.delete(name);
    }
    append(...children) {
      this.children.push(...children);
    }
    appendChild(child) {
      this.children.push(child);
      return child;
    }
    replaceChildren(...children) {
      this.children = children;
    }
    add(child) {
      this.append(child);
    }
    focus() {
      document.activeElement = this;
    }
    click() {
      if (!this.disabled) return this.dispatchEvent({ type: 'click' });
    }
    querySelector() {
      return null;
    }
    querySelectorAll() {
      return [];
    }
  }
  for (const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/gi)) {
    elements.set(match[3], new Element(match[1], match[3], match[2]));
  }
  const institutionDetails = new Element('details');
  institutionDetails.open = false;
  elements.get('institution').parentElement = institutionDetails;
  const body = new Element('body');
  const shell = new Element('div');
  document = {
    body,
    activeElement: body,
    getElementById: (id) => elements.get(id) ?? null,
    createElement: (tag) => new Element(tag),
    querySelectorAll: (selector) => {
      if (selector === '[data-tab]') return [...elements.values()].filter((el) => el.dataset.tab);
      const tags = selector.split(',').map((tag) => tag.trim().toUpperCase());
      return [...elements.values()].filter((el) => tags.includes(el.tagName));
    },
    querySelector: (selector) => {
      if (selector === '.workspace-shell') return shell;
      if (selector === '[aria-invalid="true"]')
        return (
          [...elements.values()].find((el) => el.getAttribute('aria-invalid') === 'true') ?? null
        );
      const label = selector.match(/^label\[for="([^"]+)"\]$/);
      if (label) return { textContent: label[1] };
      if (selector.startsWith('#')) return elements.get(selector.slice(1)) ?? null;
      return null;
    },
  };
  const get = (id) => {
    assert.ok(elements.has(id), `UI element #${id} exists`);
    return elements.get(id);
  };
  Object.assign(get('institution'), { value: ORG });
  Object.assign(get('history-id'), { value: ID });
  Object.assign(get('proposal-id'), { value: '41' });
  Object.assign(get('title'), { value: 'UI TEST ONLY' });
  Object.assign(get('holder'), { value: '虚构测试对象' });
  Object.assign(get('operation'), { value: 'issue' });
  Object.assign(get('action'), { value: '0' });
  Object.assign(get('enabled'), { value: 'false' });
  Object.assign(get('new-key'), { value: OTHER_ACCOUNT });
  Object.assign(get('reason'), { value: 'UI TEST ONLY' });
  return { document, get, elements, Element, institutionDetails };
}

async function boot({ storage = memoryStorage(), overrides = {} } = {}) {
  const ui = dom(),
    events = new Map(),
    walletEvents = new Map();
  const calls = [];
  const behavior = {
    connect: async () => ACCOUNT,
    role: async () => '治理成员',
    snapshot: async (org) => snapshot(org),
    proposal: async (id) => proposal(id),
    verify: async () => verification(),
    send: async () => {
      throw new Error('unexpected write in UI test');
    },
    getReceipt: async () => null,
    getDeploymentInfo: async () => ({}),
    checkTransaction: async () => {
      throw new Error('unexpected receipt recheck');
    },
    rpc: async (method) => {
      throw new Error('unexpected RPC ' + method);
    },
    ...overrides,
  };
  const wallet = {
    on(name, callback) {
      if (!walletEvents.has(name)) walletEvents.set(name, []);
      walletEvents.get(name).push(callback);
    },
    request: async () => {
      throw new Error('UI must use the controlled adapter');
    },
  };
  let adapter;
  class FakeAdapter {
    constructor(config, abi, options) {
      this.config = config;
      this.wallet = options.wallet;
      this.onProgress = options.onProgress;
      this.abi = { parseLog: () => null };
      this.readProvider = { request: async ({ method, params }) => this.rpc(method, params) };
      adapter = this;
    }
  }
  for (const name of [
    'connect',
    'role',
    'snapshot',
    'proposal',
    'send',
    'getReceipt',
    'getDeploymentInfo',
    'checkTransaction',
    'rpc',
  ]) {
    FakeAdapter.prototype[name] = async function (...args) {
      calls.push({ method: name, args });
      return behavior[name](...args);
    };
  }
  const config = {
    mode: 'testnet',
    deploymentStatus: 'deployed',
    chainId: 11155111,
    registryAddress: REGISTRY,
    deploymentTxHash: HASH,
    runtimeCodeHash: BLOCK_HASH,
  };
  const timers = new Map();
  let timerId = 0;
  const window = {
    ethereum: wallet,
    localStorage: storage,
    sessionStorage: storage,
    addEventListener(name, callback) {
      if (!events.has(name)) events.set(name, []);
      events.get(name).push(callback);
    },
    dispatchEvent(event) {
      for (const fn of events.get(event.type) ?? []) fn(event);
    },
    history: { replaceState() {} },
  };
  const location = { hostname: '127.0.0.1', origin: 'http://127.0.0.1:8080', hash: '' };
  const context = vm.createContext({
    document: ui.document,
    window,
    location,
    localStorage: storage,
    sessionStorage: storage,
    console,
    TextEncoder,
    Uint8Array,
    crypto: webcrypto,
    Blob,
    URL,
    Date,
    structuredClone,
    AbortSignal,
    Event: class {
      constructor(type) {
        this.type = type;
      }
    },
    Option: class {
      constructor(text, value) {
        this.text = text;
        this.value = value;
      }
    },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    setTimeout: (callback, delay) => {
      timers.set(++timerId, { callback, delay });
      return timerId;
    },
    clearTimeout: (id) => timers.delete(id),
    fetch: async (url) => {
      assert.ok(['config.json', 'abi.json'].includes(url), 'no external requests in UI tests');
      return { ok: true, json: async () => (url === 'config.json' ? config : []) };
    },
    GovernedAdapter: FakeAdapter,
    ZERO,
    validatePackage: (value) => {
      if (!value?.payload) throw new Error('invalid package');
      return value.payload;
    },
    commitment: async () => HASH,
    verifyPackage: (...args) => behavior.verify(...args),
    random32: () => OTHER_ID,
    hex: (bytes) => '0x' + Buffer.from(bytes).toString('hex'),
    is32: (value) => /^0x[0-9a-f]{64}$/.test(value) && value !== ZERO,
    isAddress: (value) => /^0x[0-9a-f]{40}$/.test(value) && value !== '0x' + '0'.repeat(40),
  });
  const source = appSource.replace(/^import [^\n]+;\s*$/gm, '');
  await new vm.Script(`(async()=>{\n${source}\n})()`, { filename: 'upgrade/app.js' }).runInContext(
    context,
  );
  return {
    ...ui,
    adapter,
    behavior,
    calls,
    storage,
    timers,
    async click(id) {
      const el = ui.get(id);
      assert.equal(el.disabled, false, `#${id} is actionable`);
      el.focus();
      return el.dispatchEvent({ type: 'click' });
    },
    input(id, value) {
      const el = ui.get(id);
      el.value = value;
      return el.dispatchEvent({ type: 'input' });
    },
    walletEvent(name = 'accountsChanged') {
      for (const fn of walletEvents.get(name) ?? [])
        fn(name === 'accountsChanged' ? [OTHER_ACCOUNT] : '0x1');
    },
    hashchange(hash) {
      location.hash = hash;
      window.dispatchEvent({ type: 'hashchange' });
    },
    async importPackage(value = packageFixture()) {
      const text = typeof value === 'string' ? value : JSON.stringify(value);
      ui.get('import').files = [{ size: text.length, text: async () => text }];
      await ui.get('import').dispatchEvent({ type: 'change' });
    },
  };
}

function assertHistoryCleared(ui) {
  assert.ok(
    !ui.get('history-result').textContent.includes(String(OLD_BLOCK)),
    'old block must not remain visible',
  );
  assert.equal(ui.get('previous').disabled, true);
  assert.equal(ui.get('next').disabled, true);
}
function assertProposalCleared(ui) {
  assert.ok(
    !ui.get('proposal-summary').textContent.includes('提案 #41'),
    'old proposal summary must not remain visible',
  );
  for (const id of ['approve', 'execute', 'cancel']) assert.equal(ui.get(id).disabled, true, id);
}

test('升级 UI：修改机构或历史编号立即清除旧结果和版本导航', async () => {
  const ui = await boot();
  await ui.click('connect');
  await ui.click('query');
  assert.match(ui.get('history-result').textContent, /12345678/);
  assert.equal(ui.get('previous').disabled, false);
  ui.input('history-id', OTHER_ID);
  assertHistoryCleared(ui);
  await ui.click('query');
  await ui.click('read-proposal');
  assert.match(ui.get('proposal-summary').textContent, /提案 #41/);
  ui.input('institution', OTHER_ORG);
  assertHistoryCleared(ui);
  assertProposalCleared(ui);
  assert.ok(
    !ui.get('org-state').textContent.includes(ACCOUNT),
    'previous institution key must be cleared',
  );
});

test('升级 UI：查询失败不保留上一笔历史、机构或提案的成功结果', async () => {
  const ui = await boot();
  await ui.click('connect');
  await ui.click('query');
  ui.behavior.snapshot = async () => {
    throw new Error('RPC unavailable');
  };
  await ui.click('query');
  assertHistoryCleared(ui);
  assert.match(ui.get('status').textContent, /网络连接暂不可用/);
  await ui.click('refresh');
  assert.ok(!ui.get('org-state').textContent.includes(ACCOUNT));
  await ui.click('read-proposal');
  ui.behavior.proposal = async () => {
    throw new Error('proposal RPC unavailable');
  };
  await ui.click('read-proposal');
  assertProposalCleared(ui);
  assert.match(ui.get('status').textContent, /网络连接暂不可用/);
});

test('升级 UI：编辑提案编号立即撤销旧提案操作权限和展示', async () => {
  const ui = await boot();
  await ui.click('connect');
  await ui.click('read-proposal');
  assert.equal(ui.get('approve').disabled, false);
  ui.input('proposal-id', '42');
  assertProposalCleared(ui);
});

test('升级 UI：钱包事件使等待中的连接和角色查询失效', async (t) => {
  for (const phase of ['connect', 'role'])
    await t.test(phase, async () => {
      const waiting = deferred();
      const ui = await boot({ overrides: { [phase]: () => waiting.promise } });
      const connecting = ui.click('connect');
      await microtasks();
      assert.ok(
        ui.calls.some((c) => c.method === phase),
        `${phase} request started`,
      );
      ui.walletEvent('accountsChanged');
      // connect() owns the post-approval account/network check; it rejects an
      // actual account change, while the UI itself guards a delayed role read.
      if (phase === 'connect') waiting.reject(new Error('账户已变化，请重新连接'));
      else waiting.resolve('治理成员');
      await connecting;
      assert.ok(
        !ui.get('role').textContent.includes(ACCOUNT),
        'obsolete connection must not reappear',
      );
      const before = ui.calls.filter((c) => c.method === 'proposal').length;
      await ui.click('read-proposal');
      assert.equal(
        ui.calls.filter((c) => c.method === 'proposal').length,
        before,
        'obsolete account must not authorize proposal reads',
      );
    });
});

test('升级 UI：钱包变化后迟到的机构、历史、提案响应不能重新显示', async (t) => {
  for (const operation of ['refresh', 'query', 'read-proposal'])
    await t.test(operation, async () => {
      const ui = await boot();
      await ui.click('connect');
      const waiting = deferred();
      ui.behavior[operation === 'read-proposal' ? 'proposal' : 'snapshot'] = () => waiting.promise;
      const reading = ui.click(operation);
      await microtasks();
      ui.walletEvent(operation === 'query' ? 'disconnect' : 'chainChanged');
      waiting.resolve(operation === 'read-proposal' ? proposal() : snapshot());
      await reading;
      assertHistoryCleared(ui);
      assertProposalCleared(ui);
      assert.ok(
        !ui.get('org-state').textContent.includes(ACCOUNT),
        'obsolete institution result must not reappear',
      );
    });
});

test('升级 UI：钱包变化后迟到的凭证报告不能显示或导出', async () => {
  const ui = await boot();
  await ui.click('connect');
  await ui.importPackage();
  const waiting = deferred();
  ui.behavior.verify = () => waiting.promise;
  const checking = ui.click('verify');
  await microtasks();
  ui.walletEvent('chainChanged');
  waiting.resolve(verification());
  await checking;
  assert.equal(ui.get('report').disabled, true);
  assert.ok(!ui.get('verdict').textContent.includes(String(OLD_BLOCK)));
});

test('升级 UI：广播后失败保留哈希，刷新恢复后仅用只读接口重查', async () => {
  const storage = memoryStorage();
  const ui = await boot({ storage });
  await ui.click('connect');
  ui.behavior.send = async () => {
    ui.adapter.onProgress({ state: '已广播', transactionHash: HASH, from: ACCOUNT });
    ui.adapter.onProgress({ state: '失败 / 状态未确认', message: 'RPC timeout' });
    throw Object.assign(new Error('RPC timeout after broadcast'), {
      transactionHash: HASH,
      from: ACCOUNT,
      phase: 'receipt',
      confirmed: false,
    });
  };
  await ui.click('issue');
  assert.equal(ui.get('transaction-panel').hidden, false);
  assert.equal(ui.get('transaction-hash').textContent, HASH);
  assert.match(ui.get('transaction-status').textContent, /未确认/);
  assert.equal(ui.get('check-transaction').disabled, false);
  const key = `proofpass:v3:transaction:11155111:${REGISTRY}`;
  const saved = JSON.parse(storage.getItem(key));
  assert.equal(saved.transactionHash, HASH);
  assert.equal(saved.from, ACCOUNT);
  assert.equal(saved.chainId, 11155111);
  assert.equal(saved.registryAddress, REGISTRY);
  assert.equal(ui.calls.filter((c) => c.method === 'send').length, 1);

  // A new VM is a page reload: no connection/account state is carried over.
  const reloaded = await boot({ storage });
  assert.equal(reloaded.get('transaction-hash').textContent, HASH);
  assert.match(reloaded.get('transaction-status').textContent, /历史交易.*重新查询/);
  reloaded.behavior.checkTransaction = async (hash, from) => {
    assert.equal(hash, HASH);
    assert.equal(from, ACCOUNT);
    return { transactionHash: hash, from, state: '待打包', confirmed: false };
  };
  await reloaded.click('check-transaction');
  assert.match(reloaded.get('transaction-status').textContent, /等待网络确认/);
  assert.ok(
    reloaded.calls.every((call) => call.method === 'checkTransaction'),
    'receipt recovery must not connect a wallet or resend a transaction',
  );

  reloaded.behavior.checkTransaction = async () => {
    throw Object.assign(new Error('still offline'), {
      transactionHash: HASH,
      from: ACCOUNT,
      phase: 'receipt',
      confirmed: false,
    });
  };
  await reloaded.click('check-transaction');
  assert.equal(reloaded.get('transaction-hash').textContent, HASH);
  assert.equal(JSON.parse(storage.getItem(key)).transactionHash, HASH);
  assert.match(reloaded.get('status').textContent, /网络连接暂不可用/);

  reloaded.behavior.checkTransaction = async () => ({
    transactionHash: HASH,
    from: ACCOUNT,
    state: '已入块成功',
    confirmed: true,
    receiptStatus: '0x1',
    blockNumber: 23456789,
    blockHash: BLOCK_HASH,
    finality: '未确认最终性',
  });
  await reloaded.click('check-transaction');
  assert.match(reloaded.get('transaction-status').textContent, /交易成功/);
  assert.match(reloaded.get('transaction-status').textContent, /23456789/);
  assert.ok(reloaded.calls.every((call) => call.method === 'checkTransaction'));
  assert.equal(
    reloaded.get('report').disabled,
    true,
    'a recovered receipt must not invent a current credential verification',
  );

  const again = await boot({ storage });
  assert.match(
    again.get('transaction-status').textContent,
    /历史交易.*重新查询/,
    'even a previously successful receipt is historical after reload',
  );
});

test('升级 UI：只读重查发现执行失败时保留交易定位且不显示成功', async () => {
  const storage = memoryStorage();
  storage.setItem(
    `proofpass:v3:transaction:11155111:${REGISTRY}`,
    JSON.stringify({
      transactionHash: HASH,
      from: ACCOUNT,
      chainId: 11155111,
      registryAddress: REGISTRY,
      state: '待打包',
      confirmed: false,
    }),
  );
  const ui = await boot({ storage });
  ui.behavior.checkTransaction = async () => {
    throw Object.assign(new Error('交易已入块但执行失败'), {
      transactionHash: HASH,
      from: ACCOUNT,
      phase: 'confirmed',
      confirmed: true,
      receiptStatus: '0x0',
      blockNumber: 23456789,
      blockHash: BLOCK_HASH,
    });
  };
  await ui.click('check-transaction');
  assert.equal(ui.get('transaction-hash').textContent, HASH);
  assert.match(ui.get('transaction-status').textContent, /执行失败/);
  assert.ok(!ui.get('transaction-status').textContent.includes('已入块成功'));
  assert.deepEqual(
    ui.calls.map((call) => call.method),
    ['checkTransaction'],
  );
});

test('升级 UI：跨机构导入同时切换查询目标并清除旧提案', async () => {
  const ui = await boot();
  await ui.click('connect');
  await ui.click('read-proposal');
  const next = packageFixture();
  next.payload.institution = OTHER_ORG;
  next.payload.credentialId = OTHER_ID;
  await ui.importPackage(next);
  assert.equal(ui.get('institution').value, OTHER_ORG);
  assert.equal(ui.get('history-id').value, OTHER_ID);
  assertProposalCleared(ui);
  await ui.click('query');
  const read = ui.calls.filter((c) => c.method === 'snapshot').at(-1);
  assert.deepEqual(read.args, [OTHER_ORG, OTHER_ID]);
});

test('升级 UI：导入失败清除旧凭证、历史与下载入口，并允许重选相同文件', async () => {
  const ui = await boot();
  await ui.importPackage();
  await ui.click('query');
  await ui.click('verify');
  ui.get('import').value = 'bad.json';
  await ui.importPackage('{broken');
  assertHistoryCleared(ui);
  for (const name of ['download', 'verify', 'report']) assert.equal(ui.get(name).disabled, true);
  assert.equal(ui.get('history-id').value, '');
  assert.equal(ui.get('import').value, '');
  assert.match(ui.get('package-info').textContent, /JSON/);
});

test('升级 UI：成功交易重新查询失败后不沿用旧确认结果', async () => {
  const ui = await boot();
  await ui.click('connect');
  ui.behavior.send = async () => {
    ui.adapter.onProgress({
      transactionHash: HASH,
      from: ACCOUNT,
      state: '已入块成功',
      confirmed: true,
      receiptStatus: '0x1',
      blockNumber: OLD_BLOCK,
      blockHash: BLOCK_HASH,
      finality: '已达 finalized 区块',
    });
    return { transactionHash: HASH };
  };
  await ui.click('issue');
  assert.match(ui.get('transaction-status').textContent, /网络已完成最终确认/);
  ui.behavior.checkTransaction = async () => {
    throw Object.assign(new Error('RPC unavailable'), { transactionHash: HASH, from: ACCOUNT });
  };
  await ui.click('check-transaction');
  assert.match(ui.get('transaction-status').textContent, /未确认/);
  assert.ok(!ui.get('transaction-status').textContent.includes('网络已完成最终确认'));
  const stored = JSON.parse(ui.storage.getItem(`proofpass:v3:transaction:11155111:${REGISTRY}`));
  assert.equal(stored.confirmed, false);
});

test('升级 UI：必填机构被折叠时自动展开并定位错误字段', async () => {
  const ui = await boot();
  ui.input('institution', '');
  await ui.click('query');
  assert.equal(ui.institutionDetails.open, true);
  assert.equal(ui.document.activeElement, ui.get('institution'));
  assert.equal(ui.calls.filter((c) => c.method === 'snapshot').length, 0);
});

test('升级 UI：无效有效期与更正编号在申请钱包交易前拦截', async (t) => {
  for (const value of ['', 'not-a-date', '2000-01-01T00:00'])
    await t.test(value || 'empty', async () => {
      const ui = await boot();
      await ui.click('connect');
      ui.input('expires', value);
      await ui.click('issue');
      assert.equal(ui.calls.filter((c) => c.method === 'send').length, 0);
      assert.equal(ui.get('expires').getAttribute('aria-invalid'), 'true');
    });
  await t.test('correction ID', async () => {
    const ui = await boot();
    await ui.click('connect');
    ui.get('operation').value = 'correct';
    ui.input('old-id', '0x123');
    ui.input('correction-reason', 'correct title');
    await ui.click('issue');
    assert.equal(ui.calls.filter((c) => c.method === 'send').length, 0);
    assert.equal(ui.get('old-id').getAttribute('aria-invalid'), 'true');
  });
});

test('升级 UI：地址锚点变化切换到对应工作区', async () => {
  const ui = await boot();
  ui.hashchange('#history');
  assert.equal(ui.get('history').hidden, false);
  assert.equal(ui.get('credentials').hidden, true);
  assert.equal(ui.get('tab-history').getAttribute('aria-selected'), 'true');
  ui.hashchange('#credentials');
  assert.equal(ui.get('credentials').hidden, false);
});

test('升级 UI：处理提案不要求填写无关机构，也不刷新其他机构', async (t) => {
  for (const current of ['', OTHER_ORG])
    await t.test(current ? 'other institution' : 'empty institution', async () => {
      const ui = await boot();
      await ui.click('connect');
      ui.input('institution', current);
      await ui.click('read-proposal');
      const reads = ui.calls.filter((c) => c.method === 'snapshot').length;
      ui.behavior.send = async () => ({ transactionHash: HASH });
      ui.behavior.proposal = async () => ({ ...proposal(), alreadyApproved: true, approvals: 2 });
      await ui.click('approve');
      assert.equal(ui.calls.filter((c) => c.method === 'send').length, 1);
      assert.equal(ui.calls.filter((c) => c.method === 'snapshot').length, reads);
      assert.equal(ui.get('status').textContent, '提案已批准');
    });
});
