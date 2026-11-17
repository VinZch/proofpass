import { TestnetContractAdapter } from './adapters.js';
import { random32, commitment, validatePackage, verifyPackage } from './protocol.js';
const $ = (id) => document.getElementById(id);
const config = await (await fetch('./config.json')).json(),
  abi = await (await fetch('./abi.json')).json();
let pkg = null,
  account = null,
  report = null,
  queryToken = 0,
  validUntil = 0,
  busy = false;
const history = [];
const discoveredWallets = new Map();
window.addEventListener('eip6963:announceProvider', (event) => {
  const detail = event.detail;
  if (detail?.info?.rdns && typeof detail.provider?.request === 'function')
    discoveredWallets.set(detail.info.rdns, detail);
});
window.dispatchEvent(new Event('eip6963:requestProvider'));
const observedWallets = new WeakSet();
function observeWallet(wallet) {
  if (!wallet || observedWallets.has(wallet)) return;
  observedWallets.add(wallet);
  wallet.on?.('accountsChanged', () => {
    account = null;
    $('account').textContent = '账户已变化，请重新连接';
    invalidate();
  });
  wallet.on?.('chainChanged', () => {
    account = null;
    invalidate('网络已变化，请重新连接并查询');
  });
  wallet.on?.('disconnect', () => invalidate('钱包连接中断，无法确认最新状态'));
}
function renderReport(r) {
  $('result').replaceChildren();
  const title = document.createElement('strong');
  title.textContent = r.technicalPass ? '技术核验通过' : '技术核验未通过';
  $('result').append(title);
  for (const [label, value] of [
    ['内容', r.integrity],
    ['状态', r.status === 'Active' ? '有效（本次查询）' : r.status],
    ['持有人', r.holder],
    ['学校审批', r.school.split('；')[0]],
  ]) {
    const row = document.createElement('p');
    const name = document.createElement('b');
    name.textContent = label + '：';
    row.append(name, document.createTextNode(value));
    $('result').append(row);
  }
  const detail = document.createElement('details'),
    summary = document.createElement('summary'),
    pre = document.createElement('pre');
  summary.textContent = '查看查询详情';
  pre.textContent = JSON.stringify(r, null, 2);
  detail.append(summary, pre);
  $('result').append(detail);
}
const adapter = new TestnetContractAdapter(config, abi, {
  wallet: discoveredWallets.get('io.metamask')?.provider || window.ethereum,
  onProgress: (entry) => {
    history.push(structuredClone(entry));
    $('transactions').textContent = JSON.stringify(history, null, 2);
    if (entry.transactionHash) $('receiptHash').value = entry.transactionHash;
  },
});
$('network').textContent =
  `${config.chainName} / ${config.chainId}\n${config.registryAddress || '未配置合约地址'}`;
if (config.deploymentStatus === 'deployed') {
  $('deployment').textContent = 'Sepolia · 已配置合约';
  $('notice').textContent = '连接测试钱包登记凭证，或导入凭证包查询。';
} else {
  $('deployment').textContent = '尚未配置合约';
  $('notice').textContent = '请先配置 Sepolia 合约，再连接钱包或查询凭证。';
}
$('expiry').value = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
function invalidate(message = '尚未核验') {
  queryToken++;
  report = null;
  validUntil = 0;
  $('result').textContent = message;
}
function showPackage() {
  const p = pkg.payload;
  $('packageInfo').textContent = JSON.stringify(
    {
      credentialId: p.credentialId,
      issuer: p.issuer,
      title: p.title,
      validUntil: p.validUntil,
      packageState: pkg.receipt ? '已附交易记录，点击查询最新状态' : '待查询登记状态',
    },
    null,
    2,
  );
}
function download(name, value) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function run(fn) {
  if (busy) return;
  busy = true;
  document.querySelectorAll('button').forEach((b) => (b.disabled = true));
  try {
    await fn();
    $('notice').textContent = '操作完成。';
  } catch (e) {
    invalidate('操作未完成：' + e.message);
    $('notice').textContent = e.message;
  } finally {
    busy = false;
    document.querySelectorAll('button').forEach((b) => (b.disabled = false));
  }
}
$('connect').onclick = () =>
  run(async () => {
    if (config.deploymentStatus !== 'deployed') await adapter.getDeploymentInfo();
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    const metamask = discoveredWallets.get('io.metamask');
    const wallet = metamask?.provider || (discoveredWallets.size === 0 ? window.ethereum : null);
    if (!wallet) throw new Error('未找到 MetaMask。请启用扩展后刷新，或直接导入凭证查询。');
    adapter.wallet = wallet;
    if (!config.rpcUrl) adapter.readProvider = wallet;
    observeWallet(wallet);
    account = await adapter.connect();
    $('account').textContent = account + ' / ' + (await adapter.role(account));
    $('deployment').textContent = 'Sepolia · 合约已核验';
  });
