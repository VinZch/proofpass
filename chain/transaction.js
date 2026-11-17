// 交易状态机：准备 / 钱包批准 / 广播 / 回执 / 最终性。
// 只依赖传入的 adapter 接口（rpc、getReceipt、guard、getDeploymentInfo、abi、wallet…），
// 便于基础版与升级版共用同一套“不把广播当成功”的规则。
import { isAddress } from './protocol.js';
import { rpcQuantity, sleep } from './rpc.js';

export function transactionError(error, context) {
  const source = error instanceof Error ? error : new Error(String(error));
  const details = { ...context, ...source.transactionContext };
  const result = new Error(source.message, { cause: source });
  if (source.code !== undefined) result.code = source.code;
  if (source.shortMessage) result.shortMessage = source.shortMessage;
  Object.assign(result, details);
  result.transactionContext = details;
  return result;
}

export function transactionContext(config, hash, account) {
  return {
    transactionHash: hash,
    from: account?.toLowerCase() ?? null,
    expectedAccount: account?.toLowerCase() ?? null,
    chainId: config.chainId,
    registryAddress: config.registryAddress,
    to: config.registryAddress,
    phase: 'receipt',
    confirmed: false,
  };
}

export async function readTransactionResult({ rpc, getReceipt, config, hash, expectedAccount }) {
  const context = transactionContext(config, hash, expectedAccount);
  const receipt = await getReceipt(hash);
  if (!receipt) return { ...context, state: '待打包', queriedAt: new Date().toISOString() };
  if (receipt.transactionHash?.toLowerCase() !== hash.toLowerCase())
    throw new Error('交易回执哈希不匹配');
  if (
    !isAddress(receipt.from?.toLowerCase()) ||
    receipt.to?.toLowerCase() !== config.registryAddress.toLowerCase() ||
    (expectedAccount && receipt.from.toLowerCase() !== expectedAccount.toLowerCase())
  ) {
    throw new Error('交易回执地址不匹配');
  }
  if (!['0x0', '0x1'].includes(receipt.status)) throw new Error('交易回执状态异常，尚无法确认');
  const receiptNumber = rpcQuantity(receipt.blockNumber);
  if (receiptNumber === null) throw new Error('交易回执区块编号无效，尚无法确认');
  const block = await rpc('eth_getBlockByNumber', [receipt.blockNumber, false]);
  if (!block || block.hash !== receipt.blockHash || rpcQuantity(block.number) !== receiptNumber) {
    throw new Error('交易区块已重组或不匹配，请重新确认');
  }
  const result = {
    ...context,
    from: receipt.from.toLowerCase(),
    state: '已入块成功',
    phase: 'confirmed',
    confirmed: true,
    blockNumber: receiptNumber,
    blockHash: receipt.blockHash,
    receiptStatus: receipt.status,
    finality: '未确认最终性',
    queriedAt: new Date().toISOString(),
  };
  if (receipt.status === '0x0')
    throw transactionError(new Error('交易已入块但执行失败：' + hash), {
      ...result,
      state: '已入块执行失败',
    });
  try {
    const finalized = await rpc('eth_getBlockByNumber', ['finalized', false]);
    const number = rpcQuantity(finalized?.number);
    if (number !== null && number >= receiptNumber) result.finality = '已达 finalized 区块';
  } catch {
    // finalized 只是附加信息；查询失败时保留“未确认最终性”。
  }
  return result;
}

export async function sendTransaction(adapter, name, args, expectedAccount) {
  if (adapter.busy) throw new Error('已有写入进行中，请等待回执后再试');
  adapter.busy = true;
  const wallet = adapter.wallet;
  let changed = false;
  const changedDuringPreparation = () => {
    changed = true;
  };
  const events = ['accountsChanged', 'chainChanged', 'disconnect'];
  const subscribed = [];
  const assertSession = () => {
    if (changed || adapter.wallet !== wallet)
      throw new Error('钱包账户或网络已变化，请重新连接后重试');
  };
  let context = {
    ...adapter.transactionContext(null, expectedAccount),
    phase: 'preparing',
    functionName: name,
    value: '0x0',
  };
  try {
    if (!wallet) throw new Error('未检测到测试网钱包');
    if (wallet.on) {
      for (const event of events) {
        wallet.on(event, changedDuringPreparation);
        subscribed.push(event);
      }
    }
    await adapter.getDeploymentInfo();
    await adapter.guard(wallet);
    assertSession();
    const [account] = await adapter.rpc('eth_accounts', [], wallet);
    assertSession();
    if (!account || (expectedAccount && account.toLowerCase() !== expectedAccount.toLowerCase()))
      throw new Error('账户已变化，请重新连接');
    context = { ...context, from: account.toLowerCase(), expectedAccount: account.toLowerCase() };
    const tx = {
      from: account,
      to: adapter.config.registryAddress,
      data: adapter.abi.encodeFunctionData(name, args),
      value: '0x0',
      chainId: '0x' + adapter.config.chainId.toString(16),
    };
    await adapter.rpc('eth_call', [tx, 'latest'], wallet);
    assertSession();
    // 模拟可能跨越钱包切换；在请求批准前再次核对网络和账户，并把交易绑定到目标链。
    await adapter.guard(wallet);
    assertSession();
    const [current] = await adapter.rpc('eth_accounts', [], wallet);
    assertSession();
    if (!current || current.toLowerCase() !== account.toLowerCase())
      throw new Error('账户已变化，请重新连接');
    context.phase = 'wallet-approval';
    adapter.onProgress({ ...context, state: '待钱包批准' });
    assertSession();
    // 钱包批准没有 RPC 超时：延迟批准不应触发重复写入。
    const hash = await wallet.request({ method: 'eth_sendTransaction', params: [tx] });
    context = { ...context, transactionHash: hash, phase: 'broadcast' };
    adapter.onProgress({ ...context, state: '已广播' });
    context.phase = 'receipt';
    adapter.onProgress({ ...context, state: '待打包' });
    const start = Date.now();
    let result;
    for (;;) {
      result = await adapter._readTransactionResult(hash, account);
      if (result.confirmed) break;
      if (Date.now() - start > 120000)
        throw new Error('等待超时；请查询已广播交易回执，不要直接重发：' + hash);
      await sleep(adapter.pollMs);
    }
    result = { ...context, ...result };
    adapter.onProgress(result);
    return result;
  } catch (error) {
    const failure = transactionError(error, context);
    adapter.onProgress({
      ...failure.transactionContext,
      state: failure.confirmed
        ? '已入块执行失败'
        : failure.code === 4001
          ? '用户拒绝'
          : '失败 / 状态未确认',
      message: failure.message,
    });
    throw failure;
  } finally {
    const remove = wallet?.removeListener ?? wallet?.off;
    if (remove)
      for (const event of subscribed) remove.call(wallet, event, changedDuringPreparation);
    adapter.busy = false;
  }
}
