// 本地 EVM 的唯一入口。
//
// 目前使用 Ganache：纯 JS、无需系统二进制，本机与 CI 都能直接 `npm ci` 后运行。
// 已知限制：Ganache 已停止维护，其开发依赖带有 npm audit 告警；它只在测试进程内使用，
// 不进入 chain/ 静态站点，也不是生产依赖。
//
// 替换成 Anvil / Hardhat 时只需要改这个文件。调用方只依赖返回对象的三个成员：
//   provider   EIP-1193 兼容对象（可直接传给 ethers 的 BrowserProvider）
//   request    JSON-RPC 请求函数
//   disconnect 关闭本地链
import ganache from 'ganache';

export function createLocalEvm({ chainId = 31337, totalAccounts, blockGasLimit } = {}) {
  const options = { logging: { quiet: true }, chain: { chainId, hardfork: 'shanghai' } };
  if (totalAccounts) options.wallet = { totalAccounts };
  if (blockGasLimit) options.miner = { blockGasLimit };
  const provider = ganache.provider(options);
  return {
    provider,
    request: (payload) => provider.request(payload),
    disconnect: () => provider.disconnect(),
  };
}
