import {TestnetContractAdapter} from '../chain/adapters.js';
import {is32,isAddress} from '../chain/protocol.js';
import {ZERO} from './protocol.js';
const orgPlain=o=>({key:o.key.toLowerCase(),epoch:Number(o.epoch),revision:Number(o.revision),enabled:o.enabled});
const recordPlain=r=>({commitment:r.commitment,registeredAt:Number(r.registeredAt),validUntil:Number(r.validUntil),issuedBy:r.issuedBy.toLowerCase(),keyEpoch:Number(r.keyEpoch),previousId:r.previousId,replacedBy:r.replacedBy,revokedAt:Number(r.revokedAt),revocationKind:Number(r.revocationKind),reasonHash:r.reasonHash});
export class GovernedAdapter extends TestnetContractAdapter {
  async guard(provider=this.readProvider) {
    if(this.config.mode!=='local-evm') return super.guard(provider);
    // Local mode is an explicit different chain, never a Sepolia simulation claim.
    if(this.config.chainId!==31337||!isAddress(this.config.registryAddress)||!is32(this.config.runtimeCodeHash)||!is32(this.config.deploymentTxHash)) throw new Error('本机部署配置错误');
    if(Number(BigInt(await this.rpc('eth_chainId',[],provider)))!==31337) throw new Error('本机测试链不匹配');
  }
  async snapshot(institution,id=ZERO) {
    if(!is32(institution)||!(is32(id)||id===ZERO)) throw new Error('机构编号或凭证编号格式有误，请复制并填写完整编号。');
    await this.getDeploymentInfo();
    const block=await this.rpc('eth_getBlockByNumber',['latest',false]);
    const timestamp=Number(BigInt(block.timestamp));
    if(!block.hash || Date.now()/1000-timestamp>300 || timestamp>Date.now()/1000+60) throw Object.assign(new Error('暂时无法获取最新链上状态，请稍后重试。'),{code:'STALE_BLOCK'});
    const [org,[r]]=await Promise.all([this.call('institutions',[institution],block.number),this.call('getRecord',[institution,id],block.number)]);
    if((await this.rpc('eth_getBlockByNumber',[block.number,false]))?.hash!==block.hash) throw new Error('链上记录正在更新，请重新查询。');
    return {institution:orgPlain(org),record:recordPlain(r),query:{mode:this.config.mode,chainId:this.config.chainId,registryAddress:this.config.registryAddress,blockNumber:Number(BigInt(block.number)),blockHash:block.hash,blockTimestamp:timestamp,at:new Date().toISOString()}};
  }
  async role(account) {const [[gov],[org]]=await Promise.all([this.call('governors',[account]),this.call('keyInstitution',[account])]);return (gov?'治理成员':'普通账户')+(org!==ZERO?' · 有机构登记记录（签发权限见机构信息）':'');}
  async proposal(id,account) {
    if(!Number.isSafeInteger(id)||id<1) throw new Error('提案编号无效');
    await this.getDeploymentInfo();
    const p=await this.call('proposals',[id]);
    if(p.deadline===0n) throw new Error('提案不存在');
    const [org,[threshold],[voted]]=await Promise.all([this.call('institutions',[p.institution]),this.call('threshold',[]),this.call('approved',[id,account])]);
    return {id,action:Number(p.action),institution:p.institution,key:p.key.toLowerCase(),enabled:p.enabled,credentialId:p.credentialId,reasonHash:p.reasonHash,revision:Number(p.revision),deadline:Number(p.deadline),approvals:Number(p.approvals),threshold:Number(threshold),executed:p.executed,cancelled:p.cancelled,stale:p.revision!==org.revision,alreadyApproved:voted};
  }
}
