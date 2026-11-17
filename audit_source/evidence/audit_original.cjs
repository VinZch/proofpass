/* Audit the original application logic without changing its source file.
   Node Web Crypto is real; the DOM is stubbed. This is not a browser UI test. */
const fs = require('node:fs');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');
const path = require('node:path');
const root=__dirname;
const source=path.resolve(root,'../ProofPass_跨校证书核验实验室.html');
const html=fs.readFileSync(source,'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\ninit\(\);\s*$/, '\n');
function makeContext(){
 const els=new Map();
 const defaults={casesCount:200,tOld:12,tSigned:5,maintCentral:360,maintConsortium:960};
 function el(id){if(!els.has(id))els.set(id,{innerHTML:'',textContent:'',value:defaults[id]??'',dataset:{},classList:{add(){},remove(){},toggle(){}},parentElement:{classList:{toggle(){}}},addEventListener(){}});return els.get(id)}
 const ctx=vm.createContext({crypto:webcrypto,TextEncoder,Uint8Array,structuredClone,console,btoa,atob,setTimeout,clearTimeout,Blob,URL,document:{getElementById:el,querySelectorAll:()=>[]}});
 vm.runInContext(script,ctx);return ctx;
}
(async()=>{
 let ctx=makeContext();
 await vm.runInContext('init()',ctx);
 const tests=[];
 async function record(name,expr){const observed=await vm.runInContext(expr,ctx);tests.push({name,observed});console.log(name,JSON.stringify(observed));}
 await record('eight_case_outputs',`(async()=>{let r=[];for(let i=0;i<8;i++){await runCase(i);r.push({case:i+1,markup:$('caseResult').innerHTML})}return r})()`);
 await record('normal_workflow',`(async()=>{state.grants.set(state.selected,{receiver:'B校',purpose:'成果认定',until:Date.now()+600000});await mainVerify();return state.lastResult})()`);
 await record('tampered_fields',`(async()=>{await mainVerify(true);return state.lastResult})()`);
 await record('status_ledger_desynchronization',`(async()=>{const c=current();state.statuses.set(c.data.credentialId,'revoked');await appendEvent('撤销',c.data.credentialId,{reason:'controlled test'});const before=await assess(c);state.statuses.set(c.data.credentialId,'valid');const after=await assess(c);return {before:before.verdict,after:after.verdict,ledgerAudit:await audit(),revocationStillRecorded:state.ledger.some(e=>e.kind==='撤销'&&e.credentialId===c.data.credentialId)}})()`);
 await record('rewrite_all_history_and_rehash',`(async()=>{state.ledger[0].credentialId+='-REWRITTEN';const without=await audit();let prev='0'.repeat(64);for(const b of state.ledger){b.prevHash=prev;const {hash,...fields}=b;b.hash=await sha(canonical(fields));prev=b.hash}return {withoutRehash:without,withRehash:await audit()}})()`);
 await record('no_independent_holder_evidence',`(async()=>{const r=await assess(current());return {expectedHolderSupplied:false,holderMatch:r.holderMatch,verdict:r.verdict}})()`);
 await record('reorder_json_fields_without_changing_content',`(async()=>{const c=structuredClone(current());c.data=Object.fromEntries(Object.entries(c.data).reverse());return {sameKeyValues:Object.entries(c.data).every(([k,v])=>current().data[k]===v),signatureValid:await verifySignature(c,state.issuers[c.data.issuerId].keys.publicKey)}})()`);
 await record('unknown_status_display',`(async()=>{state.statuses.delete(state.selected);const r=await assess(current());renderChecks(r,'checkGrid');return {status:r.status,verdict:r.verdict,markup:$('checkGrid').innerHTML}})()`);
 await record('unrecognized_status_value',`(async()=>{state.statuses.set(state.selected,'unexpected-status');return await assess(current())})()`);
 await vm.runInContext('init(true)',ctx);
 await record('concurrent_append',`(async()=>{await Promise.all([appendEvent('A','TEST-A'),appendEvent('B','TEST-B')]);return {audit:await audit(),lastTwo:state.ledger.slice(-2).map(x=>({index:x.index,prevHash:x.prevHash}))}})()`);
 const exported=vm.runInContext('JSON.stringify(current())',ctx);
 ctx=makeContext();await vm.runInContext('init()',ctx);ctx.oldCredentialJSON=exported;
 await record('export_after_new_session',`(async()=>{const c=JSON.parse(oldCredentialJSON);return {signatureValid:await verifySignature(c,state.issuers[c.data.issuerId].keys.publicKey),exportKeys:Object.keys(c)}})()`);
 const report={method:'Original HTML JavaScript executed unmodified except removal of its automatic init() call. Node.js Web Crypto; stubbed DOM. Controlled state manipulation, no external service. Browser UI testing was unavailable because Chromium navigation was blocked by environment policy.',sourceFile:path.basename(source),tests};
 fs.writeFileSync(path.join(root,'original_audit_results.json'),JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
