// 部署校验：网络 / 配置 / 运行时代码 / 回执 / 区块一致性。
// 通过传入 adapter 调用其 rpc / getReceipt / guard，保持与 GovernedAdapter 的覆盖兼容。
import { keccak256 } from './vendor/ethers.js';
import { isAddress, is32 } from './protocol.js';
import { rpcQuantity } from './rpc.js';

export async function guardTestnet(adapter, provider = adapter.readProvider) {
  const config = adapter.config;
  if (config.mode !== 'testnet' || config.chainId !== 11155111)
    throw new Error('仅允许 Sepolia 测试网，拒绝主网');
  if (
    config.deploymentStatus !== 'deployed' ||
    !isAddress(config.registryAddress?.toLowerCase()) ||
    !is32(config.deploymentTxHash) ||
    !is32(config.runtimeCodeHash)
  ) {
    throw new Error('尚未配置已验证部署；未上链');
  }
  if (Number(BigInt(await adapter.rpc('eth_chainId', [], provider))) !== config.chainId)
    throw new Error('钱包 / RPC 网络错误');
}

export async function verifyDeploymentInfo(adapter) {
  await adapter.guard();
  const config = adapter.config;
  const [code, receipt] = await Promise.all([
    adapter.rpc('eth_getCode', [config.registryAddress, 'latest']),
    adapter.getReceipt(config.deploymentTxHash),
  ]);
  if (code === '0x' || keccak256(code) !== config.runtimeCodeHash)
    throw new Error('部署代码校验失败');
  const receiptNumber = rpcQuantity(receipt?.blockNumber);
  if (
    !receipt ||
    receiptNumber === null ||
    receipt.transactionHash?.toLowerCase() !== config.deploymentTxHash.toLowerCase() ||
    receipt.status !== '0x1' ||
    receipt.contractAddress?.toLowerCase() !== config.registryAddress.toLowerCase()
  ) {
    throw new Error('部署回执不匹配');
  }
  const block = await adapter.rpc('eth_getBlockByNumber', [receipt.blockNumber, false]);
  if (!block || block.hash !== receipt.blockHash || rpcQuantity(block.number) !== receiptNumber) {
    throw new Error('部署区块已重组或不可查询');
  }
  return {
    mode: config.mode,
    chainId: config.chainId,
    registryAddress: config.registryAddress,
    deploymentReceipt: receipt,
  };
}
