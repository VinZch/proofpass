// Recompute saved independent-browser reports from their exact public-chain blocks.
// No browser control, wallet connection, signing, or transaction submission.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Interface, keccak256, toBeHex } from 'ethers';
import { verifyPackage } from '../upgrade/protocol.js';
const config = JSON.parse(fs.readFileSync('upgrade/config.json', 'utf8')),
  abi = new Interface(JSON.parse(fs.readFileSync('upgrade/abi.json', 'utf8')));
assert.equal(config.mode, 'testnet');
assert.equal(config.chainId, 11155111);
assert.equal(config.deploymentStatus, 'deployed');
const same = (a, b) => assert.equal(a.toLowerCase(), b.toLowerCase()),
  sha256 = (path) => createHash('sha256').update(fs.readFileSync(path)).digest('hex');
const cases = [
  {
    name: 'corrected-emergency-revoked',
    package: 'evidence/upgrade-sepolia-corrected-package.json',
    report: 'evidence/upgrade-sepolia-independent-corrected-revoked-report.json',
    screenshot: 'evidence/upgrade-sepolia-independent-revoked.jpg',
    status: '已紧急撤销',
    technicalPass: false,
    block: 12082327,
  },
  {
    name: 'original-replaced',
    package: 'evidence/upgrade-sepolia-original-package.json',
    report: 'evidence/upgrade-sepolia-independent-original-replaced-report.json',
    screenshot: 'evidence/upgrade-sepolia-independent-original.jpg',
    status: '已被更正版替代',
    technicalPass: false,
    block: 12082330,
  },
  {
    name: 'key2-unaffected-valid',
    package: 'evidence/upgrade-sepolia-key2-package.json',
    report: 'evidence/upgrade-sepolia-independent-key2-valid-report.json',
    screenshot: 'evidence/upgrade-sepolia-independent-key2.jpg',
    status: '有效',
    technicalPass: true,
    block: 12082332,
  },
];
let rpcId = 0;
const requests = [];
async function rpc(method, params = []) {
  assert(['eth_chainId', 'eth_getBlockByNumber', 'eth_getCode', 'eth_call'].includes(method));
  const response = await fetch(config.rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
    signal: AbortSignal.timeout(20000),
  });
  assert(response.ok);
  const result = await response.json();
  requests.push({ method, params, response: result });
  if (result.error) throw Error(JSON.stringify(result.error));
  return result.result;
}
assert.equal(BigInt(await rpc('eth_chainId')), 11155111n);
const recordPlain = (r) => ({
  commitment: r.commitment,
  registeredAt: Number(r.registeredAt),
  validUntil: Number(r.validUntil),
  issuedBy: r.issuedBy.toLowerCase(),
  keyEpoch: Number(r.keyEpoch),
  previousId: r.previousId,
  replacedBy: r.replacedBy,
  revokedAt: Number(r.revokedAt),
  revocationKind: Number(r.revocationKind),
  reasonHash: r.reasonHash,
});
const checks = [];
for (const item of cases) {
  const pkg = JSON.parse(fs.readFileSync(item.package, 'utf8')),
    report = JSON.parse(fs.readFileSync(item.report, 'utf8'));
  assert(fs.statSync(item.screenshot).size > 0);
  assert.equal(report.query.chainId, 11155111);
  same(report.query.registryAddress, config.registryAddress);
  assert.equal(report.query.blockNumber, item.block);
  const tag = toBeHex(item.block),
    block = await rpc('eth_getBlockByNumber', [tag, false]);
  same(block.hash, report.query.blockHash);
  assert.equal(Number(BigInt(block.number)), report.query.blockNumber);
  assert.equal(Number(BigInt(block.timestamp)), report.query.blockTimestamp);
  same(keccak256(await rpc('eth_getCode', [config.registryAddress, tag])), config.runtimeCodeHash);
  async function call(name, args) {
    return abi.decodeFunctionResult(
      name,
      await rpc('eth_call', [
        { to: config.registryAddress, data: abi.encodeFunctionData(name, args) },
        tag,
      ]),
    );
  }
  const [org, [r]] = await Promise.all([
    call('institutions', [pkg.payload.institution]),
    call('getRecord', [pkg.payload.institution, pkg.payload.credentialId]),
  ]);
  const institution = {
      key: org.key.toLowerCase(),
      epoch: Number(org.epoch),
      revision: Number(org.revision),
      enabled: org.enabled,
    },
    record = recordPlain(r);
  assert.equal(institution.enabled, false);
  assert.equal(institution.epoch, 2);
  assert.equal(institution.revision, 4);
  const adapter = {
    async snapshot(id, credentialId) {
      same(id, pkg.payload.institution);
      same(credentialId, pkg.payload.credentialId);
      return { institution, record, query: { ...report.query } };
    },
  };
  const recomputed = await verifyPackage(pkg, adapter, config);
  assert.deepEqual(
    recomputed,
    report,
    'saved browser report differs from fixed-block recomputation',
  );
  assert.equal(report.integrity, true);
  assert.equal(report.status, item.status);
  assert.equal(report.technicalPass, item.technicalPass);
  assert.equal(report.holder, '未验证');
  assert.equal(report.school, '未审批');
  same(
    (await rpc('eth_getBlockByNumber', [tag, false])).hash,
    block.hash,
    'canonical report block changed',
  );
  checks.push({
    ...item,
    packageSha256: sha256(item.package),
    reportSha256: sha256(item.report),
    screenshotSha256: sha256(item.screenshot),
    passed: true,
    report: report,
    reportPath: item.report,
    blockTag: tag,
    blockHeader: block,
    institution,
    record,
    canonicalBlockRechecked: true,
  });
}
const evidence = {
  at: new Date().toISOString(),
  passed: true,
  publicTestnetCrossBrowserTechnicalAcceptanceComplete: true,
  browser: 'ChatGPT in-app browser (IAB)',
  browserOperationProvenance:
    'Root agent created a separate IAB tab, imported the three saved v3 packages and exported these reports without connecting a wallet; screenshots were saved from those UI states.',
  walletConnected: false,
  independentRpcProvider: false,
  rpcSource: config.rpcUrl,
  chainId: 11155111,
  registryAddress: config.registryAddress,
  runtimeCodeHash: config.runtimeCodeHash,
  reportCount: checks.length,
  checks,
  requests,
  safariObservation: {
    scope: 'Earlier native Safari UI observation only, before emergency revocation',
    blockNumber: 12081643,
    status: '有效',
    integrity: true,
    institutionEnabled: false,
    reportSaved: false,
    exportResult: 'timed out; no downloaded Safari report saved',
    notSubstitutedForIabReports: true,
  },
  limitations:
    'Browser isolation is not independent RPC-provider validation: IAB and this audit use the same configured public RPC. Reports are fixed historical snapshots. These are technical test evidence, not team field photographs, real holder identity verification, or school approval. Per-transaction finality is recorded separately.',
};
const output = 'evidence/upgrade-sepolia-independent-browser-acceptance.json';
fs.writeFileSync(
  output,
  JSON.stringify(evidence, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2) + '\n',
);
console.log(
  JSON.stringify({
    passed: true,
    output,
    browser: evidence.browser,
    reportCount: checks.length,
    blocks: checks.map((c) => c.block),
    statuses: checks.map((c) => c.status),
    allIntegrity: true,
    institutionEnabled: false,
    independentRpcProvider: false,
  }),
);
