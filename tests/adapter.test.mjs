import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {EventEmitter} from 'node:events';
import {TestnetContractAdapter} from '../chain/adapters.js';
const abi=JSON.parse(fs.readFileSync('chain/abi.json'));const account='0x'+'1'.repeat(40),registryAddress='0x'+'2'.repeat(40),hash='0x'+'3'.repeat(64),blockHash='0x'+'4'.repeat(64);
function setup(status='0x1',reject=false){const progress=[],txs=[];const wallet={request:async({method,params})=>{if(method==='eth_chainId')return '0xaa36a7';if(method==='eth_accounts')return [account];if(method==='eth_call')return '0x';if(method==='eth_sendTransaction'){txs.push(params[0]);if(reject)throw Object.assign(new Error('rejected'),{code:4001});return hash;}if(method==='eth_getTransactionReceipt')return {transactionHash:hash,status,from:account,to:registryAddress,blockNumber:'0x1',blockHash};if(method==='eth_getBlockByNumber')return {hash:blockHash,number:'0x1'};}};const a=new TestnetContractAdapter({mode:'testnet',chainId:11155111,deploymentStatus:'deployed',registryAddress,deploymentTxHash:hash,runtimeCodeHash:hash},abi,{wallet,readProvider:wallet,onProgress:p=>progress.push(structuredClone(p))});a.guard=async()=>{};a.getDeploymentInfo=async()=>{};return {a,progress,txs,wallet};}
test('状态 0、异常状态及钱包拒绝不会被宣称成功；禁止 ETH value',async()=>{for(const status of ['0x0','unexpected-status',undefined]){const {a,progress}=setup(status===undefined?null:status);await assert.rejects(a.issue(account,hash,hash,2000000000));assert.ok(!progress.some(p=>p.state==='已入块成功'));}const rejected=setup('0x1',true);await assert.rejects(rejected.a.issue(account,hash,hash,2000000000));assert.equal(rejected.progress.at(-1).state,'用户拒绝');const ok=setup();await ok.a.issue(account,hash,hash,2000000000);assert.equal(ok.txs[0].value,'0x0');});
test('并发提交拒绝、账户变更拒绝、失效区块与重组拒绝',async()=>{const {a}=setup();a.busy=true;await assert.rejects(a.issue(account,hash,hash,1),/已有写入/);a.busy=false;await assert.rejects(a.issue(registryAddress,hash,hash,1),/账户已变化/);a.rpc=async()=>({hash:blockHash,number:'0x1',timestamp:'0x1'});await assert.rejects(a.getRecord(account,hash),/区块过旧/);let calls=0;a.rpc=async()=>({hash:++calls===1?blockHash:hash,number:'0x1',timestamp:'0x'+Math.floor(Date.now()/1000).toString(16)});a.call=async()=>[{commitment:hash,registeredAt:1n,validUntil:2000000000n,revoked:false}];await assert.rejects(a.getRecord(account,hash),/重组/);});
test('钱包连接先取得账户授权，允许审批超过普通 RPC 时限，随后仍拒绝错误网络',async()=>{
 const order=[];let connected=false;
 const wallet={request:async({method})=>{order.push(method);if(method==='eth_requestAccounts'){await new Promise(r=>setTimeout(r,25));connected=true;return [account];}if(method==='eth_chainId'){assert.ok(connected);return '0xaa36a7';}if(method==='eth_accounts')return [account];}};
 const a=new TestnetContractAdapter({mode:'testnet',chainId:11155111,deploymentStatus:'deployed',registryAddress,deploymentTxHash:hash,runtimeCodeHash:hash},abi,{wallet,timeoutMs:5});a.getDeploymentInfo=async()=>{};
 assert.equal(await a.connect(),account);assert.deepEqual(order,['eth_requestAccounts','eth_chainId','eth_accounts']);
 wallet.request=async({method})=>method==='eth_requestAccounts'?[account]:'0x1';await assert.rejects(a.connect(),/网络错误/);
});

