// Read-only RPC verification; writes local config/evidence after checks. Never signs.
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {AbiCoder,keccak256,isAddress} from 'ethers';

const sameHash=(a,b)=>typeof a==='string'&&typeof b==='string'&&/^0x[0-9a-fA-F]{64}$/.test(a)&&a.toLowerCase()===b.toLowerCase();
const isQuantity=value=>typeof value==='string'&&/^0x[0-9a-fA-F]+$/.test(value);
export function validateDeploymentTransaction({hash,address,receipt,tx,expectedDeployer}) {
  if(receipt?.status!=='0x1'||receipt.contractAddress?.toLowerCase()!==address.toLowerCase()||tx?.to!==null)throw new Error('不是该合约的成功创建交易');
  if(!sameHash(receipt.transactionHash,hash)||!sameHash(tx.hash,hash))throw new Error('交易哈希与请求不匹配');
  if(!sameHash(tx.blockHash,receipt.blockHash)||!isQuantity(receipt.blockNumber)||!isQuantity(tx.blockNumber)||BigInt(tx.blockNumber)!==BigInt(receipt.blockNumber))throw new Error('交易与回执的区块不匹配');
  if(tx.chainId!=null&&(!isQuantity(tx.chainId)||BigInt(tx.chainId)!==11155111n))throw new Error('交易链 ID 不是 Sepolia');
  if(!isAddress(tx.from??''))throw new Error('交易发送者无效');
  const sender=tx.from.toLowerCase();
  if(receipt.from!=null&&receipt.from.toLowerCase()!==sender)throw new Error('交易与回执的发送者不匹配');
  if(expectedDeployer!=null&&(!isAddress(expectedDeployer)||expectedDeployer.toLowerCase()!==sender))throw new Error('部署发送者与预期钱包不匹配');
  return sender;
}
export function classifyFinality(receipt,finalizedBlock) {
  if(!isQuantity(finalizedBlock?.number)||!sameHash(finalizedBlock?.hash,finalizedBlock?.hash))return 'unknown';
  return BigInt(finalizedBlock.number)>=BigInt(receipt.blockNumber)?'finalized':'pending';
}

export async function verifyDeployment(args=process.argv.slice(2)) {
const [rpcUrl,addressInput,hash,ownersFile,thresholdInput,expectedDeployer]=args,address=addressInput?.toLowerCase(),threshold=Number(thresholdInput);
if(!/^https:\/\//.test(rpcUrl??'')||!isAddress(address??'')||!/^0x[0-9a-fA-F]{64}$/.test(hash??'')||!ownersFile||(expectedDeployer!=null&&!isAddress(expectedDeployer)))throw new Error('用法：node scripts/verify-upgrade-deployment.mjs https://RPC 合约地址 部署交易哈希 治理地址数组.json 阈值 [预期部署钱包地址]');
const owners=JSON.parse(fs.readFileSync(ownersFile,'utf8'));
if(!Array.isArray(owners)||owners.length!==3||!owners.every(a=>isAddress(a)&&!/^0x0+$/.test(a))||new Set(owners.map(a=>a.toLowerCase())).size!==owners.length||!Number.isInteger(threshold)||threshold!==2)throw new Error('治理成员或阈值无效');
async function rpc(method,params=[]){const response=await fetch(rpcUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error('RPC HTTP '+response.status);const r=await response.json();if(r.error)throw new Error(r.error.message);return r.result;}
if(BigInt(await rpc('eth_chainId'))!==11155111n)throw new Error('仅允许 Sepolia');
const [receipt,tx,code]=await Promise.all([rpc('eth_getTransactionReceipt',[hash]),rpc('eth_getTransactionByHash',[hash]),rpc('eth_getCode',[address,'latest'])]);
const sender=validateDeploymentTransaction({hash,address,receipt,tx,expectedDeployer});
const block=await rpc('eth_getBlockByNumber',[receipt.blockNumber,false]);if(!sameHash(block?.hash,receipt.blockHash)||!isQuantity(block?.number)||BigInt(block.number)!==BigInt(receipt.blockNumber))throw new Error('部署区块不匹配');
const artifact=JSON.parse(fs.readFileSync('artifacts/ProofPassGoverned.json','utf8'));
if(code.toLowerCase()!==artifact.runtimeBytecode.toLowerCase())throw new Error('升级合约运行时代码不匹配');
const expected=artifact.bytecode+AbiCoder.defaultAbiCoder().encode(['address[]','uint8'],[owners,threshold]).slice(2);
if(tx.input.toLowerCase()!==expected.toLowerCase())throw new Error('构造参数、治理成员顺序或编译字节码不匹配');
let finality;
try {
  const finalizedBlock=await rpc('eth_getBlockByNumber',['finalized',false]);
  finality={status:classifyFinality(receipt,finalizedBlock),checkedAt:new Date().toISOString(),finalizedBlock};
  if(finality.status==='unknown')finality.reason='RPC 未返回有效 finalized 区块';
} catch(error) {
  finality={status:'unknown',checkedAt:new Date().toISOString(),reason:String(error.message).slice(0,200)};
}
if(finality.status==='finalized') {
  const canonical=await rpc('eth_getBlockByNumber',[receipt.blockNumber,false]);
  if(!sameHash(canonical?.hash,receipt.blockHash))throw new Error('最终性复查时部署区块已变化');
}
const config={mode:'testnet',chainId:11155111,deploymentStatus:'deployed',registryAddress:address,deploymentTxHash:hash.toLowerCase(),runtimeCodeHash:keccak256(code),rpcUrl};
fs.writeFileSync('upgrade/config.json',JSON.stringify(config,null,2));
fs.writeFileSync('evidence/upgrade-sepolia-deployment.json',JSON.stringify({at:new Date().toISOString(),...config,governors:owners,threshold,sender,expectedDeployer:expectedDeployer?.toLowerCase()??null,receipt,tx,block,finality},null,2));
console.log('升级版 Sepolia 部署及治理参数已核对。最终性：'+finality.status+'。成功入块不等于最终确认；基础版配置未改动，业务流程验收仍需另行完成。');
}
if(process.argv[1]===fileURLToPath(import.meta.url))await verifyDeployment();