$('issueForm').onsubmit = (e) => {
  e.preventDefault();
  run(async () => {
    if (!account) throw new Error('请先连接测试钱包');
    invalidate();
    pkg = {
      payload: {
        schemaVersion: 2,
        chainId: config.chainId,
        registryAddress: config.registryAddress.toLowerCase(),
        issuer: account,
        credentialId: random32(),
        title: $('title').value,
        category: $('category').value,
        level: $('level').value,
        holderRef: $('holder').value,
        validUntil: Math.floor(Date.parse($('expiry').value + 'T23:59:59Z') / 1000),
      },
      salt: random32(),
    };
    const digest = await commitment(pkg, config);
    showPackage();
    pkg.receipt = await adapter.issue(
      account,
      pkg.payload.credentialId,
      digest,
      pkg.payload.validUntil,
    );
    showPackage();
    download('ProofPass-' + pkg.payload.credentialId.slice(2, 12) + '.json', pkg);
  });
};
$('import').onchange = () =>
  run(async () => {
    invalidate();
    pkg = null;
    const file = $('import').files[0];
    if (!file) return;
    if (file.size > 100000) throw new Error('凭证包超过 100 KB');
    const imported = JSON.parse(await file.text());
    validatePackage(imported, config);
    pkg = imported;
    showPackage();
  });
$('export').onclick = () =>
  run(async () => {
    if (!pkg) throw new Error('尚无凭证包');
    download('ProofPass-package.json', pkg);
  });
$('verify').onclick = () =>
  run(async () => {
    invalidate('正在查询最新区块…');
    if (!pkg) throw new Error('请先导入凭证包');
    const token = queryToken;
    const result = await verifyPackage(pkg, adapter, config);
    if (token !== queryToken) return;
    report = result;
    validUntil = Date.now() + 60000;
    renderReport(result);
    $('deployment').textContent = 'Sepolia · 合约已核验';
  });
$('revoke').onclick = () =>
  run(async () => {
    invalidate();
    if (!pkg || !account) throw new Error('请导入凭证并连接原签发钱包');
    if (account !== pkg.payload.issuer) throw new Error('只有原签发方可撤销');
    await adapter.revoke(account, pkg.payload.credentialId);
    $('result').textContent = '已撤销，点击“查询最新链上状态”查看。';
  });
for (const [id, enabled] of [
  ['enable', true],
  ['disable', false],
])
  $(id).onclick = () =>
    run(async () => {
      if (!account) throw new Error('请先连接管理员钱包');
      await adapter.setIssuer($('issuerAddress').value.trim(), enabled, account);
    });
$('receipt').onclick = () =>
  run(async () => {
    await adapter.getDeploymentInfo();
    const hash = $('receiptHash').value.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error('交易哈希格式错误');
    const receipt = await adapter.getReceipt(hash);
    history.push({
      queriedAt: new Date().toISOString(),
      receipt,
      state: receipt
        ? receipt.status === '0x1'
          ? '执行成功（最终性未确认）'
          : '执行失败'
        : '尚未查到回执，请稍后重查',
    });
    $('transactions').textContent = JSON.stringify(history, null, 2);
  });
$('report').onclick = () =>
  run(async () => {
    if (!report) throw new Error('请先重新查询');
    download('ProofPass-verification.json', report);
  });
window.addEventListener('offline', () => invalidate('网络离线，无法确认最新状态'));
setInterval(() => {
  if (validUntil && Date.now() > validUntil) invalidate('查询结果已超过 60 秒，请重新查询。');
}, 1000);
