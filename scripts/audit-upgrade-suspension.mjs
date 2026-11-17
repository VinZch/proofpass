// Read-only historical audit after execute(3). All write-method probes are eth_call.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Interface,AbiCoder,keccak256,toUtf8Bytes,toBeHex} from 'ethers';
import {ZERO,verifyPackage} from '../upgrade/protocol.js';
import {validateGovernanceEnvelope} from './verify-upgrade-governance.mjs';
const executionHash=process.argv[2];assert(/^0x[0-9a-fA-F]{64}$/.test(executionHash??''),'usage: node scripts/audit-upgrade-suspension.mjs executionTransactionHash');
const config=JSON.parse(fs.readFileSync('upgrade/config.json','utf8')),expected=JSON.parse(fs.readFileSync('deployment/upgrade-sepolia/suspension-expected.json','utf8'));
const abi=new Interface(JSON.parse(fs.readFileSync('upgrade/abi.json','utf8'))),same=(a,b)=>assert.equal(a.toLowerCase(),b.toLowerCase());
assert.equal(config.chainId,11155111);assert.equal(config.mode,'testnet');
let rpcId=0;const requests=[];
async function raw(method,params=[]){assert(['eth_chainId','eth_getTransactionByHash','eth_getTransactionReceipt','eth_getBlockByNumber','eth_getCode','eth_call'].includes(method));const response=await fetch(config.rpcUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++rpcId,method,params}),signal:AbortSignal.timeout(20000)});assert(response.ok);const result=await response.json();requests.push({method,params,response:result});return result;}
async function rpc(method,params=[]){const r=await raw(method,params);if(r.error)throw Error(JSON.stringify(r.error));return r.result;}
assert.equal(BigInt(await rpc('eth_chainId')),11155111n);
const [tx,receipt]=await Promise.all([rpc('eth_getTransactionByHash',[executionHash]),rpc('eth_getTransactionReceipt',[executionHash])]);assert.equal(receipt?.status,'0x1');
const tag=receipt.blockNumber,beforeTag=toBeHex(BigInt(tag)-1n),[block,beforeBlock]=await Promise.all([rpc('eth_getBlockByNumber',[tag,false]),rpc('eth_getBlockByNumber',[beforeTag,false])]);
validateGovernanceEnvelope({hash:executionHash,tx,receipt,block,registry:config.registryAddress,abi,name:'execute',args:[3]});same(tx.from,expected.executor);
same(keccak256(await rpc('eth_getCode',[config.registryAddress,tag])),config.runtimeCodeHash);
async function call(name,args,at=tag){return abi.decodeFunctionResult(name,await rpc('eth_call',[{to:config.registryAddress,data:abi.encodeFunctionData(name,args)},at]));}
const institutionId=expected.institution,[beforeOrg,org,proposal]=await Promise.all([call('institutions',[institutionId],beforeTag),call('institutions',[institutionId]),call('proposals',[3])]);
assert.equal(beforeOrg.enabled,true);assert.equal(org.enabled,false);same(org.key,beforeOrg.key);assert.equal(org.epoch,beforeOrg.epoch);assert.equal(org.revision,beforeOrg.revision+1n);
assert.equal(proposal.action,2n);assert.equal(proposal.enabled,false);assert.equal(proposal.executed,true);assert.equal(proposal.approvals,2n);assert.equal(proposal.revision,beforeOrg.revision);same(proposal.institution,institutionId);same(proposal.reasonHash,expected.reasonHash);
const logs=receipt.logs.filter(l=>l.address.toLowerCase()===config.registryAddress.toLowerCase());
for(const [name,check]of [['Executed',e=>assert.equal(e[0],3n)],['InstitutionChanged',e=>{same(e[0],institutionId);same(e[1],org.key);assert.equal(e[2],org.epoch);assert.equal(e[3],false);}]] ){
 const matching=logs.filter(l=>l.topics[0].toLowerCase()===abi.getEvent(name).topicHash.toLowerCase());assert.equal(matching.length,1);check(abi.parseLog(matching[0]).args);
}
const fields=['commitment','registeredAt','validUntil','issuedBy','keyEpoch','previousId','replacedBy','revokedAt','revocationKind','reasonHash'];
const plainRecord=r=>Object.fromEntries(fields.map(k=>[k,typeof r[k]==='bigint'?r[k].toString():r[k].toLowerCase()]));
const packagePaths=['evidence/upgrade-sepolia-original-package.json','evidence/upgrade-sepolia-corrected-package.json','evidence/upgrade-sepolia-key2-package.json'];
const recordChecks=[];
for(const path of packagePaths){const pkg=JSON.parse(fs.readFileSync(path,'utf8'));same(pkg.payload.institution,institutionId);const [[before],[after]]=await Promise.all([call('getRecord',[institutionId,pkg.payload.credentialId],beforeTag),call('getRecord',[institutionId,pkg.payload.credentialId])]);const prior=plainRecord(before),current=plainRecord(after);assert.deepEqual(current,prior,'suspension changed credential record');recordChecks.push({path,credentialId:pkg.payload.credentialId,before:prior,after:current,unchanged:true});}
const existingId=JSON.parse(fs.readFileSync(packagePaths[1],'utf8')).payload.credentialId;
const [[existing]]=await Promise.all([call('getRecord',[institutionId,existingId],beforeTag)]);assert.equal(existing.revocationKind,0n);assert(existing.validUntil>BigInt(block.timestamp));
const probe={id:keccak256(toUtf8Bytes('ProofPass TEST ONLY suspension probe '+executionHash)),digest:keccak256(toUtf8Bytes('ProofPass TEST ONLY simulation commitment '+executionHash)),reasonHash:keccak256(toUtf8Bytes('ProofPass TEST ONLY simulation reason '+executionHash)),validUntil:BigInt(block.timestamp)+86400n};
const [unused]=await call('getRecord',[institutionId,probe.id],beforeTag);same(unused.commitment,ZERO);
function reason(error){if(typeof error==='string'&&error.startsWith('0x08c379a0')){try{return AbiCoder.defaultAbiCoder().decode(['string'],'0x'+error.slice(10))[0];}catch{}}if(error&&typeof error==='object')for(const v of Object.values(error)){const r=reason(v);if(r)return r;}return null;}
const permissionChecks=[];
for(const [name,args]of [['issue',[institutionId,probe.id,probe.digest,probe.validUntil]],['revoke',[institutionId,existingId,probe.reasonHash]],['correct',[institutionId,existingId,probe.id,probe.digest,probe.validUntil,probe.reasonHash]]]){
 const request={to:config.registryAddress,from:org.key,value:'0x0',data:abi.encodeFunctionData(name,args)};
 const beforeResponse=await raw('eth_call',[request,beforeTag]);assert(!beforeResponse.error);assert.equal(beforeResponse.result,'0x');
 const afterResponse=await raw('eth_call',[request,tag]),decodedReason=reason(afterResponse.error);assert(afterResponse.error);assert.equal(decodedReason,'active issuer');
 permissionChecks.push({name,request,beforeBlockTag:beforeTag,beforeResponse,afterBlockTag:tag,afterResponse,decodedReason,passed:true,note:'Same calldata and current signing key; both are read-only simulations, no transaction submitted.'});
}
const numericFields=new Set(['registeredAt','validUntil','keyEpoch','revokedAt','revocationKind']);
const institution={key:org.key.toLowerCase(),epoch:Number(org.epoch),revision:Number(org.revision),enabled:org.enabled};
const adapter={async snapshot(id,credentialId){same(id,institutionId);const record=recordChecks.find(x=>x.credentialId===credentialId)?.after;assert(record);return {record:Object.fromEntries(Object.entries(record).map(([k,v])=>[k,numericFields.has(k)?Number(v):v])),institution,query:{mode:'testnet',chainId:11155111,registryAddress:config.registryAddress,blockNumber:Number(BigInt(tag)),blockHash:block.hash,blockTimestamp:Number(BigInt(block.timestamp)),at:new Date().toISOString(),scope:'fixed historical suspension receipt block'}};}};
const packageChecks=[];
for(let i=0;i<packagePaths.length;i++){const pkg=JSON.parse(fs.readFileSync(packagePaths[i],'utf8')),report=await verifyPackage(pkg,adapter,config);assert.equal(report.integrity,true);assert.equal(report.institutionEnabled,false);assert.equal(report.status,i===0?'已被更正版替代':'有效');assert.equal(report.technicalPass,i!==0);packageChecks.push({path:packagePaths[i],report,passed:true});}
for(const b of [beforeBlock,block])same((await rpc('eth_getBlockByNumber',[b.number,false])).hash,b.hash);
const evidence={at:new Date().toISOString(),passed:true,chainId:11155111,registryAddress:config.registryAddress,rpcSource:config.rpcUrl,executionTransactionHash:executionHash,tx,receipt,block,blockTag:tag,beforeBlock,beforeBlockTag:beforeTag,institution,probe,permissionChecks,recordChecks,packageChecks,requests,canonicalBlocksRechecked:true,limitations:'Issue/revoke/correct checks are eth_call simulations, not failed signed transactions. Suspension changes institution enabled status, not prior credential contents or validity. Historical snapshot only; real holder identity and school approval remain unverified.'};
const output='evidence/upgrade-sepolia-suspension-permissions.json';fs.writeFileSync(output,JSON.stringify(evidence,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');console.log(JSON.stringify({passed:true,output,snapshotBlock:Number(BigInt(tag)),enabled:org.enabled,permissionChecks:permissionChecks.length,unchangedRecords:recordChecks.length,packageStatuses:packageChecks.map(x=>x.report.status)}));
