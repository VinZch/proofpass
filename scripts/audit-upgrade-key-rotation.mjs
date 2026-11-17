// Historical read-only permission and package audit after a verified rotation.
// Only eth_call is used for write-method simulations; no signer or send method exists.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Interface,AbiCoder,keccak256,toUtf8Bytes} from 'ethers';
import {ZERO,verifyPackage} from '../upgrade/protocol.js';
import {validateGovernanceEnvelope} from './verify-upgrade-governance.mjs';
const config=JSON.parse(fs.readFileSync('upgrade/config.json','utf8'));
const expected=JSON.parse(fs.readFileSync('deployment/upgrade-sepolia/rotation-expected.json','utf8'));
const previousSnapshot=JSON.parse(fs.readFileSync('evidence/upgrade-sepolia-rotation-two-votes.json','utf8'));
assert.equal(config.chainId,11155111);assert.equal(config.mode,'testnet');assert.equal(previousSnapshot.passed,true);assert.equal(previousSnapshot.proposal.executed,false);
const same=(a,b,message)=>assert.equal(a.toLowerCase(),b.toLowerCase(),message);
same(config.registryAddress,previousSnapshot.registryAddress);
const abi=new Interface(JSON.parse(fs.readFileSync('upgrade/abi.json','utf8'))),institutionId=expected.institution;
const oldKey=previousSnapshot.institution.key,newKey=expected.key,requests=[];let rpcId=0;
const executionHash=process.argv[2]??'0xdd4c86215d20f259a12aaba848ecc7cdd9daf420b2238ec96f8af71b177d10de';
async function raw(method,params=[]){assert(['eth_chainId','eth_getTransactionByHash','eth_getTransactionReceipt','eth_getBlockByNumber','eth_getCode','eth_call'].includes(method));const response=await fetch(config.rpcUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++rpcId,method,params}),signal:AbortSignal.timeout(20000)});assert(response.ok);const result=await response.json();requests.push({method,params,response:result});return result;}
async function rpc(method,params=[]){const result=await raw(method,params);if(result.error)throw Error(JSON.stringify(result.error));return result.result;}
assert.equal(BigInt(await rpc('eth_chainId')),11155111n);
const [tx,receipt]=await Promise.all([rpc('eth_getTransactionByHash',[executionHash]),rpc('eth_getTransactionReceipt',[executionHash])]);assert.equal(receipt?.status,'0x1');
const tag=receipt.blockNumber,block=await rpc('eth_getBlockByNumber',[tag,false]);
validateGovernanceEnvelope({hash:executionHash,tx,receipt,block,registry:config.registryAddress,abi,name:'execute',args:[2]});same(tx.from,expected.executor);
same(keccak256(await rpc('eth_getCode',[config.registryAddress,tag])),config.runtimeCodeHash);
async function call(name,args){return abi.decodeFunctionResult(name,await rpc('eth_call',[{to:config.registryAddress,data:abi.encodeFunctionData(name,args)},tag]));}
const [org,[oldKeyInstitution],[newKeyInstitution]]=await Promise.all([call('institutions',[institutionId]),call('keyInstitution',[oldKey]),call('keyInstitution',[newKey])]);
same(org.key,newKey);assert.equal(org.epoch,2n);assert.equal(org.revision,2n);assert.equal(org.enabled,true);same(oldKeyInstitution,institutionId,'retired key reservation lost');same(newKeyInstitution,institutionId,'new key mapping missing');
const proposal=await call('proposals',[2]);assert.equal(proposal.executed,true);assert.equal(proposal.approvals,2n);assert.equal(proposal.action,1n);same(proposal.institution,institutionId);same(proposal.key,newKey);same(proposal.reasonHash,expected.reasonHash);
const events=receipt.logs.filter(l=>l.address.toLowerCase()===config.registryAddress.toLowerCase()).map(l=>abi.parseLog(l));
const executed=events.filter(e=>e.name==='Executed');assert.equal(executed.length,1);assert.equal(executed[0].args[0],2n);
const changed=events.filter(e=>e.name==='InstitutionChanged');assert.equal(changed.length,1);same(changed[0].args[0],institutionId);same(changed[0].args[1],newKey);assert.equal(changed[0].args[2],2n);assert.equal(changed[0].args[3],true);
const probe={id:keccak256(toUtf8Bytes('ProofPass TEST ONLY read-only rotation probe: '+executionHash)),digest:keccak256(toUtf8Bytes('ProofPass TEST ONLY synthetic commitment for eth_call only: '+executionHash)),validUntil:BigInt(block.timestamp)+86400n};
const [probeBefore]=await call('getRecord',[institutionId,probe.id]);same(probeBefore.commitment,ZERO);
const data=abi.encodeFunctionData('issue',[institutionId,probe.id,probe.digest,probe.validUntil]);
function reason(error){if(typeof error==='string'&&error.startsWith('0x08c379a0')){try{return AbiCoder.defaultAbiCoder().decode(['string'],'0x'+error.slice(10))[0];}catch{}}if(error&&typeof error==='object')for(const v of Object.values(error)){const decoded=reason(v);if(decoded)return decoded;}return null;}
const permissionChecks=[];
for(const [name,from,expectedReason]of [['retired-key-rejected',oldKey,'active issuer'],['current-key-can-issue',newKey,null]]){
 const request={to:config.registryAddress,from,value:'0x0',data},response=await raw('eth_call',[request,tag]),decodedReason=reason(response.error);
 if(expectedReason){assert(response.error);assert.equal(decodedReason,expectedReason);}else{assert(!response.error);assert.equal(response.result,'0x');}
 permissionChecks.push({name,method:'eth_call',blockTag:tag,...request,response,decodedReason,expectedReason,passed:true});
}
assert.equal(permissionChecks[0].data,permissionChecks[1].data,'probes must only differ by sender');
const [probeAfter]=await call('getRecord',[institutionId,probe.id]);same(probeAfter.commitment,ZERO,'simulation must not create record');
const recordPlain=r=>({commitment:r.commitment,registeredAt:Number(r.registeredAt),validUntil:Number(r.validUntil),issuedBy:r.issuedBy.toLowerCase(),keyEpoch:Number(r.keyEpoch),previousId:r.previousId,replacedBy:r.replacedBy,revokedAt:Number(r.revokedAt),revocationKind:Number(r.revocationKind),reasonHash:r.reasonHash});
const institution={key:org.key.toLowerCase(),epoch:Number(org.epoch),revision:Number(org.revision),enabled:org.enabled};
const records=[];
const adapter={async snapshot(id,credentialId){same(id,institutionId);const [r]=await call('getRecord',[id,credentialId]);const record=recordPlain(r);records.push({institution:id,credentialId,record});return {institution,record,query:{mode:'testnet',chainId:11155111,registryAddress:config.registryAddress,blockNumber:Number(BigInt(tag)),blockHash:block.hash,blockTimestamp:Number(BigInt(block.timestamp)),at:new Date().toISOString(),scope:'fixed historical rotation receipt block'}};}};
const packageChecks=[];
for(const [path,expectedStatus,expectedPass]of [['evidence/upgrade-sepolia-original-package.json','已被更正版替代',false],['evidence/upgrade-sepolia-corrected-package.json','有效',true]]){
 const pkg=JSON.parse(fs.readFileSync(path,'utf8'));const report=await verifyPackage(pkg,adapter,config);assert.equal(report.integrity,true);assert.equal(report.status,expectedStatus);assert.equal(report.technicalPass,expectedPass);same(report.currentKey,newKey);same(report.issuer,oldKey);assert.equal(report.keyEpoch,1);packageChecks.push({path,report,passed:true});
}
same((await rpc('eth_getBlockByNumber',[tag,false])).hash,block.hash,'snapshot reorg');
const evidence={at:new Date().toISOString(),passed:true,chainId:11155111,registryAddress:config.registryAddress,rpcSource:config.rpcUrl,rotationExecutionTransactionHash:executionHash,tx,receipt,source:'deployment/upgrade-sepolia/rotation-expected.json',priorSnapshotSource:'evidence/upgrade-sepolia-rotation-two-votes.json',governanceHistoryRevalidation:{complete:false,note:'This audit independently validates execution receipt/events and receipt-block state. Full prior proposal-state revalidation is separate; public RPC reported historical state unavailable at block 12081275.'},block,blockTag:tag,institution,oldKey,newKey,keyInstitution:{oldKey:oldKeyInstitution,newKey:newKeyInstitution},probe:{...probe,recordExistsBefore:false,recordExistsAfter:false},permissionChecks,packageChecks,records,requests,canonicalBlockRechecked:true,limitations:'Both issue calls are read-only simulations with identical calldata and different from addresses. No new credential transaction was sent. Old packages retain their original issuer and epoch while the institution current key changes. Historical snapshot only; holder identity and school approval remain unverified.'};
const output='evidence/upgrade-sepolia-key-rotation-permissions.json';fs.writeFileSync(output,JSON.stringify(evidence,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');console.log(JSON.stringify({passed:true,output,snapshotBlock:Number(BigInt(tag)),oldKeyRejected:'active issuer',newKeySimulation:'0x',oldKeyReservation:true,originalStatus:packageChecks[0].report.status,correctedStatus:packageChecks[1].report.status}));