test('预检后重查网络与账户，交易明确绑定 Sepolia chainId',async()=>{
 const good=setup();await good.a.issue(account,hash,hash,2000000000);assert.equal(good.txs[0].chainId,'0xaa36a7');
 for(const change of ['network','account']){
  const {a,wallet,txs}=setup();const original=wallet.request;let simulated=false;
  a.guard=TestnetContractAdapter.prototype.guard.bind(a);
  wallet.request=async request=>{
   if(request.method==='eth_call'){simulated=true;return '0x';}
   if(simulated&&request.method==='eth_chainId'&&change==='network')return '0x1';
   if(simulated&&request.method==='eth_accounts'&&change==='account')return [registryAddress];
   return original(request);
  };
  await assert.rejects(a.issue(account,hash,hash,2000000000),change==='network'?/网络错误/:/账户已变化/);
  assert.equal(txs.length,0,change+' switch must not request approval');
 }
});

test('准备期间账户或网络切换后切回也中止，并移除监听器',async()=>{
 for(const event of ['accountsChanged','chainChanged','disconnect']){
  const {a,wallet,txs}=setup(),events=new EventEmitter(),original=wallet.request;
  wallet.on=events.on.bind(events);wallet.removeListener=events.removeListener.bind(events);
  wallet.request=async request=>{
   if(request.method==='eth_call'){events.emit(event);return '0x';}
   return original(request);
  };
  await assert.rejects(a.issue(account,hash,hash,2000000000),/钱包账户或网络已变化/);
  assert.equal(txs.length,0);assert.equal(a.busy,false);
  for(const name of ['accountsChanged','chainChanged','disconnect'])assert.equal(events.listenerCount(name),0);
 }
});

test('连接授权期间初始账户事件可接受，但校网后账户改变须重连',async()=>{
 const {a,wallet}=setup(),events=new EventEmitter();let current=account;
 wallet.on=events.on.bind(events);wallet.removeListener=events.removeListener.bind(events);
 wallet.request=async({method})=>{
  if(method==='eth_requestAccounts'){events.emit('accountsChanged',[account]);return [account];}
  if(method==='eth_accounts')return [current];
 };
 assert.equal(await a.connect(),account);
 a.guard=async()=>{current=registryAddress;};
 await assert.rejects(a.connect(),/账户已变化/);
});

test('广播后 RPC 失败保留哈希、发送者和阶段；只读重查可恢复且不再发送',async()=>{
 const {a,wallet,progress,txs}=setup(),original=wallet.request;let unavailable=true;
 wallet.request=async request=>{
  if(request.method==='eth_getTransactionReceipt'&&unavailable)throw new Error('read provider unavailable');
  return original(request);
 };
 await assert.rejects(a.issue(account,hash,hash,2000000000),error=>{
  assert.equal(error.transactionHash,hash);assert.equal(error.from,account);assert.equal(error.chainId,11155111);
  assert.equal(error.registryAddress,registryAddress);assert.equal(error.phase,'receipt');assert.equal(error.confirmed,false);return true;
 });
 assert.equal(progress.at(-1).transactionHash,hash);assert.equal(progress.at(-1).from,account);assert.equal(a.busy,false);
 const count=progress.length;unavailable=false;
 const restored=await a.checkTransaction(hash,account);
 assert.equal(restored.state,'已入块成功');assert.equal(restored.confirmed,true);assert.equal(restored.transactionHash,hash);
 assert.equal(txs.length,1);assert.equal(progress.length,count,'read-only recheck must not emit progress');
});

