// JSON-RPC 基础工具：数量解析、带超时的 fetch provider、轮询间隔。
// 这些函数不持有状态，供 adapters / deployment / transaction 复用。

export const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

// JSON-RPC QUANTITY 是十六进制字符串；不能把 null / 空串当成 0。
export function rpcQuantity(value) {
  if (typeof value !== 'string' || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

export function createFetchProvider(rpcUrl, timeoutMs) {
  return {
    request: async ({ method, params }) => {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error('RPC HTTP ' + response.status);
      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      return data.result;
    },
  };
}
