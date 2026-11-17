// Read-only public-chain permission checks. eth_call simulates execution;
// it does not prove control of a sender and never creates a transaction receipt.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Interface, keccak256} from 'ethers';
import {recordEvidence, uniqueEvidenceName, writeTestOutput} from './evidence.mjs';
const argv=process.argv.slice(2);
const willRecord=argv.includes('--record'),force=argv.includes('--force');
const [otherInput,stage='before-authorization']=argv.filter(argument=>!argument.startsWith('--'));
const other=otherInput?.toLowerCase();
if(!/^0x[0-9a-f]{40}$/.test(other??'')||!['before-authorization','after-authorization','after-issue','after-revoke','after-disable'].includes(stage))throw Error('Expected institution B address and an audit stage');
const config=JSON.parse(fs.readFileSync('chain/config.json'));
const pkg=JSON.parse(fs.readFileSync('evidence/sepolia-test-package.json'));
const abi=new Interface(JSON.parse(fs.readFileSync('chain/abi.json')));
const a=pkg.payload.issuer,id=pkg.payload.credentialId;
assert.notEqual(other,a);assert.equal(config.chainId,11155111);
async function request(method,params=[]){
 const response=await fetch(config.rpcUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('HTTP '+response.status);return response.json();
}
async function rpc(method,params=[]){const j=await request(method,params);if(j.error)throw Error(JSON.stringify(j.error));return j.result;}
assert.equal(BigInt(await rpc('eth_chainId')),11155111n);
assert.equal(keccak256(await rpc('eth_getCode',[config.registryAddress,'latest'])),config.runtimeCodeHash);
const block=await rpc('eth_getBlockByNumber',['latest',false]);
const call=async(name,args)=>abi.decodeFunctionResult(name,await rpc('eth_call',[{to:config.registryAddress,data:abi.encodeFunctionData(name,args)},block.number]));
const [admin]=await call('admin',[]),[aEnabled]=await call('issuers',[a]),[bEnabled]=await call('issuers',[other]);
assert.equal(admin.toLowerCase(),a);assert.equal(aEnabled,true);
assert.equal(bEnabled,!['before-authorization','after-disable'].includes(stage));
const [aRecord]=await call('getRecord',[a,id]),[bRecord]=await call('getRecord',[other,id]);
const record=r=>({commitment:r.commitment,registeredAt:Number(r.registeredAt),validUntil:Number(r.validUntil),revoked:r.revoked});
const zero='0x'+'0'.repeat(64),fresh=keccak256(new TextEncoder().encode('ProofPass independent issuer fresh '+id));
if(stage!=='before-authorization'){
 const baseline=JSON.parse(fs.readFileSync('evidence/sepolia-permissions-before-authorization.json'));
 assert.equal(baseline.institutionB,other);assert.deepEqual(record(aRecord),baseline.records.a,'A record changed');
}
if(['before-authorization','after-authorization'].includes(stage))assert.equal(bRecord.commitment,zero);
if(['after-issue','after-revoke','after-disable'].includes(stage)){
 const plan=JSON.parse(fs.readFileSync('evidence/sepolia-institution-b-plan.json'));
 assert.equal(bRecord.commitment,plan.commitment);assert.equal(Number(bRecord.validUntil),plan.validUntil);
 assert.equal(bRecord.revoked,stage!=='after-issue');
 if(['after-revoke','after-disable'].includes(stage)){
  const issued=JSON.parse(fs.readFileSync('evidence/sepolia-permissions-after-issue.json'));
  assert.equal(issued.institutionB,other);
  assert.deepEqual(record(bRecord),{...issued.records.b,revoked:true},'B fields other than revoked changed');
 }
}
const digest=keccak256(new TextEncoder().encode('ProofPass independent B test '+id));
const expiry=BigInt(block.timestamp)+86400n*365n,checks=[];
async function check(label,from,name,args,reason){
 const tx={from,to:config.registryAddress,data:abi.encodeFunctionData(name,args),value:'0x0'};
 const result=await request('eth_call',[tx,block.number]);
 if(reason){
  assert.ok(result.error,label+': expected EVM revert');
  const error=result.error,data=typeof error.data==='string'?error.data:error.data?.data;
  let actual;
  if(data?.startsWith('0x08c379a0'))actual=abi.parseError(data)?.args[0];
  // Require the specific EVM revert reason, never classify transport errors as passes.
  assert.ok(actual===reason || (error.code===3&&error.message?.includes('execution reverted')&&error.message.includes(reason)),label+': unexpected error '+JSON.stringify(error));
 }else {assert.ok(!result.error,label+': '+JSON.stringify(result.error));assert.equal(result.result,'0x');}
 checks.push({label,kind:'eth_call simulation on actual public state; NOT a broadcast transaction',request:tx,expectedRevert:reason??null,response:result,passed:true});
}
await check('B cannot grant itself signing rights',other,'setIssuer',[other,true],'admin/zero');
await check('B cannot disable A',other,'setIssuer',[a,false],'admin/zero');
await check('A cannot issue zero ID',a,'issue',[zero,digest,expiry],'issuer/empty');
await check('A cannot issue zero commitment',a,'issue',[fresh,zero,expiry],'issuer/empty');
await check('A cannot issue an expired credential',a,'issue',[fresh,digest,1],'expiry/duplicate');
await check('A cannot overwrite or reactivate existing revoked ID',a,'issue',[id,digest,expiry],'expiry/duplicate');
if(!bEnabled){
 await check('Unauthorized or disabled B cannot issue',other,'issue',[fresh,digest,expiry],'issuer/empty');
 await check('Unauthorized or disabled B cannot revoke',other,'revoke',[id],'issuer/record');
}else if(bRecord.commitment===zero){
 await check('Authorized B can use A ID in its own empty namespace',other,'issue',[id,digest,expiry]);
 await check('B cannot revoke A-only ID',other,'revoke',[id],'issuer/record');
}else {
 await check('B cannot overwrite its existing ID',other,'issue',[id,digest,expiry],'expiry/duplicate');
 await check('B revoke only addresses B namespace',other,'revoke',[id],bRecord.revoked?'issuer/record':undefined);
}
assert.equal((await rpc('eth_getBlockByNumber',[block.number,false])).hash,block.hash);
const evidence={at:new Date().toISOString(),chainId:config.chainId,registryAddress:config.registryAddress,stage,block:{number:parseInt(block.number,16),hash:block.hash,timestamp:Number(BigInt(block.timestamp))},institutionA:a,institutionB:other,aEnabled,bEnabled,records:{a:record(aRecord),b:record(bRecord)},checks,limitations:['eth_call sender is a simulation parameter, not proof of wallet control','Only wallet-signed successful transactions establish independent account write evidence','Two test accounts do not establish real-world institutional identities']};
const draft=writeTestOutput(`sepolia-permissions-${stage}.json`,evidence);
if(willRecord){const saved=recordEvidence(draft,{as:uniqueEvidenceName(`sepolia-permissions-${stage}.json`,{force}),note:`机构 B 权限审计阶段 ${stage}，区块 ${evidence.block.number}`});console.log('已登记 evidence/'+saved.name);}else console.log('未写入 evidence/；如需登记加 --record');
console.log(JSON.stringify({stage,passed:checks.length,block:evidence.block,bEnabled,records:evidence.records},null,2));