test('只读重查区分未入块、规范块执行失败和未确认异常',async()=>{
 const pending=setup();pending.a.getReceipt=async()=>null;
 assert.deepEqual(await pending.a.checkTransaction(hash,account).then(r=>[r.state,r.confirmed,r.from]),['待打包',false,account]);
 assert.equal(pending.txs.length,0);
 const failed=setup('0x0');
 await assert.rejects(failed.a.checkTransaction(hash,account),error=>{
  assert.equal(error.confirmed,true);assert.equal(error.receiptStatus,'0x0');assert.equal(error.blockHash,blockHash);assert.equal(error.transactionHash,hash);return true;
 });
 const wrongHash=setup();wrongHash.a.getReceipt=async()=>({transactionHash:blockHash,status:'0x1',from:account,to:registryAddress,blockNumber:'0x1',blockHash});
 await assert.rejects(wrongHash.a.checkTransaction(hash,account),error=>error.confirmed===false&&/哈希不匹配/.test(error.message));
 const reorg=setup('0x0'),original=reorg.wallet.request;
 reorg.wallet.request=async request=>request.method==='eth_getBlockByNumber'?{number:'0x1',hash}:original(request);
 await assert.rejects(reorg.a.checkTransaction(hash,account),error=>error.confirmed===false&&/重组/.test(error.message));
 const wrongSender=setup('0x0');
 await assert.rejects(wrongSender.a.checkTransaction(hash,registryAddress),error=>error.confirmed===false&&/地址不匹配/.test(error.message));
 const invalid=setup('unexpected');
 await assert.rejects(invalid.a.checkTransaction(hash,account),error=>error.confirmed===false&&/状态异常/.test(error.message));
});

test('部署读取绑定配置交易哈希与规范区块编号',async()=>{
 const {a}=setup();a.getDeploymentInfo=TestnetContractAdapter.prototype.getDeploymentInfo.bind(a);
 // Empty runtime code is not needed here: choose a real keccak match.
 const {keccak256}=await import('../chain/vendor/ethers.js');
 a.config={...a.config,runtimeCodeHash:keccak256('0x6000')};
 const receipt={transactionHash:hash,status:'0x1',contractAddress:registryAddress,blockHash,blockNumber:'0x1'};
 let current=receipt,block={hash:blockHash,number:'0x1'};
 a.getReceipt=async()=>current;
 a.rpc=async method=>method==='eth_getCode'?'0x6000':block;
 await a.getDeploymentInfo();
 current={...receipt,transactionHash:blockHash};
 await assert.rejects(a.getDeploymentInfo(),/部署回执/);
 current=receipt;block={hash:blockHash,number:'0x2'};
 await assert.rejects(a.getDeploymentInfo(),/部署区块/);
 for(const value of [null,undefined,'',false,0,'0','0x00','0x20000000000000']){
  current={...receipt,blockNumber:value};block={hash:blockHash,number:'0x0'};
  await assert.rejects(a.getDeploymentInfo(),/部署回执/);
  current={...receipt,blockNumber:'0x0'};block={hash:blockHash,number:value};
  await assert.rejects(a.getDeploymentInfo(),/部署区块/);
 }
});

test('交易重查拒绝空值区块编号且不伪造最终确认',async()=>{
 for(const value of [null,undefined,'',false,0,'0','0x00','0x20000000000000']){
  const {a,wallet}=setup(),original=wallet.request;
  a.getReceipt=async()=>({transactionHash:hash,status:'0x1',from:account,to:registryAddress,blockHash,blockNumber:value});
  await assert.rejects(a.checkTransaction(hash,account),error=>error.confirmed===false&&/区块编号/.test(error.message));
  a.getReceipt=async()=>({transactionHash:hash,status:'0x1',from:account,to:registryAddress,blockHash,blockNumber:'0x0'});
  wallet.request=async request=>request.method==='eth_getBlockByNumber'?{hash:blockHash,number:value}:original(request);
  await assert.rejects(a.checkTransaction(hash,account),error=>error.confirmed===false&&/交易区块/.test(error.message));
  wallet.request=async request=>request.method==='eth_getBlockByNumber'?{hash:blockHash,number:request.params[0]==='finalized'?value:'0x0'}:original(request);
  assert.equal((await a.checkTransaction(hash,account)).finality,'未确认最终性');
 }
});
