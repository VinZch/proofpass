import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { launchChromium } from './browser-launcher.mjs';
import { createLocalEvm } from './evm.mjs';
import { BrowserProvider, ContractFactory, keccak256 } from 'ethers';
import assert from 'node:assert/strict';
import { writeTestOutput, testOutputPath } from './evidence.mjs';
const root = process.cwd(),
  artifact = JSON.parse(fs.readFileSync('artifacts/ProofPassRegistry.json'));
fs.mkdirSync(path.dirname(testOutputPath('browser-results.json')), { recursive: true });
const rpc = createLocalEvm({ chainId: 11155111 }).provider;
const server = http.createServer((req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/chain/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) throw Error('path');
    res.setHeader(
      'Content-Type',
      {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
      }[path.extname(file)] || 'application/octet-stream',
    );
    res.end(fs.readFileSync(file));
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
let browser;
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const provider = new BrowserProvider(rpc),
    admin = await provider.getSigner(0),
    issuer = await provider.getSigner(1);
  const contract = await new ContractFactory(artifact.abi, artifact.bytecode, admin).deploy();
  await contract.waitForDeployment();
  const receipt = await contract.deploymentTransaction().wait();
  await (await contract.setIssuer(await issuer.getAddress(), true)).wait();
  const config = {
    mode: 'testnet',
    chainId: 11155111,
    chainName: 'LOCAL EVM TEST (not Sepolia deployment)',
    registryAddress: (await contract.getAddress()).toLowerCase(),
    deploymentTxHash: receipt.hash,
    runtimeCodeHash: keccak256(await provider.getCode(await contract.getAddress())),
    deploymentStatus: 'deployed',
    maxBlockAgeSeconds: 300,
    policyVersion: 'B-school-demo-1',
  };
  browser = await launchChromium();
  const errors = [];
  async function createSession(address) {
    const ctx = await browser.newContext({
      viewport: { width: 1360, height: 1000 },
      acceptDownloads: true,
    });
    await ctx.exposeBinding('testRPC', async (_, request) =>
      ['eth_accounts', 'eth_requestAccounts'].includes(request.method)
        ? [address]
        : rpc.request(request),
    );
    await ctx.addInitScript(() => {
      const metamask = { request: (request) => window.testRPC(request), on: () => {} };
      window.ethereum = {
        request: () => Promise.reject(new Error('Wrong injected wallet selected')),
        on: () => {},
      };
      window.addEventListener('eip6963:requestProvider', () =>
        window.dispatchEvent(
          new CustomEvent('eip6963:announceProvider', {
            detail: {
              info: { rdns: 'io.metamask', name: 'MetaMask test double' },
              provider: metamask,
            },
          }),
        ),
      );
    });
    await ctx.route('**/chain/config.json', (route) => route.fulfill({ json: config }));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + '/chain/index.html');
    return { ctx, page };
  }
  const a = await createSession(await issuer.getAddress());
  await a.page.getByRole('button', { name: '连接测试网钱包' }).click();
  await a.page.waitForFunction(() =>
    document.getElementById('account').textContent.includes('签发方'),
  );
  const downloadPromise = a.page.waitForEvent('download');
  await a.page.getByRole('button', { name: '登记到测试网' }).click();
  const download = await downloadPromise;
  const packagePath = testOutputPath('browser-test-package.json');
  await download.saveAs(packagePath);
  await a.page.getByRole('button', { name: '查询最新链上状态' }).click();
  await a.page.waitForFunction(() =>
    document.getElementById('result').textContent.includes('"technicalPass": true'),
  );
  await a.page.screenshot({ path: testOutputPath('browser-chain-desktop.png'), fullPage: true });
  const b = await createSession(await admin.getAddress());
  await b.page.locator('#import').setInputFiles(packagePath);
  await b.page.waitForFunction(() =>
    document.getElementById('packageInfo').textContent.includes('credentialId'),
  );
  await b.page.getByRole('button', { name: '查询最新链上状态' }).click();
  await b.page.waitForFunction(() =>
    document.getElementById('result').textContent.includes('"technicalPass": true'),
  );
  await a.page.getByRole('button', { name: '原签发方撤销' }).click();
  await a.page.waitForFunction(() =>
    document.getElementById('result').textContent.includes('已撤销，点击'),
  );
  await b.page.getByRole('button', { name: '查询最新链上状态' }).click();
  await b.page.waitForFunction(() =>
    document.getElementById('result').textContent.includes('已撤销'),
  );
  await b.page.setViewportSize({ width: 390, height: 844 });
  await b.page.screenshot({ path: testOutputPath('browser-chain-mobile.png'), fullPage: true });
  assert.equal(
    await b.page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  const c = await browser.newContext();
  await c.route('**/chain/config.json', (route) =>
    route.fulfill({
      json: {
        ...config,
        registryAddress: null,
        deploymentTxHash: null,
        runtimeCodeHash: null,
        deploymentStatus: 'not-deployed',
      },
    }),
  );
  const undeployed = await c.newPage();
  await undeployed.goto(base + '/chain/index.html');
  await undeployed.getByRole('button', { name: '连接测试网钱包' }).click();
  await undeployed.waitForFunction(() =>
    document.getElementById('notice').textContent.includes('尚未配置'),
  );
  assert.ok((await undeployed.locator('#deployment').textContent()).includes('尚未配置'));
  const offline = await c.newPage();
  offline.on('pageerror', (e) => errors.push(e.message));
  await offline.goto('file://' + root + '/ProofPass_跨校证书核验实验室.html');
  await offline.waitForFunction(() =>
    document.getElementById('credentialCard').textContent.includes('DEMO-'),
  );
  await offline.locator('#grantBtn').click();
  await offline.locator('#verifyBtn').click();
  await offline.waitForFunction(() =>
    document.getElementById('mainResult').textContent.includes('持有人未验证'),
  );
  await offline.screenshot({ path: testOutputPath('browser-offline.png'), fullPage: true });
  await offline.locator('[data-tab="hashlab"]').click();
  await offline
    .locator('#originalFile')
    .setInputFiles({ name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('abc') });
  await offline
    .locator('#comparedFile')
    .setInputFiles({ name: 'b.txt', mimeType: 'text/plain', buffer: Buffer.from('abc') });
  await offline.waitForFunction(() =>
    document.getElementById('fileResult').textContent.includes('指纹一致'),
  );
  assert.equal(
    await offline.locator('#originalHash').textContent(),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  await offline
    .locator('#comparedFile')
    .setInputFiles({ name: 'changed.txt', mimeType: 'text/plain', buffer: Buffer.from('abcd') });
  await offline.waitForFunction(() =>
    document.getElementById('fileResult').textContent.includes('指纹不一致'),
  );
  await offline.locator('[data-tab="governance"]').click();
  await offline.locator('#rehashChainBtn').click();
  await offline.waitForFunction(() =>
    document.getElementById('chainState').textContent.includes('历史已重写'),
  );
  await offline.locator('#auditChainBtn').click();
  await offline.waitForFunction(
    () => document.getElementById('chainState').textContent === '校验通过',
  );

  assert.deepEqual(errors, []);
  writeTestOutput('browser-results.json', {
    at: new Date().toISOString(),
    browser: await browser.version(),
    environment:
      'headless Chrome + local Ganache, config intercepted only by this test; NOT public testnet',
    checks: [
      'wallet role',
      'issue receipt + download',
      'technical verification with holder unverified',
      'second browser context imports and queries',
      'revocation visible across contexts',
      '390px no horizontal overflow',
      'unconfigured production page refuses writes',
      'offline file:// real Web Crypto',
      'file SHA-256 known vector, equal and unequal comparison',
      'rewrite-all-history counterexample remains structurally valid',
    ],
    pageErrors: errors,
  });
  console.log('Browser checks passed; outputs written to artifacts/test-output/ (not evidence/).');
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  await rpc.disconnect();
}
