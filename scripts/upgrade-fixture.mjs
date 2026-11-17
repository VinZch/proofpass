import fs from 'node:fs';
import { createLocalEvm } from './evm.mjs';
import { BrowserProvider, ContractFactory, keccak256, id, ZeroAddress, ZeroHash } from 'ethers';
export const artifact = JSON.parse(
  fs.readFileSync(new URL('../artifacts/ProofPassGoverned.json', import.meta.url)),
);
export async function fixture({ seed = false } = {}) {
  const rpc = createLocalEvm({
    chainId: 31337,
    totalAccounts: 8,
    blockGasLimit: 12000000,
  }).provider;
  const provider = new BrowserProvider(rpc, undefined, { cacheTimeout: -1 });
  const signers = await Promise.all(Array.from({ length: 8 }, (_, i) => provider.getSigner(i)));
  const addresses = await Promise.all(signers.map((s) => s.getAddress()));
  const contract = await new ContractFactory(artifact.abi, artifact.bytecode, signers[0]).deploy(
    addresses.slice(0, 3),
    2,
  );
  await contract.waitForDeployment();
  const receipt = await contract.deploymentTransaction().wait(),
    address = (await contract.getAddress()).toLowerCase();
  const config = {
    mode: 'local-evm',
    chainId: 31337,
    deploymentStatus: 'deployed',
    registryAddress: address,
    deploymentTxHash: receipt.hash,
    runtimeCodeHash: keccak256(await provider.getCode(address)),
    rpcUrl: '/rpc',
  };
  const orgA = id('ProofPass institution A TEST ONLY'),
    orgB = id('ProofPass institution B TEST ONLY');
  async function proposal(
    action,
    org,
    {
      key = ZeroAddress,
      enabled = false,
      credential = ZeroHash,
      reason = id('TEST ONLY governance reason'),
      deadline,
    } = {},
  ) {
    const block = await provider.getBlock('latest');
    await (
      await contract.propose(
        action,
        org,
        key,
        enabled,
        credential,
        reason,
        deadline ?? block.timestamp + 3600,
      )
    ).wait();
    return Number(await contract.proposalCount());
  }
  async function govern(action, org, fields = {}) {
    const n = await proposal(action, org, fields);
    await (await contract.connect(signers[1]).approve(n)).wait();
    await (await contract.execute(n)).wait();
    return n;
  }
  if (seed) {
    await govern(0, orgA, { key: addresses[3] });
    await govern(0, orgB, { key: addresses[4] });
  }
  const wallet = (index) => ({
    request: async ({ method, params = [] }) => {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [addresses[index]];
      if (method === 'eth_sendTransaction') {
        const tx = { ...params[0] };
        if (tx.from.toLowerCase() !== addresses[index].toLowerCase())
          throw new Error('wrong local sender');
        const gas = BigInt(await rpc.request({ method: 'eth_estimateGas', params: [tx] }));
        tx.gas = '0x' + ((gas * 13n) / 10n).toString(16);
        return rpc.request({ method, params: [tx] });
      }
      return rpc.request({ method, params });
    },
  });
  return {
    rpc,
    provider,
    signers,
    addresses,
    contract,
    config,
    orgA,
    orgB,
    proposal,
    govern,
    wallet,
    close: () => rpc.disconnect(),
  };
}
