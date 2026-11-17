import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {setTimeout as delay} from 'node:timers/promises';
import {Interface} from 'ethers';

// Executes the shipped classic script. DOM/network are controlled; no browser,
// RPC, wallet, application transaction code, or filesystem mutation is involved.
const source = fs.readFileSync(new URL('../upgrade/bootstrap.js', import.meta.url), 'utf8');
const realAbi = JSON.parse(fs.readFileSync(new URL('../upgrade/abi.json', import.meta.url), 'utf8'));
const validConfig = {
  mode: 'testnet', chainId: 11155111, deploymentStatus: 'deployed',
  registryAddress: '0x' + '12'.repeat(20), deploymentTxHash: '0x' + '34'.repeat(32),
  runtimeCodeHash: '0x' + '56'.repeat(32), rpcUrl: 'https://rpc.example.test'
};

class Element {
  constructor(id, {hidden = false, disabled = false} = {}) {
    Object.assign(this, {id, hidden, disabled, inert: false, textContent: '', dataset: {}, listeners: new Map(), attributes: new Map()});
    const classes = new Set();
    this.classList = {add: name => classes.add(name), toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name)};
  }
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  scrollIntoView() { this.scrolled = true; }
  click() { if (!this.disabled) this.listeners.get('click')?.({preventDefault() {}}); }
}

function harness({protocol = 'http:', hostname = '127.0.0.1', config = validConfig, abi = realAbi, configStatus = 200, onAppImport} = {}) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, new Element(id));
    return elements.get(id);
  };
  for (const id of ['startup-retry', 'startup-local', 'startup-help']) element(id).hidden = true;
  const controls = [element('issue'), element('check-transaction'), element('report'), element('startup-retry')];
  element('check-transaction').disabled = true;
  element('report').disabled = true;
  element('startup-panel').contains = control => control.id === 'startup-retry';
  const tabs = ['credentials', 'evidence'].map(id => {
    const tab = element(`tab-${id}`); tab.dataset.tab = id; controls.push(tab); return tab;
  });
  const panels = ['credentials', 'evidence'].map(element);
  element('evidence').hidden = true;
  const calls = [], imports = [];
  let reloads = 0;
  const context = vm.createContext({
    document: {
      getElementById: element,
      querySelectorAll(selector) {
        if (selector === 'button,input,select,textarea') return controls;
        if (selector === '.panel[role="tabpanel"]') return panels;
        if (selector === '[data-tab]') return tabs;
        throw new Error(`Unexpected DOM query: ${selector}`);
      }
    },
    location: {protocol, hostname, href: `${protocol}//${hostname}/upgrade/`, reload: () => { reloads++; }},
    URL, AbortController, setTimeout, clearTimeout,
    fetch: async (name, options) => {
      calls.push({name, options});
      const status = name === 'config.json' ? configStatus : 200;
      return {ok: status >= 200 && status < 300, status, json: async () => name === 'config.json' ? config : abi};
    }
  });
  const script = new vm.Script(source, {
    filename: 'upgrade/bootstrap.js',
    importModuleDynamically: async specifier => {
      imports.push(specifier);
      assert.equal(typeof vm.SyntheticModule, 'function', 'Run module-success case with --experimental-vm-modules');
      let module;
      if (specifier === '../chain/vendor/ethers.js') {
        module = new vm.SyntheticModule(['Interface'], function () { this.setExport('Interface', Interface); }, {context});
      } else if (specifier.startsWith('./app.js?')) {
        module = new vm.SyntheticModule([], function () { onAppImport?.(element); }, {context});
      } else throw new Error(`Unexpected module: ${specifier}`);
      await module.link(() => { throw new Error('Unexpected nested import'); });
      await module.evaluate();
      return module;
    }
  });
  script.runInContext(context);
  return {
    element, calls, imports, controls, get reloads() { return reloads; },
    async finished() {
      const deadline = Date.now() + 2000;
      while (!element('startup-panel').hidden && element('startup-title').textContent !== '工作台未能启动') {
        assert.ok(Date.now() < deadline, 'Bootstrap did not reach success or visible failure');
        await delay(5);
      }
    }
  };
}

