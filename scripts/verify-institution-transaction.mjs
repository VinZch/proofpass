// Read-only verifier: no signing, private keys or transaction submission.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Interface,keccak256,parseEther} from 'ethers';
import {recordEvidence,uniqueEvidenceName,writeTestOutput} from './evidence.mjs';
const argv=process.argv.slice(2);
const willRecord=argv.includes('--record'),force=argv.includes('--force');
const [kind,hash]=argv.filter(argument=>!argument.startsWith('--'));
if(!['authorization','funding','issue','revoke'].includes(kind)||!/^0x[0-9a-fA-F]{64}$/.test(hash??''))throw Error('Expected authorization|funding|issue|revoke and transaction hash');
const c=JSON.parse(fs.readFileSync('chain/config.json')),p=JSON.parse(fs.readFileSync('evidence/sepolia-institution-b-plan.json'));
const abi=new Interface(JSON.parse(fs.readFileSync('chain/abi.json')));
async function rpc(method,params=[]){const r=await fetch(c.rpcUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('HTTP '+r.status);const j=await r.json();if(j.error)throw Error(JSON.stringify(j.error));return j.result;}
assert.equal(BigInt(await rpc('eth_chainId')),11155111n);
assert.equal(p.registryAddress,c.registryAddress);assert.equal(keccak256(await rpc('eth_getCode',[c.registryAddress,'latest'])),c.runtimeCodeHash);
const receipt=await rpc('eth_getTransactionReceipt',[hash]),tx=await rpc('eth_getTransactionByHash',[hash]);
assert.equal(receipt?.status,'0x1');assert.equal(receipt.transactionHash.toLowerCase(),hash.toLowerCase());
const block=await rpc('eth_getBlockByNumber',[receipt.blockNumber,false]);assert.equal(block.hash,receipt.blockHash);
const from=['authorization','funding'].includes(kind)?p.institutionA:p.institutionB,to=kind==='funding'?p.institutionB:c.registryAddress;
assert.equal(receipt.from.toLowerCase(),from);assert.equal(receipt.to.toLowerCase(),to);assert.equal(tx.from.toLowerCase(),from);assert.equal(tx.to.toLowerCase(),to);
const calls={authorization:['setIssuer',[p.institutionB,true]],issue:['issue',[p.credentialId,p.commitment,p.validUntil]],revoke:['revoke',[p.credentialId]]};
assert.equal(tx.input.toLowerCase(),kind==='funding'?'0x':abi.encodeFunctionData(...calls[kind]).toLowerCase());
assert.equal(BigInt(tx.value),kind==='funding'?parseEther(p.fundingSepETH):0n);
const events=receipt.logs.filter(l=>l.address.toLowerCase()===c.registryAddress).map(l=>{try{return abi.parseLog(l);}catch{return null;}}).filter(Boolean);
if(kind==='authorization')assert.ok(events.some(e=>e.name==='IssuerSet'&&e.args[0].toLowerCase()===p.institutionB&&e.args[1]===true));
if(kind==='issue')assert.ok(events.some(e=>e.name==='Issued'&&e.args[0].toLowerCase()===p.institutionB&&e.args[1]===p.credentialId&&e.args[2]===p.commitment&&Number(e.args[3])===p.validUntil));
if(kind==='revoke')assert.ok(events.some(e=>e.name==='Revoked'&&e.args[0].toLowerCase()===p.institutionB&&e.args[1]===p.credentialId));
const finalized=await rpc('eth_getBlockByNumber',['finalized',false]);
const evidence={at:new Date().toISOString(),chainId:c.chainId,registryAddress:c.registryAddress,kind,receipt,transaction:tx,block,finality:BigInt(finalized.number)>=BigInt(receipt.blockNumber)?'finalized':'included; not yet finalized',validatedExpected:{from,to,amountWei:BigInt(tx.value).toString(),call:calls[kind]??null}};
const draft=writeTestOutput(`sepolia-institution-b-${kind}.json`,evidence);
let packageDraft=null;
if(kind==='issue'){
 const pkg=JSON.parse(fs.readFileSync(p.package));
 pkg.receipt={state:'已入块成功',transactionHash:hash.toLowerCase(),blockNumber:parseInt(receipt.blockNumber,16),blockHash:receipt.blockHash,receiptStatus:receipt.status,finality:evidence.finality,queriedAt:evidence.at};
 packageDraft=writeTestOutput('sepolia-institution-b-package.json',pkg);
}
if(willRecord){
 const saved=recordEvidence(draft,{as:uniqueEvidenceName(`sepolia-institution-b-${kind}.json`,{force}),note:`机构 B ${kind} 交易只读核验`});
 console.log('已登记 evidence/'+saved.name);
 if(packageDraft){const savedPkg=recordEvidence(packageDraft,{as:uniqueEvidenceName('sepolia-institution-b-package.json',{force}),note:'B 凭证包附加签发回执'});console.log('已登记 evidence/'+savedPkg.name);}
}else console.log('未写入 evidence/；如需登记加 --record');
console.log(JSON.stringify({kind,hash,block:parseInt(receipt.blockNumber,16),from,to,finality:evidence.finality},null,2));
