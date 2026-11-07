/* Classic script: file:// must still explain why the module app cannot start. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const panel = byId('startup-panel');
  const controls = [...document.querySelectorAll('button,input,select,textarea')]
    .filter(control => !panel.contains(control));
  const initialDisabled = controls.map(control => control.disabled);
  const interactionRegions = [byId('page-content'), byId('workspace')];
  const setInitializing = value => interactionRegions.forEach(region => { region.inert = value; });
  controls.forEach(control => { control.disabled = true; });
  byId('startup-retry').addEventListener('click', () => location.reload());
  byId('startup-evidence').addEventListener('click', () => {
    document.querySelectorAll('.panel[role="tabpanel"]').forEach(section => {
      section.hidden = section.id !== 'evidence';
    });
    document.querySelectorAll('[data-tab]').forEach(tab => {
      const selected = tab.dataset.tab === 'evidence';
      tab.classList.toggle('selected', selected);
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    byId('page-title').textContent = '网络信息';
    byId('evidence').scrollIntoView({block: 'start'});
  });

  function fail(message) {
    setInitializing(false);
    controls.forEach(control => { control.disabled = true; });
    panel.hidden = false;
    byId('startup-title').textContent = '工作台未能启动';
    byId('startup-message').textContent = message;
    byId('startup-retry').hidden = false;
    const localEntry = location.protocol === 'file:' || ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
    byId('startup-local').hidden = !localEntry;
    byId('startup-help').hidden = !localEntry;
    byId('network').textContent = '尚未连接网络';
    byId('role').textContent = '尚未连接钱包';
    byId('status').textContent = '工作台暂不可用，请重试；网络信息仍可查看。';
    byId('status').classList.add('error');
    byId('working').hidden = true;
  }

  if (location.protocol === 'file:') {
    fail('本地文件无法直接启动工作台，请通过下方 HTTP 本机服务入口打开。');
    return;
  }
  if (!['http:', 'https:'].includes(location.protocol)) {
    fail('请通过网站地址或本机服务打开工作台。');
    return;
  }

  async function readJson(name) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(name, {signal: controller.signal, cache: 'no-store'});
      if (!response.ok) throw new Error(`${name} 加载失败（HTTP ${response.status}）。请检查网站服务与文件是否完整。`);
      try { return await response.json(); }
      catch (error) {
        if (error.name === 'AbortError') throw error;
        throw new Error(`${name} 不是有效的 JSON 文件。请恢复正确文件后重试。`);
      }
    } catch (error) {
      if (error.name === 'AbortError') throw new Error(`${name} 加载超时，请检查网络连接后重试。`);
      if (error instanceof TypeError) throw new Error(`${name} 无法读取，请检查网站服务和网络连接。`);
      throw error;
    } finally { clearTimeout(timeout); }
  }

  function validateConfig(config) {
    const invalid = reason => { throw new Error(`config.json 配置不完整或格式错误：${reason}。请恢复正确部署配置后重试。`); };
    if (!config || typeof config !== 'object' || Array.isArray(config)) invalid('应为配置对象');
    const local = config.mode === 'local-evm';
    if (!['local-evm', 'testnet'].includes(config.mode)) invalid('无法识别运行模式');
    if (config.chainId !== (local ? 31337 : 11155111)) invalid('模式与链 ID 不匹配');
    if (!['deployed', 'not-deployed'].includes(config.deploymentStatus)) invalid('缺少部署状态');
    const address = value => typeof value === 'string' && /^0x[0-9a-f]{40}$/i.test(value) && !/^0x0+$/i.test(value);
    const hash = value => typeof value === 'string' && /^0x[0-9a-f]{64}$/i.test(value) && !/^0x0+$/i.test(value);
    if (config.deploymentStatus === 'deployed') {
      if (!address(config.registryAddress) || !hash(config.deploymentTxHash) || !hash(config.runtimeCodeHash)) invalid('部署地址、交易哈希或运行时代码摘要无效');
    }
    if (typeof config.rpcUrl !== 'string' || !config.rpcUrl.trim()) invalid('缺少只读 RPC 地址');
    let rpc;
    try { rpc = new URL(config.rpcUrl, location.href); } catch { invalid('RPC 地址无效'); }
    if (!['http:', 'https:'].includes(rpc.protocol)) invalid('RPC 必须使用 HTTP 或 HTTPS');
    if (local && (location.hostname !== '127.0.0.1' || !Array.isArray(config.demo?.accounts) || !config.demo.accounts.length || !config.demo.accounts.every(address) || !hash(config.demo.orgA) || !hash(config.demo.orgB))) invalid('本机实验环境或演示账户配置不完整');
  }

  async function validateAbi(abi) {
    if (!Array.isArray(abi) || abi.length === 0 || abi.some(entry => !entry || typeof entry !== 'object' || typeof entry.type !== 'string')) {
      throw new Error('abi.json 合约接口格式错误。请恢复升级合约接口文件后重试。');
    }
    const {Interface} = await import('../chain/vendor/ethers.js?v=2b1ab550fac8a14e');
    const parsed = new Interface(abi);
    for (const name of ['institutions', 'getRecord', 'governors', 'keyInstitution', 'threshold', 'approved', 'proposals', 'issue', 'correct', 'revoke', 'propose', 'approve', 'execute', 'cancel']) {
      if (!parsed.getFunction(name)) throw new Error(`abi.json 缺少可解析的升级合约接口 ${name}，无法启动工作台。`);
    }
  }

  async function start() {
    try {
      const [config, abi] = await Promise.all([readJson('config.json'), readJson('abi.json')]);
      validateConfig(config);
      await validateAbi(abi);
      byId('startup-message').textContent = '正在加载工作台…';
      setInitializing(true);
      controls.forEach((control, index) => { control.disabled = initialDisabled[index]; });
      await import('./app.js?v=2b1ab550fac8a14e');
      setInitializing(false);
      panel.hidden = true;
    } catch (error) {
      const detail = String(error?.message || '');
      const message = /超时|无法读取|fetch|network/i.test(detail)
        ? '网络连接暂不可用，请检查网络后重新加载。'
        : /config\.json|abi\.json/.test(detail)
          ? '工作台配置暂不可用，请稍后重新加载；如仍无法打开，请联系网站维护者。'
          : '工作台加载失败，请重新加载；如仍无法打开，请联系网站维护者。';
      fail(message);
    }
  }
  start();
})();