function assertRecoverableFailure(h, localEntry = true) {
  assert.equal(h.element('startup-panel').hidden, false);
  assert.equal(h.element('startup-title').textContent, '工作台未能启动');
  assert.equal(h.element('startup-retry').hidden, false);
  assert.equal(h.element('startup-retry').disabled, false);
  assert.equal(h.element('startup-local').hidden, !localEntry);
  assert.equal(h.element('startup-help').hidden, !localEntry);
  assert.equal(h.element('page-content').inert, false);
  assert.equal(h.element('workspace').inert, false);
  assert.ok(h.controls.filter(control => control.id !== 'startup-retry').every(control => control.disabled));
  assert.match(h.element('network').textContent, /尚未连接网络/);
  assert.match(h.element('role').textContent, /尚未连接钱包/);
  h.element('startup-evidence').click();
  assert.equal(h.element('evidence').hidden, false);
  assert.equal(h.element('credentials').hidden, true);
  assert.equal(h.element('evidence').scrolled, true);
  h.element('startup-retry').click();
  assert.equal(h.reloads, 1);
}

test('file URL fails visibly without fetch/import, while recovery and network information remain usable', async () => {
  const h = harness({protocol: 'file:'});
  await h.finished();
  assert.equal(h.calls.length, 0);
  assert.equal(h.imports.length, 0);
  assert.match(h.element('startup-message').textContent, /本地文件.*HTTP.*入口/);
  assertRecoverableFailure(h);
});

test('HTTP config 404 explains the failure and exposes retry/service entry before any app import', async () => {
  const h = harness({configStatus: 404});
  await h.finished();
  assert.match(h.element('startup-message').textContent, /配置暂不可用.*重新加载/);
  assert.equal(h.imports.length, 0);
  assertRecoverableFailure(h);
});

test('Public HTTPS failure retains recovery without sending visitors to their localhost', async () => {
  const h = harness({protocol: 'https:', hostname: 'example.github.io', configStatus: 404});
  await h.finished();
  assert.equal(h.imports.length, 0);
  assertRecoverableFailure(h, false);
});

test('Invalid configuration schema fails before modules load and cannot claim a connected wallet', async () => {
  const h = harness({config: {...validConfig, chainId: 1}});
  await h.finished();
  assert.match(h.element('startup-message').textContent, /配置暂不可用/);
  assert.equal(h.imports.length, 0);
  assertRecoverableFailure(h);
});

test('Malformed ABI schema fails with a visible actionable error', async () => {
  const h = harness({abi: {functions: []}});
  await h.finished();
  assert.match(h.element('startup-message').textContent, /配置暂不可用/);
  assert.equal(h.imports.length, 0);
  assertRecoverableFailure(h);
});

test('Successful app initialization retains its permission changes, then removes inert', {
  skip: typeof vm.SyntheticModule !== 'function' ? 'Use node --experimental-vm-modules --test tests/upgrade-bootstrap.test.mjs' : false
}, async () => {
  let appRan = false;
  const h = harness({onAppImport(element) {
    appRan = true;
    assert.equal(element('page-content').inert, true);
    assert.equal(element('workspace').inert, true);
    assert.equal(element('issue').disabled, false);
    assert.equal(element('check-transaction').disabled, true);
    // App permissions lock an operation and restore a pending transaction check.
    element('issue').disabled = true;
    element('check-transaction').disabled = false;
  }});
  await h.finished();
  assert.equal(appRan, true, h.element('startup-message').textContent);
  assert.equal(h.element('startup-panel').hidden, true);
  assert.equal(h.element('page-content').inert, false);
  assert.equal(h.element('workspace').inert, false);
  assert.equal(h.element('issue').disabled, true);
  assert.equal(h.element('check-transaction').disabled, false);
  assert.equal(h.element('report').disabled, true);
});
