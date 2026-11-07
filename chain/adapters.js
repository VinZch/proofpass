import {Interface, keccak256} from './vendor/ethers.js?v=2b1ab550fac8a14e';
import {isAddress,is32} from './protocol.js?v=2b1ab550fac8a14e';
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
// JSON-RPC QUANTITY is a hex string, not a value to coerce with Number(null).
export function rpcQuantity(value) {
  if(typeof value!=='string'||!/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value))return null;
  const number=Number(value);return Number.isSafeInteger(number)?number:null;
}
function transactionError(error,context) {
  const source=error instanceof Error?error:new Error(String(error));
  const details={...context,...source.transactionContext};
  const result=new Error(source.message,{cause:source});
  if(source.code!==undefined)result.code=source.code;
  if(source.shortMessage)result.shortMessage=source.shortMessage;
  Object.assign(result,details);result.transactionContext=details;return result;
}
export class LedgerAdapter {
  issue(){throw new Error('Not implemented');} getRecord(){throw new Error('Not implemented');}
  revoke(){throw new Error('Not implemented');} getReceipt(){throw new Error('Not implemented');}
  getDeploymentInfo(){throw new Error('Not implemented');}
}
// Explicit demo-only storage. Never constructed by the testnet application.
export class LocalDemoAdapter extends LedgerAdapter {
  constructor(){super();this.records=new Map();}
  async issue(issuer,id,digest,validUntil){const key=issuer+':'+id;if(this.records.has(key))throw new Error('重复 ID');this.records.set(key,{commitment:digest,validUntil,revoked:false});return {mode:'local-demo',confirmedOnChain:false};}
  async getRecord(issuer,id){return {mode:'local-demo',...this.records.get(issuer+':'+id)};}
  async revoke(issuer,id){const record=this.records.get(issuer+':'+id);if(!record)throw new Error('未登记');record.revoked=true;}
  async getReceipt(){return null;} async getDeploymentInfo(){return {mode:'local-demo',confirmedOnChain:false};}
}
export class TestnetContractAdapter extends LedgerAdapter {
  constructor(config,abi,{readProvider,wallet,onProgress=()=>{},timeoutMs=15000,pollMs=2000}={}) {
    super();this.config=Object.freeze({...config});this.abi=new Interface(abi);this.wallet=wallet;this.onProgress=onProgress;this.timeoutMs=timeoutMs;this.pollMs=pollMs;this.busy=false;
    this.readProvider=readProvider || (config.rpcUrl?{request:async ({method,params})=>{
      const response=await fetch(config.rpcUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(timeoutMs)});
      if(!response.ok)throw new Error('RPC HTTP '+response.status);const data=await response.json();if(data.error)throw new Error(data.error.message);return data.result;
    }}:wallet);
  }
  async rpc(method,params=[],provider=this.readProvider) {
    if(!provider)throw new Error('未配置 RPC；请连接测试网钱包或配置只读 RPC');
    let timer;try{return await Promise.race([provider.request({method,params}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`RPC 超时（${provider===this.wallet?'钱包':'只读节点'} / ${method}），无法确认链上状态`)),this.timeoutMs);})]);}finally{clearTimeout(timer);}
  }
  async guard(provider=this.readProvider) {
    const c=this.config;
    if(c.mode!=='testnet'||c.chainId!==11155111)throw new Error('仅允许 Sepolia 测试网，拒绝主网');
    if(c.deploymentStatus!=='deployed'||!isAddress(c.registryAddress?.toLowerCase())||!is32(c.deploymentTxHash)||!is32(c.runtimeCodeHash))throw new Error('尚未配置已验证部署；未上链');
    if(Number(BigInt(await this.rpc('eth_chainId',[],provider)))!==c.chainId)throw new Error('钱包 / RPC 网络错误');
  }
  async getDeploymentInfo() {
    await this.guard();const c=this.config;
    const [code,receipt]=await Promise.all([this.rpc('eth_getCode',[c.registryAddress,'latest']),this.getReceipt(c.deploymentTxHash)]);
    if(code==='0x'||keccak256(code)!==c.runtimeCodeHash)throw new Error('部署代码校验失败');
    const receiptNumber=rpcQuantity(receipt?.blockNumber);
    if(!receipt||receiptNumber===null||receipt.transactionHash?.toLowerCase()!==c.deploymentTxHash.toLowerCase()||receipt.status!=='0x1'||receipt.contractAddress?.toLowerCase()!==c.registryAddress.toLowerCase())throw new Error('部署回执不匹配');
    const block=await this.rpc('eth_getBlockByNumber',[receipt.blockNumber,false]);
    if(!block||block.hash!==receipt.blockHash||rpcQuantity(block.number)!==receiptNumber)throw new Error('部署区块已重组或不可查询');
    return {mode:c.mode,chainId:c.chainId,registryAddress:c.registryAddress,deploymentReceipt:receipt};
  }
  async call(name,args,block='latest') {const data=await this.rpc('eth_call',[{to:this.config.registryAddress,data:this.abi.encodeFunctionData(name,args)},block]);return this.abi.decodeFunctionResult(name,data);}
  async getRecord(issuer,id) {
    if(!isAddress(issuer)||!is32(id))throw new Error('查询参数无效');
    await this.getDeploymentInfo();
    const block=await this.rpc('eth_getBlockByNumber',['latest',false]);
    if(!block?.hash || Date.now()/1000-Number(BigInt(block.timestamp))>(this.config.maxBlockAgeSeconds??300) || Number(BigInt(block.timestamp))>Date.now()/1000+60)throw new Error('区块过旧或时间异常，无法确认最新状态');
    const [r]=await this.call('getRecord',[issuer,id],block.number);
    const checked=await this.rpc('eth_getBlockByNumber',[block.number,false]);
    if(checked?.hash!==block.hash)throw new Error('查询期间区块重组，请重新查询');
    return {exists:r.commitment!=='0x'+'0'.repeat(64),commitment:r.commitment,registeredAt:Number(r.registeredAt),validUntil:Number(r.validUntil),revoked:r.revoked,blockTimestamp:Number(BigInt(block.timestamp)),query:{at:new Date().toISOString(),blockNumber:Number(BigInt(block.number)),blockHash:block.hash,chainId:this.config.chainId,registryAddress:this.config.registryAddress}};
  }
  async connect(){
    await this.getDeploymentInfo();
    if(!this.wallet)throw new Error('未检测到测试网钱包');
    const wallet=this.wallet;
    // Establish permission before querying an unconnected extension's network.
    // Human approval has no RPC deadline; keep the UI busy to prevent duplicates.
    const [account]=await wallet.request({method:'eth_requestAccounts',params:[]});
    if(!account)throw new Error('钱包没有账户');
    await this.guard(wallet);
    // Initial permission may emit accountsChanged. Compare the actual account
    // after approval/network checking instead of rejecting that normal event.
    const [current]=await this.rpc('eth_accounts',[],wallet);
    if(this.wallet!==wallet||!current||current.toLowerCase()!==account.toLowerCase())throw new Error('账户已变化，请重新连接');
    return current.toLowerCase();
  }
  async role(account){const [[admin],[issuer]]=await Promise.all([this.call('admin',[]),this.call('issuers',[account])]);return admin.toLowerCase()===account.toLowerCase()?'管理员'+(issuer?' / 签发方':''):issuer?'签发方':'只读审核员';}
  async getReceipt(hash){return this.rpc('eth_getTransactionReceipt',[hash]);}
  transactionContext(hash,account) {
    return {transactionHash:hash,from:account?.toLowerCase()??null,expectedAccount:account?.toLowerCase()??null,chainId:this.config.chainId,registryAddress:this.config.registryAddress,to:this.config.registryAddress,phase:'receipt',confirmed:false};
  }
  async _readTransactionResult(hash,expectedAccount) {
    const context=this.transactionContext(hash,expectedAccount),receipt=await this.getReceipt(hash);
    if(!receipt)return {...context,state:'待打包',queriedAt:new Date().toISOString()};
    if(receipt.transactionHash?.toLowerCase()!==hash.toLowerCase())throw new Error('交易回执哈希不匹配');
    if(!isAddress(receipt.from?.toLowerCase())||receipt.to?.toLowerCase()!==this.config.registryAddress.toLowerCase()||(expectedAccount&&receipt.from.toLowerCase()!==expectedAccount.toLowerCase()))throw new Error('交易回执地址不匹配');
    if(!['0x0','0x1'].includes(receipt.status))throw new Error('交易回执状态异常，尚无法确认');
    const receiptNumber=rpcQuantity(receipt.blockNumber);
    if(receiptNumber===null)throw new Error('交易回执区块编号无效，尚无法确认');
    const block=await this.rpc('eth_getBlockByNumber',[receipt.blockNumber,false]);
    if(!block||block.hash!==receipt.blockHash||rpcQuantity(block.number)!==receiptNumber)throw new Error('交易区块已重组或不匹配，请重新确认');
    const result={...context,from:receipt.from.toLowerCase(),state:'已入块成功',phase:'confirmed',confirmed:true,blockNumber:receiptNumber,blockHash:receipt.blockHash,receiptStatus:receipt.status,finality:'未确认最终性',queriedAt:new Date().toISOString()};
    if(receipt.status==='0x0')throw transactionError(new Error('交易已入块但执行失败：'+hash),{...result,state:'已入块执行失败'});
    try {const finalized=await this.rpc('eth_getBlockByNumber',['finalized',false]),number=rpcQuantity(finalized?.number);if(number!==null&&number>=receiptNumber)result.finality='已达 finalized 区块';}catch{}
    return result;
  }
  async checkTransaction(hash,expectedAccount) {
    const context=this.transactionContext(hash,expectedAccount);
    try {
      if(!is32(hash?.toLowerCase()))throw new Error('交易哈希格式错误');
      if(expectedAccount&&!isAddress(expectedAccount.toLowerCase()))throw new Error('交易发送者格式错误');
      await this.getDeploymentInfo();
      return await this._readTransactionResult(hash,expectedAccount);
    } catch(error){throw transactionError(error,context);}
  }
  async send(name,args,expectedAccount) {
    if(this.busy)throw new Error('已有写入进行中，请等待回执后再试');this.busy=true;
    const wallet=this.wallet;let changed=false;
    const changedDuringPreparation=()=>{changed=true;};
    const events=['accountsChanged','chainChanged','disconnect'],subscribed=[];
    const assertSession=()=>{if(changed||this.wallet!==wallet)throw new Error('钱包账户或网络已变化，请重新连接后重试');};
    let context={...this.transactionContext(null,expectedAccount),phase:'preparing',functionName:name,value:'0x0'};
    try {
      if(!wallet)throw new Error('未检测到测试网钱包');
      if(wallet.on)for(const event of events){wallet.on(event,changedDuringPreparation);subscribed.push(event);}
      await this.getDeploymentInfo();await this.guard(wallet);assertSession();
      const [account]=await this.rpc('eth_accounts',[],wallet);assertSession();
      if(!account || (expectedAccount&&account.toLowerCase()!==expectedAccount.toLowerCase()))throw new Error('账户已变化，请重新连接');
      context={...context,from:account.toLowerCase(),expectedAccount:account.toLowerCase()};
      const tx={from:account,to:this.config.registryAddress,data:this.abi.encodeFunctionData(name,args),value:'0x0',chainId:'0x'+this.config.chainId.toString(16)};
      await this.rpc('eth_call',[tx,'latest'],wallet);assertSession();
      // Simulation can outlive a wallet switch. Recheck both immediately before
      // requesting approval, and bind the transaction itself to the target chain.
      await this.guard(wallet);assertSession();
      const [current]=await this.rpc('eth_accounts',[],wallet);assertSession();
      if(!current||current.toLowerCase()!==account.toLowerCase())throw new Error('账户已变化，请重新连接');
      context.phase='wallet-approval';this.onProgress({...context,state:'待钱包批准'});assertSession();
      // Do not timeout a wallet approval request: a delayed approval must not trigger duplicate writes.
      const hash=await wallet.request({method:'eth_sendTransaction',params:[tx]});
      context={...context,transactionHash:hash,phase:'broadcast'};
      this.onProgress({...context,state:'已广播'});
      context.phase='receipt';this.onProgress({...context,state:'待打包'});
      const start=Date.now();let result;
      while(true){result=await this._readTransactionResult(hash,account);if(result.confirmed)break;if(Date.now()-start>120000)throw new Error('等待超时；请查询已广播交易回执，不要直接重发：'+hash);await sleep(this.pollMs);}
      result={...context,...result};
      this.onProgress(result);return result;
    } catch(error){const failure=transactionError(error,context);this.onProgress({...failure.transactionContext,state:failure.confirmed?'已入块执行失败':failure.code===4001?'用户拒绝':'失败 / 状态未确认',message:failure.message});throw failure;}finally{
      const remove=wallet?.removeListener??wallet?.off;
      if(remove)for(const event of subscribed)remove.call(wallet,event,changedDuringPreparation);
      this.busy=false;
    }
  }
  issue(issuer,id,digest,validUntil){return this.send('issue',[id,digest,validUntil],issuer);}
  revoke(issuer,id){return this.send('revoke',[id],issuer);}
  setIssuer(address,enabled,account){return this.send('setIssuer',[address,enabled],account);}
}
