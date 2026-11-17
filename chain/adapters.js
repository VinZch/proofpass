// 链上适配器：本地演示、真实测试网两种实现。
// RPC / 部署校验 / 交易状态机拆到 rpc.js、deployment.js、transaction.js；
// 本文件只保留对外接口与业务方法。
import { Interface } from './vendor/ethers.js';
import { isAddress, is32 } from './protocol.js';
import { createFetchProvider, rpcQuantity } from './rpc.js';
import { guardTestnet, verifyDeploymentInfo } from './deployment.js';
import {
  readTransactionResult,
  sendTransaction,
  transactionContext,
  transactionError,
} from './transaction.js';

// 兼容旧导入路径：upgrade/adapter.js 仍从 './adapters.js' 取 rpcQuantity。
export { rpcQuantity };

export class LedgerAdapter {
  issue() {
    throw new Error('Not implemented');
  }
  getRecord() {
    throw new Error('Not implemented');
  }
  revoke() {
    throw new Error('Not implemented');
  }
  getReceipt() {
    throw new Error('Not implemented');
  }
  getDeploymentInfo() {
    throw new Error('Not implemented');
  }
}

// 明确标记的演示存储；真实测试网应用不会实例化它。
export class LocalDemoAdapter extends LedgerAdapter {
  constructor() {
    super();
    this.records = new Map();
  }
  async issue(issuer, id, digest, validUntil) {
    const key = issuer + ':' + id;
    if (this.records.has(key)) throw new Error('重复 ID');
    this.records.set(key, { commitment: digest, validUntil, revoked: false });
    return { mode: 'local-demo', confirmedOnChain: false };
  }
  async getRecord(issuer, id) {
    return { mode: 'local-demo', ...this.records.get(issuer + ':' + id) };
  }
  async revoke(issuer, id) {
    const record = this.records.get(issuer + ':' + id);
    if (!record) throw new Error('未登记');
    record.revoked = true;
  }
  async getReceipt() {
    return null;
  }
  async getDeploymentInfo() {
    return { mode: 'local-demo', confirmedOnChain: false };
  }
}

export class TestnetContractAdapter extends LedgerAdapter {
  constructor(
    config,
    abi,
    { readProvider, wallet, onProgress = () => {}, timeoutMs = 15000, pollMs = 2000 } = {},
  ) {
    super();
    this.config = Object.freeze({ ...config });
    this.abi = new Interface(abi);
    this.wallet = wallet;
    this.onProgress = onProgress;
    this.timeoutMs = timeoutMs;
    this.pollMs = pollMs;
    this.busy = false;
    this.readProvider =
      readProvider || (config.rpcUrl ? createFetchProvider(config.rpcUrl, timeoutMs) : wallet);
  }

  async rpc(method, params = [], provider = this.readProvider) {
    if (!provider) throw new Error('未配置 RPC；请连接测试网钱包或配置只读 RPC');
    let timer;
    try {
      return await Promise.race([
        provider.request({ method, params }),
        new Promise((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  `RPC 超时（${provider === this.wallet ? '钱包' : '只读节点'} / ${method}），无法确认链上状态`,
                ),
              ),
            this.timeoutMs,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async guard(provider = this.readProvider) {
    return guardTestnet(this, provider);
  }

  async getDeploymentInfo() {
    return verifyDeploymentInfo(this);
  }

  async call(name, args, block = 'latest') {
    const data = await this.rpc('eth_call', [
      { to: this.config.registryAddress, data: this.abi.encodeFunctionData(name, args) },
      block,
    ]);
    return this.abi.decodeFunctionResult(name, data);
  }

  async getRecord(issuer, id) {
    if (!isAddress(issuer) || !is32(id)) throw new Error('查询参数无效');
    await this.getDeploymentInfo();
    const block = await this.rpc('eth_getBlockByNumber', ['latest', false]);
    if (
      !block?.hash ||
      Date.now() / 1000 - Number(BigInt(block.timestamp)) >
        (this.config.maxBlockAgeSeconds ?? 300) ||
      Number(BigInt(block.timestamp)) > Date.now() / 1000 + 60
    ) {
      throw new Error('区块过旧或时间异常，无法确认最新状态');
    }
    const [record] = await this.call('getRecord', [issuer, id], block.number);
    const checked = await this.rpc('eth_getBlockByNumber', [block.number, false]);
    if (checked?.hash !== block.hash) throw new Error('查询期间区块重组，请重新查询');
    return {
      exists: record.commitment !== '0x' + '0'.repeat(64),
      commitment: record.commitment,
      registeredAt: Number(record.registeredAt),
      validUntil: Number(record.validUntil),
      revoked: record.revoked,
      blockTimestamp: Number(BigInt(block.timestamp)),
      query: {
        at: new Date().toISOString(),
        blockNumber: Number(BigInt(block.number)),
        blockHash: block.hash,
        chainId: this.config.chainId,
        registryAddress: this.config.registryAddress,
      },
    };
  }

  async connect() {
    await this.getDeploymentInfo();
    if (!this.wallet) throw new Error('未检测到测试网钱包');
    const wallet = this.wallet;
    // 先取得授权，再查询未连接扩展的网络；钱包批准没有 RPC 超时。
    const [account] = await wallet.request({ method: 'eth_requestAccounts', params: [] });
    if (!account) throw new Error('钱包没有账户');
    await this.guard(wallet);
    // 首次授权可能触发 accountsChanged，应在授权/网络检查之后比较真实账户。
    const [current] = await this.rpc('eth_accounts', [], wallet);
    if (this.wallet !== wallet || !current || current.toLowerCase() !== account.toLowerCase())
      throw new Error('账户已变化，请重新连接');
    return current.toLowerCase();
  }

  async role(account) {
    const [[admin], [issuer]] = await Promise.all([
      this.call('admin', []),
      this.call('issuers', [account]),
    ]);
    return admin.toLowerCase() === account.toLowerCase()
      ? '管理员' + (issuer ? ' / 签发方' : '')
      : issuer
        ? '签发方'
        : '只读审核员';
  }

  async getReceipt(hash) {
    return this.rpc('eth_getTransactionReceipt', [hash]);
  }

  transactionContext(hash, account) {
    return transactionContext(this.config, hash, account);
  }

  async _readTransactionResult(hash, expectedAccount) {
    return readTransactionResult({
      rpc: this.rpc.bind(this),
      getReceipt: this.getReceipt.bind(this),
      config: this.config,
      hash,
      expectedAccount,
    });
  }

  async checkTransaction(hash, expectedAccount) {
    const context = this.transactionContext(hash, expectedAccount);
    try {
      if (!is32(hash?.toLowerCase())) throw new Error('交易哈希格式错误');
      if (expectedAccount && !isAddress(expectedAccount.toLowerCase()))
        throw new Error('交易发送者格式错误');
      await this.getDeploymentInfo();
      return await this._readTransactionResult(hash, expectedAccount);
    } catch (error) {
      throw transactionError(error, context);
    }
  }

  async send(name, args, expectedAccount) {
    return sendTransaction(this, name, args, expectedAccount);
  }

  issue(issuer, id, digest, validUntil) {
    return this.send('issue', [id, digest, validUntil], issuer);
  }

  revoke(issuer, id) {
    return this.send('revoke', [id], issuer);
  }

  setIssuer(address, enabled, account) {
    return this.send('setIssuer', [address, enabled], account);
  }
}
