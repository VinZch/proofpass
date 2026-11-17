// Read-only fixed-block Sepolia audit. Never signs or sends a transaction.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Interface,AbiCoder,zeroPadValue,toBeHex} from 'ethers';
const config=JSON.parse(fs.readFileSync('upgrade/config.json','utf8'));
const plan=JSON.parse(fs.readFileSync('deployment/upgrade-sepolia/governance-test-plan.json','utf8'));
const abi=new Interface(JSON.parse(fs.readFileSync('upgrade/abi.json','utf8')));
let requestId=0;
async function raw(method,params=[]){const response=await fetch(config.rpcUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++requestId,method,params}),signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('RPC HTTP '+response.status);return response.json();}
async function rpc(method,params=[]){const r=await raw(method,params);if(r.error)throw Error(JSON.stringify(r.error));return r.result;}
const chainId=Number(BigInt(await rpc('eth_chainId')));assert.equal(chainId,11155111);
// Default to the recorded one-vote snapshot so a later second vote cannot rewrite this stage.
const snapshotTag=process.argv[2]??'0xb85838';
if(!/^0x[0-9a-fA-F]+$/.test(snapshotTag))throw Error('使用十六进制固定区块号');
const block=await rpc('eth_getBlockByNumber',[snapshotTag,false]);
const tag=block.number;
console.log('FIXED_SNAPSHOT '+tag+' / '+Number(BigInt(tag)));
const evidence={at:new Date().toISOString(),network:'Sepolia',chainId,registryAddress:config.registryAddress,mode:'read-only eth_call; not failed on-chain transactions',block,blockTag:tag,proposalId:1,independentRealInstitutions:false,calls:[],checks:[],proposedLogs:[],approvedLogs:[]};
const save=()=>fs.writeFileSync('evidence/upgrade-sepolia-governance-one-vote.json',JSON.stringify(evidence,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');save();
try {
 const [proposalRaw,thresholdRaw,proposedLogs,approvedLogs]=await Promise.all([
 rpc('eth_call',[{to:config.registryAddress,data:abi.encodeFunctionData('proposals',[1])},tag]),
 rpc('eth_call',[{to:config.registryAddress,data:abi.encodeFunctionData('threshold',[])},tag]),
 rpc('eth_getLogs',[{address:config.registryAddress,fromBlock:toBeHex(12081167),toBlock:tag,topics:[abi.getEvent('Proposed').topicHash,zeroPadValue(toBeHex(1),32)]}]),
 rpc('eth_getLogs',[{address:config.registryAddress,fromBlock:toBeHex(12081167),toBlock:tag,topics:[abi.getEvent('Approved').topicHash,zeroPadValue(toBeHex(1),32)]}])
 ]);
 const p=abi.decodeFunctionResult('proposals',proposalRaw);const fields=['action','institution','key','enabled','credentialId','reasonHash','revision','deadline','approvals','executed','cancelled'];evidence.proposal=Object.fromEntries(fields.map((name,i)=>[name,p[i]]));evidence.threshold=abi.decodeFunctionResult('threshold',thresholdRaw)[0];evidence.proposalRaw=proposalRaw;evidence.proposedLogs=proposedLogs;evidence.approvedLogs=approvedLogs;
 assert.equal(p.action,0n);assert.equal(p.institution.toLowerCase(),plan.institutionId.toLowerCase());assert.equal(p.key.toLowerCase(),plan.issuer.toLowerCase());assert.equal(p.reasonHash.toLowerCase(),plan.reasonHash.toLowerCase());assert.equal(p.approvals,1n);assert.equal(p.executed,false);assert.equal(p.cancelled,false);assert.equal(evidence.threshold,2n);assert(p.deadline>BigInt(block.timestamp));assert.equal(proposedLogs.length,1);assert.equal(approvedLogs.length,1);evidence.checks.push('proposal fields, one approval, threshold 2 and unexpired pending status match');
 const [tx,receipt]=await Promise.all([rpc('eth_getTransactionByHash',[proposedLogs[0].transactionHash]),rpc('eth_getTransactionReceipt',[proposedLogs[0].transactionHash])]);evidence.tx=tx;evidence.receipt=receipt;assert.equal(receipt.status,'0x1');assert.equal(tx.hash,receipt.transactionHash);assert.equal(tx.blockHash,receipt.blockHash);assert.equal(tx.from.toLowerCase(),plan.proposer.toLowerCase());assert.equal(tx.to.toLowerCase(),config.registryAddress.toLowerCase());
 const parsed=abi.parseTransaction({data:tx.input,value:tx.value});assert.equal(parsed.name,'propose');assert.equal(parsed.args[0],0n);assert.equal(parsed.args[1].toLowerCase(),plan.institutionId.toLowerCase());assert.equal(parsed.args[2].toLowerCase(),plan.issuer.toLowerCase());assert.equal(parsed.args[5].toLowerCase(),plan.reasonHash.toLowerCase());
 const ev=abi.parseLog(proposedLogs[0]);assert.equal(ev.args[0],1n);assert.equal(ev.args[1].toLowerCase(),plan.institutionId.toLowerCase());assert.equal(ev.args[2],0n);assert.equal(ev.args[3].toLowerCase(),plan.proposer.toLowerCase());const vote=abi.parseLog(approvedLogs[0]);assert.equal(vote.args[0],1n);assert.equal(vote.args[1].toLowerCase(),plan.proposer.toLowerCase());evidence.checks.push('successful propose transaction sender, parameters, Proposed and initial Approved event match');
 function reason(error){const visit=x=>{if(typeof x==='string'&&x.startsWith('0x08c379a0')){try{return AbiCoder.defaultAbiCoder().decode(['string'],'0x'+x.slice(10))[0];}catch{}}if(x&&typeof x==='object')for(const v of Object.values(x)){const found=visit(v);if(found)return found;}return null;};return visit(error);}
 const cases=[['execute',[1],plan.proposer,'threshold'],['approve',[1],plan.proposer,'already approved'],['approve',[1],'0x1111111111111111111111111111111111111111','governor']];
 for(const [name,args,from,expectedReason]of cases){const call={to:config.registryAddress,from,data:abi.encodeFunctionData(name,args)};const response=await raw('eth_call',[call,tag]);const decodedReason=reason(response.error);evidence.calls.push({method:'eth_call',blockTag:tag,...call,response,decodedReason,expectedReason,passed:decodedReason===expectedReason});save();assert(response.error);assert.equal(decodedReason,expectedReason);}
 const canonical=await rpc('eth_getBlockByNumber',[tag,false]);assert.equal(canonical.hash,block.hash);evidence.canonicalBlockRechecked=true;evidence.checks.push('three exact revert reasons verified at fixed block; snapshot remains canonical');evidence.passed=true;save();console.log(JSON.stringify({passed:true,block:Number(BigInt(tag)),tx:tx.hash,revertReasons:evidence.calls.map(c=>c.decodedReason)}));
}catch(error){evidence.passed=false;evidence.failure=error.message;save();throw error;}
