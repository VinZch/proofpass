import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { writeTestOutput } from '../scripts/evidence.mjs';
import ganache from 'ganache';
import { BrowserProvider, ContractFactory, keccak256, ZeroAddress } from 'ethers';
import { TestnetContractAdapter } from '../chain/adapters.js';
import { commitment, random32, verifyPackage } from '../chain/protocol.js';
const artifact = JSON.parse(fs.readFileSync('artifacts/ProofPassRegistry.json'));
test('真实本地 EVM：权限、命名空间、撤销、停用、错误网络和跨会话查询', async () => {
  const rpc = ganache.provider({
    logging: { quiet: true },
    chain: { chainId: 11155111, hardfork: 'shanghai' },
    wallet: { totalAccounts: 4 },
  });
  try {
    const provider = new BrowserProvider(rpc);
    const admin = await provider.getSigner(0),
      issuer = await provider.getSigner(1),
      other = await provider.getSigner(2),
      stranger = await provider.getSigner(3);
    const contract = await new ContractFactory(artifact.abi, artifact.bytecode, admin).deploy();
    await contract.waitForDeployment();
    const deployment = await contract.deploymentTransaction().wait(),
      address = (await contract.getAddress()).toLowerCase();
    const config = {
      mode: 'testnet',
      chainId: 11155111,
      registryAddress: address,
      deploymentTxHash: deployment.hash,
      runtimeCodeHash: keccak256(await provider.getCode(address)),
      deploymentStatus: 'deployed',
      maxBlockAgeSeconds: 300,
    };
    const wallet = {
      request: async ({ method, params }) =>
        method === 'eth_accounts' || method === 'eth_requestAccounts'
          ? [await issuer.getAddress()]
          : rpc.request({ method, params }),
    };
    const progress = [];
    const adapter = new TestnetContractAdapter(config, artifact.abi, {
      readProvider: rpc,
      wallet,
      onProgress: (p) => progress.push(p),
      pollMs: 5,
    });
    await assert.rejects(contract.connect(stranger).setIssuer(await stranger.getAddress(), true));
    await (await contract.setIssuer(await issuer.getAddress(), true)).wait();
    await (await contract.setIssuer(await other.getAddress(), true)).wait();
    const id = random32(),
      digest = random32(),
      expiry = Math.floor(Date.now() / 1000) + 3600;
    await assert.rejects(contract.connect(stranger).issue(id, digest, expiry));
    await assert.rejects(contract.connect(issuer).issue('0x' + '0'.repeat(64), digest, expiry));
    await assert.rejects(contract.connect(issuer).issue(id, '0x' + '0'.repeat(64), expiry));
    await assert.rejects(contract.connect(issuer).issue(id, digest, 1));
    await assert.rejects(contract.connect(issuer).issue(id, digest, 2n ** 62n));
    const pkg = {
      payload: {
        schemaVersion: 2,
        chainId: config.chainId,
        registryAddress: address,
        issuer: (await issuer.getAddress()).toLowerCase(),
        credentialId: id,
        title: '虚构信息',
        category: '竞赛获奖',
        level: '省级一等奖',
        holderRef: '演示甲',
        validUntil: expiry,
      },
      salt: random32(),
    };
    const receipt = await adapter.issue(
      pkg.payload.issuer,
      id,
      await commitment(pkg, config),
      expiry,
    );
    assert.equal(receipt.receiptStatus, '0x1');
    assert.ok(progress.some((p) => p.state === '待钱包批准'));
    assert.ok(progress.some((p) => p.state === '已广播'));
    assert.equal((await verifyPackage(pkg, adapter, config)).technicalPass, true);
    await assert.rejects(contract.connect(issuer).issue(id, digest, expiry));
    await (await contract.connect(other).issue(id, digest, expiry)).wait();
    assert.equal((await contract.getRecord(await other.getAddress(), id)).commitment, digest);
    await assert.rejects(contract.connect(stranger).revoke(id));
    await (await contract.connect(other).revoke(id)).wait();
    assert.equal((await contract.getRecord(await issuer.getAddress(), id)).revoked, false);
    await adapter.revoke(pkg.payload.issuer, id);
    const secondSession = new TestnetContractAdapter(config, artifact.abi, { readProvider: rpc });
    assert.equal(
      (await verifyPackage(JSON.parse(JSON.stringify(pkg)), secondSession, config)).status,
      '已撤销',
    );
    await (await contract.setIssuer(await issuer.getAddress(), false)).wait();
    assert.equal((await secondSession.getRecord(pkg.payload.issuer, id)).exists, true);
    await assert.rejects(contract.connect(issuer).issue(random32(), digest, expiry));
    await assert.rejects(contract.connect(issuer).revoke(id));
    await assert.rejects(
      new TestnetContractAdapter({ ...config, chainId: 1 }, artifact.abi, {
        readProvider: rpc,
      }).getDeploymentInfo(),
      /拒绝主网/,
    );
    await assert.rejects(
      new TestnetContractAdapter(
        { ...config, registryAddress: (await stranger.getAddress()).toLowerCase() },
        artifact.abi,
        { readProvider: rpc },
      ).getDeploymentInfo(),
    );
    await assert.rejects(
      new TestnetContractAdapter({ ...config, runtimeCodeHash: random32() }, artifact.abi, {
        readProvider: rpc,
      }).getDeploymentInfo(),
    );
    await assert.rejects(
      new TestnetContractAdapter(config, artifact.abi, {
        readProvider: { request: () => new Promise(() => {}) },
        timeoutMs: 20,
      }).getDeploymentInfo(),
      /超时/,
    );
    await assert.rejects(contract.connect(issuer).transferAdmin(await stranger.getAddress()));
    await (await contract.transferAdmin(await stranger.getAddress())).wait();
    assert.equal(
      (await contract.pendingAdmin()).toLowerCase(),
      (await stranger.getAddress()).toLowerCase(),
    );
    await assert.rejects(contract.acceptAdmin());
    await assert.rejects(contract.connect(other).acceptAdmin());
    await assert.rejects(contract.connect(other).cancelAdminTransfer());
    await (await contract.connect(stranger).acceptAdmin()).wait();
    assert.equal(
      (await contract.admin()).toLowerCase(),
      (await stranger.getAddress()).toLowerCase(),
    );
    await assert.rejects(contract.connect(admin).setIssuer(await issuer.getAddress(), true));
    await (await contract.connect(stranger).setIssuer(await other.getAddress(), true)).wait();
    await (await contract.connect(stranger).transferAdmin(await other.getAddress())).wait();
    await (await contract.connect(stranger).cancelAdminTransfer()).wait();
    assert.equal(await contract.pendingAdmin(), ZeroAddress);
    writeTestOutput('local-evm.json', {
      environment: 'Ganache in-process ONLY; NOT public Sepolia',
      at: new Date().toISOString(),
      deployment: config,
      progress,
      verification: await verifyPackage(pkg, secondSession, config),
    });
  } finally {
    await rpc.disconnect();
  }
});
