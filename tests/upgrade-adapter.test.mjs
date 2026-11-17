import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {GovernedAdapter} from '../upgrade/adapter.js';
const abi=JSON.parse(fs.readFileSync('upgrade/abi.json'));
const account='0x'+'1'.repeat(40), institution='0x'+'2'.repeat(64), blockHash='0x'+'3'.repeat(64), otherHash='0x'+'4'.repeat(64), zero='0x'+'0'.repeat(64);
function setup(){
 const block={number:'0x10',hash:blockHash,timestamp:'0x'+Math.floor(Date.now()/1000).toString(16)};
 const adapter=new GovernedAdapter({mode:'testnet',chainId:11155111},abi);
 adapter.getDeploymentInfo=async()=>{};
 adapter.rpc=async(method,params)=>{assert.equal(method,'eth_getBlockByNumber');return block;};
 const proposal={action:1n,institution,key:account,enabled:false,credentialId:zero,reasonHash:otherHash,revision:1n,deadline:BigInt(Math.floor(Date.now()/1000)+1000),approvals:1n,executed:false,cancelled:false};
 adapter.call=async(name,args,tag='latest')=>{
  if(name==='proposals')return proposal;
  if(name==='institutions')return {revision:tag==='latest'?2n:1n};
  if(name==='threshold')return [2n];
  if(name==='approved')return [tag==='latest'];
  throw new Error('unexpected function');
 };
 return {adapter,block};
}
test('提案查询在区块推进时仍显示同一时点的票数、投票及机构状态',async()=>{
 const {adapter}=setup();
 const result=await adapter.proposal(1,account);
 assert.equal(result.approvals,1);
 assert.equal(result.alreadyApproved,false,'a vote from the next block must not be mixed with the old tally');
 assert.equal(result.stale,false,'a later institution revision must not be mixed with the old proposal');
});
test('提案查询拒绝读取期间的区块重组',async()=>{
 const {adapter,block}=setup();
 adapter.rpc=async(method,[tag])=>({...block,hash:tag==='latest'?blockHash:otherHash});
 await assert.rejects(adapter.proposal(1,account),/重新查询/);
});
test('提案查询拒绝过旧、缺失和异常时间的区块',async()=>{
 for(const bad of [null,{number:'0x10',hash:blockHash,timestamp:'0x1'},{number:'0x10',hash:blockHash,timestamp:'invalid'}]){
  const {adapter}=setup();adapter.rpc=async()=>bad;
  await assert.rejects(adapter.proposal(1,account),error=>error.code==='STALE_BLOCK');
 }
});
test('区块编号和时间只接受标准安全范围的 RPC quantity，不把空值当作零',async()=>{
 const malformed=[null,undefined,'',false,16,'16','0x','0x00','0x01','-0x1','0x1.5','0x20000000000000'];
 for(const field of ['number','timestamp'])for(const value of malformed){
  const {adapter,block}=setup();adapter.rpc=async()=>({...block,[field]:value});
  await assert.rejects(adapter.latestBlock(),error=>error.code==='STALE_BLOCK',`${field}: ${String(value)}`);
 }
 // A legitimate zero quantity remains distinct from null and empty strings.
 const {adapter,block}=setup();adapter.rpc=async()=>({...block,number:'0x0'});
 assert.equal((await adapter.latestBlock()).number,'0x0');
 for(const value of malformed){
  adapter.rpc=async()=>({...block,number:value});
  await assert.rejects(adapter.confirmBlock({...block,number:'0x0'}),/重新查询/);
 }
});
