import {GovernedAdapter} from './adapter.js';
import {ZERO,validatePackage,commitment,verifyPackage} from './protocol.js';
import {random32,hex,is32,isAddress} from '../chain/protocol.js';
const $=id=>document.getElementById(id),json=v=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x,2);
const ACTIONS=['登记新机构','更换签发钱包','启用 / 停用','紧急撤销'];
const [config,abi]=await Promise.all(['config.json','abi.json'].map(u=>fetch(u,{signal:AbortSignal.timeout(15000),cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(u+' 配置加载失败');return r.json();})));
const local=config.mode==='local-evm';
$('network-name').textContent=local?'本机测试链':'Sepolia 测试网';
$('network-chain').textContent=String(config.chainId);
$('network-address').textContent=config.registryAddress;
$('network-explorer').hidden=local;
if(!local)$('network-explorer').href='https://sepolia.etherscan.io/address/'+config.registryAddress;
let account='',pkg=null,report=null,reviewed=null,history=null,busy=false,timer,generation=0;
let providers=[],wallet;
const transactionStorageKey=`proofpass:v3:transaction:${config.chainId}:${config.registryAddress?.toLowerCase()||'undeployed'}`;
let transaction=null;
function userMessage(error){
 const message=String(error.shortMessage||error.message||'');
 if(error.code===4001||error.code==='ACTION_REJECTED')return '已取消钱包请求。';
 if(error.code==='INVALID_PACKAGE_JSON')return '凭证文件无法读取，请选择完整的 JSON 文件。';
 if(error instanceof SyntaxError)return '服务返回的信息暂时无法读取，请稍后重试。';
 if(error.code==='INSUFFICIENT_FUNDS'||/insufficient funds/i.test(message))return 'Sepolia 测试币余额不足，请补充后再试。';
 if(error.code===-32002||/already processing|request already pending/i.test(message))return '钱包中已有待处理请求，请先打开钱包完成或取消该请求。';
 if(error.code==='CALL_EXCEPTION')return '操作未能执行，请检查账户权限和凭证当前状态。';
 if(error.code==='INVALID_ARGUMENT')return '填写的信息格式有误，请检查编号、钱包地址和有效期。';
 if(/钱包 \/ RPC 网络错误|仅允许 Sepolia/.test(message))return '网络不匹配，请将钱包切换到 Sepolia 后重新连接。';
 if(/部署代码校验|部署回执|部署区块/.test(message))return '暂时无法确认合约信息，请稍后重试。';
 if(/交易回执|交易区块/.test(message))return '暂时无法确认交易结果，请稍后重新查询交易。';
 if(/区块过旧|时间异常|区块重组/.test(message))return '暂时无法获取最新状态，请稍后重新查询。';
 if(/未检测到测试网钱包/.test(message))return '未找到钱包，请安装并解锁 MetaMask 后重试。';
 if(/尚未配置已验证部署/.test(message))return '工作台暂未开放，请稍后再试。';
 if(/已有写入进行中/.test(message))return '上一笔交易正在处理中，请等待结果后再操作。';
 if(/等待超时/.test(message))return '交易确认时间较长，请重新查询交易，不要重复提交。';
 if(/RPC|fetch|offline|timeout|network|超时/i.test(message))return '网络连接暂不可用，请检查网络后重试。';
 return /[\u4e00-\u9fff]/.test(message)?message.slice(0,220):'操作未完成，请稍后重试。';
}
const transactionLabel=state=>({'已入块成功':'交易成功','已入块失败':'交易执行失败','已入块执行失败':'交易执行失败','待打包':'等待网络确认','已广播':'交易已提交','待钱包批准':'请在钱包中确认','用户拒绝':'已取消钱包请求'})[state]||state;
const notify=(msg,error=false)=>{$('status').textContent=msg;$('status').classList.toggle('error',error);};
const details=data=>{const target=$('details');if(target)target.textContent=json(data);};
const required=id=>{const s=$(id).value.trim();if(!s){$(id).setAttribute('aria-invalid','true');throw new Error('请填写：'+document.querySelector(`label[for="${id}"]`).textContent);}return s;};
const institution=()=>{const v=required('institution').toLowerCase();if(!is32(v))throw new Error('机构编号格式有误，请粘贴以 0x 开头的完整编号。');return v;};
const hashText=async text=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))));
function invalidateReport(){clearTimeout(timer);report=null;$('report').disabled=true;$('verdict').textContent='当前结论待重新查询。';$('verdict').classList.remove('bad');}
function invalidateHistory(message='机构或凭证编号已变化，请重新查询。'){history=null;$('history-result').textContent=message;}
function invalidateProposal(message='请重新查看提案详情。'){reviewed=null;$('proposal-summary').textContent=message;}
function assertCurrent(token){if(token!==generation)throw new Error('操作期间账户或网络已变化，请重新连接或查询');}
function renderTransaction(){
 $('transaction-panel').hidden=!transaction;if(!transaction)return;
 const confirmed=transaction.state==='已入块成功'||transaction.confirmed===true;
 $('transaction-hash').textContent=transaction.transactionHash;
 $('transaction-status').textContent=`${transactionLabel(transaction.state)} · ${local?'本机网络':'Sepolia'}${transaction.blockNumber?' · 区块 '+transaction.blockNumber:''}\n${confirmed?(transaction.receiptStatus==='0x0'?'该笔执行失败，可查看交易详情。':(transaction.finality==='已达 finalized 区块'?'网络已完成最终确认。':'交易已完成，网络最终确认状态暂未确认。')):'交易已提交，结果尚未确认。请先查询交易，不要重复提交。'}`;
 $('transaction-link').hidden=local;
 if(!local)$('transaction-link').href='https://sepolia.etherscan.io/tx/'+transaction.transactionHash;
}
function trackTransaction(entry){
 if(!is32(entry.transactionHash))return;
 const previous=transaction?.transactionHash===entry.transactionHash?transaction:{};
 transaction={...previous,transactionHash:entry.transactionHash,from:entry.from??previous.from??account,
  chainId:config.chainId,registryAddress:config.registryAddress,state:entry.state,
  blockNumber:entry.blockNumber??previous.blockNumber,blockHash:entry.blockHash??previous.blockHash,
  receiptStatus:entry.receiptStatus??previous.receiptStatus,confirmed:entry.confirmed??previous.confirmed,
  finality:entry.finality??previous.finality,queriedAt:entry.queriedAt??new Date().toISOString()};
 try{sessionStorage.setItem(transactionStorageKey,json(transaction));}catch{}
 renderTransaction();
}
try{
 const saved=JSON.parse(sessionStorage.getItem(transactionStorageKey)||'null');
 if(saved&&is32(saved.transactionHash)&&isAddress(saved.from?.toLowerCase())&&saved.chainId===config.chainId&&saved.registryAddress===config.registryAddress){
  // A restored record is historical, even if the last query succeeded.
  transaction={...saved,state:'已恢复历史交易，待重新查询',confirmed:false};renderTransaction();
 }
}catch{}
function permissions(){
 if(busy)return;
 for(const id of ['download','verify'])$(id).disabled=!pkg;
 const actionable=reviewed&&!reviewed.executed&&!reviewed.cancelled&&!reviewed.stale&&reviewed.deadline*1000>Date.now();
 $('approve').disabled=!account||!actionable||reviewed.alreadyApproved;
 $('execute').disabled=!account||!actionable||reviewed.approvals<reviewed.threshold;
 $('cancel').disabled=!account||!actionable;
 $('report').disabled=!report;$('check-transaction').disabled=!transaction;
 for(const id of ['previous','next'])$(id).disabled=!history || history.record[id==='previous'?'previousId':'replacedBy']===ZERO;
}
async function run(work){
 if(busy)return;busy=true;$('working').hidden=false;
 const controls=[...document.querySelectorAll('button,input,select,textarea')],states=controls.map(el=>el.disabled),trigger=document.activeElement;
 controls.forEach(el=>el.disabled=true);
 let failed=false;
 try{await work();}catch(e){failed=true;let message=userMessage(e);if(local&&(e.code==='STALE_BLOCK'||e.message?.includes('区块过旧')))message='本机网络闲置过久，请重启本机服务。重启将清空临时数据，原凭证文件不能用于新部署。';if(e.transactionHash)trackTransaction({...e,state:e.confirmed&&e.receiptStatus==='0x0'?'已入块失败':'交易状态未确认'});notify(message,true);details({error:e.message,...(e.transactionHash?{transactionHash:e.transactionHash,from:e.from,phase:e.phase}:{} )});}
 finally{controls.forEach((el,i)=>el.disabled=states[i]);busy=false;$('working').hidden=true;permissions();
  const invalid=failed&&document.querySelector('[aria-invalid="true"]');
  if(invalid)invalid.focus();else if(document.activeElement===document.body&&trigger?.tagName==='BUTTON'&&!trigger.disabled)trigger.focus();
 }
}
function changed(){++generation;account='';invalidateProposal('账户或网络已变化，请重新连接并读取提案。');invalidateHistory('账户或网络已变化，请重新查询。');invalidateReport();$('role').textContent='账户或网络已变化，请重新连接';$('org-state').textContent='账户或网络已变化，机构状态待重新查询。';notify('账户或网络已变化，请重新连接；只读查询仍可使用。');permissions();}
if(local){
 if(location.hostname!=='127.0.0.1'||!Array.isArray(config.demo?.accounts))throw new Error('本机实验台只能在 127.0.0.1 运行');
 const names=['治理成员 1','治理成员 2','治理成员 3','机构 A · 初始密钥','机构 B · 初始密钥','机构 A · 备用密钥','备用密钥 2','未授权账户'];
 $('account').hidden=false;$('connect').textContent='连接本机账户';
 config.demo.accounts.forEach((a,i)=>{const opt=new Option(names[i]+' / '+a.slice(0,8)+'…',a);$('account').add(opt);$('keys').append(new Option(names[i],a));});$('account').selectedIndex=3;
 for(const [name,id]of [['机构 A',config.demo.orgA],['机构 B',config.demo.orgB]])$('orgs').append(new Option(name,id));
 $('institution').value=config.demo.orgA;
 wallet={request:async({method,params=[]})=>{if(method==='eth_requestAccounts'||method==='eth_accounts')return[$('account').value];return adapter.readProvider.request({method,params});}};
 $('account').addEventListener('change',()=>{changed();run(connect);});
 $('network').textContent='本机测试链 · 31337';$('boundary').hidden=false;$('boundary').textContent='本机演示数据将在重启后清空。';
}else{
 $('network').textContent=config.deploymentStatus==='deployed'?'Sepolia 测试网':'Sepolia · 尚未部署';$('setup').hidden=config.deploymentStatus==='deployed';
 window.addEventListener('eip6963:announceProvider',e=>{if(e.detail?.info?.rdns==='io.metamask'&&!providers.includes(e.detail.provider))providers.push(e.detail.provider);});
 window.dispatchEvent(new Event('eip6963:requestProvider'));
}
const adapter=new GovernedAdapter(config,abi,{wallet,onProgress:p=>{trackTransaction(p);notify(transactionLabel(p.state));details(p);}});
async function refresh(){
 const current=institution(),token=generation;$('org-state').textContent='正在查询机构状态…';
 try{const s=await adapter.snapshot(current);assertCurrent(token);if(current!==$('institution').value.trim().toLowerCase())throw new Error('机构已变化，请重新查询');$('institution-name').textContent=local&&current===config.demo.orgA?'测试机构 A':local&&current===config.demo.orgB?'测试机构 B':'机构 '+current.slice(0,8)+'…'+current.slice(-4);$('org-state').textContent=s.institution.epoch?`密钥 v${s.institution.epoch} · ${s.institution.enabled?'启用':'停用'} · ${s.institution.key}`:'机构尚未登记';details(s);return s;}
 catch(e){$('org-state').textContent='无法确认当前机构状态，请重新查询。';throw e;}
}
async function connect(){if(!local){wallet=providers[0]??window.ethereum;if(!wallet)throw new Error('未找到钱包，请安装并解锁 MetaMask 后重试。');if(adapter.wallet!==wallet){wallet.on?.('accountsChanged',changed);wallet.on?.('chainChanged',changed);wallet.on?.('disconnect',changed);}adapter.wallet=wallet;}
 account='';$('role').textContent='正在连接并核对账户…';
 try{const connected=await adapter.connect(),token=generation;const role=await adapter.role(connected);assertCurrent(token);account=connected;$('role').textContent=account+' · '+role;notify(local?'本机账户已连接。':'钱包已连接');}
 catch(e){account='';$('role').textContent='连接未完成，请重新连接钱包。';throw e;}
 if($('institution').value)await refresh();}
function needAccount(){if(!account)throw new Error('请先连接操作账户');return account;}
function setPackage(value){pkg=value;$('package-info').classList.remove('empty');invalidateReport();invalidateHistory('已导入凭证，请查询最新状态。');$('package-info').textContent=`${pkg.payload.title}\n机构：${pkg.payload.institution}\n编号：${pkg.payload.credentialId}\n签发账户：${pkg.payload.issuer}\n密钥版本：${pkg.payload.keyEpoch}\n${pkg.receipt?'已附交易记录，点击查询最新状态':'草稿，尚未确认登记'}`;$('history-id').value=pkg.payload.credentialId;permissions();}
function download(name,data){const link=document.createElement('a'),url=URL.createObjectURL(new Blob([json(data)],{type:'application/json'}));link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function verify(){if(!pkg)throw new Error('请先导入凭证文件。');invalidateReport();const token=generation;const result=await verifyPackage(pkg,adapter,config);if(token!==generation)throw new Error('查询期间账户或网络变化，请重查');report=result;$('verdict').textContent=`${report.status} · 内容${report.integrity?'匹配':'不匹配'}\n签发密钥 v${report.keyEpoch} · 当前机构${report.institutionEnabled?'启用':'停用'}\n查询区块 ${report.query.blockNumber} · 结果保留 60 秒`;$('verdict').classList.toggle('bad',!report.technicalPass);details(report);timer=setTimeout(()=>{invalidateReport();notify('查询结果需要更新，请重新查询。');},60000);notify('当前凭证状态：'+report.status);}
async function issue(){const actor=needAccount(),org=institution(),s=await refresh();if(!s.institution.enabled||s.institution.key!==actor)throw new Error('当前账户无签发权限，请使用该机构当前的签发钱包。');const correcting=$('operation').value==='correct';const old=correcting?required('old-id').toLowerCase():ZERO;const until=Math.floor(new Date($('expires').value).getTime()/1000);const next={payload:{schemaVersion:3,chainId:config.chainId,registryAddress:config.registryAddress,institution:org,issuer:actor,keyEpoch:s.institution.epoch,credentialId:random32(),previousId:old,title:required('title'),holderRef:required('holder'),validUntil:until},salt:random32()};
 const digest=await commitment(next,config);const args=correcting?[org,old,next.payload.credentialId,digest,until,await hashText(required('correction-reason'))]:[org,next.payload.credentialId,digest,until];
 setPackage(next);invalidateReport();const receipt=await adapter.send(correcting?'correct':'issue',args,actor);next.receipt=receipt;setPackage(next);await verify();notify(correcting?'更正成功，请下载新版凭证。':'签发成功，请下载凭证文件。');}
async function readProposal(){invalidateProposal('正在读取提案…');const token=generation;
 try{const id=Number(required('proposal-id'));const p=await adapter.proposal(id,needAccount());assertCurrent(token);if(id!==Number($('proposal-id').value))throw new Error('提案编号已变化，请重新读取');reviewed=p;
 $('proposal-summary').textContent=`提案 #${p.id} · ${ACTIONS[p.action]}\n机构：${p.institution}\n${p.action<=1?'新签发钱包：'+p.key:p.action===2?'机构状态：'+(p.enabled?'启用':'停用'):'凭证编号：'+p.credentialId}\n批准：${p.approvals} / ${p.threshold}；当前账户${p.alreadyApproved?'已批准':'尚未批准'}\n截止：${new Date(p.deadline*1000).toLocaleString()}\n状态：${p.executed?'已执行':p.cancelled?'已否决':p.stale?'机构已变化，提案失效':p.deadline*1000<=Date.now()?'已超时':'待处理'}`;details(p);notify('已加载提案详情，请确认后操作。');}
 catch(e){invalidateProposal('提案读取失败，请重新查询。');throw e;}}
async function proposalAction(name){if(!reviewed||reviewed.id!==Number($('proposal-id').value))throw new Error('请先查看该提案详情。');invalidateReport();await adapter.send(name,[reviewed.id],needAccount());await readProposal();await refresh();notify('提案已'+({approve:'批准',execute:'执行',cancel:'否决'})[name]);}
async function propose(){const action=Number($('action').value),key=action<=1?required('new-key').toLowerCase():'0x'+'0'.repeat(40),enabled=action===2&&$('enabled').value==='true',id=action===3?required('emergency-id').toLowerCase():ZERO;if(action<=1&&!isAddress(key))throw new Error('钱包地址格式有误，请填写以 0x 开头的完整地址。');const hash=await hashText(required('reason'));const deadline=Math.floor(Date.now()/1000)+86400;const r=await adapter.send('propose',[action,institution(),key,enabled,id,hash,deadline],needAccount());const receipt=await adapter.getReceipt(r.transactionHash);const event=receipt.logs.map(l=>{try{return adapter.abi.parseLog(l);}catch{return null;}}).find(l=>l?.name==='Proposed');if(!event)throw new Error('交易已提交，但暂未获取提案编号，请查看交易详情。');$('proposal-id').value=String(event.args.proposalId);await readProposal();notify('提案已创建，已有 1 票批准。请由另一位治理成员批准。');}
async function query(){
 invalidateHistory('正在查询凭证状态…');const token=generation;
 try{const id=required('history-id').toLowerCase(),org=institution(),snapshot=await adapter.snapshot(org,id);assertCurrent(token);if(org!==$('institution').value.trim().toLowerCase()||id!==$('history-id').value.trim().toLowerCase())throw new Error('查询对象已变化，请重新查询');history=snapshot;const r=history.record;const status=r.commitment===ZERO?'未登记':r.revocationKind===2?'已被更正版替代':r.revocationKind===3?'已紧急撤销':r.revocationKind?'已撤销':r.validUntil<=history.query.blockTimestamp?'已过期':'有效';$('history-result').textContent=`机构：${org}\n凭证编号：${id}\n状态：${status}\n签发账户：${r.issuedBy}\n密钥版本：${r.keyEpoch}\n上一版：${r.previousId===ZERO?'无':r.previousId}\n下一版：${r.replacedBy===ZERO?'无':r.replacedBy}\n登记时间：${r.registeredAt?new Date(r.registeredAt*1000).toLocaleString():'—'}\n撤销时间：${r.revokedAt?new Date(r.revokedAt*1000).toLocaleString():'—'}\n查询区块：${history.query.blockNumber}\n查询时间：${new Date(history.query.at).toLocaleString()}`;details(history);notify('记录已查询：'+status);}
 catch(e){invalidateHistory('本次查询未完成，无法确认该凭证状态。请检查网络、机构与编号后重试。');throw e;}
}
$('connect').onclick=()=>run(connect);$('refresh').onclick=()=>run(async()=>{await refresh();notify('机构状态已更新');});$('issue').onclick=()=>run(issue);$('verify').onclick=()=>run(verify);
$('import').onchange=()=>run(async()=>{
 const file=$('import').files[0];if(!file)return;pkg=null;invalidateReport();$('package-info').classList.add('empty');$('package-info').textContent='正在检查导入文件';
 try{if(file.size>100000)throw new Error('文件超过 100 KB');const value=JSON.parse(await file.text());validatePackage(value,config);setPackage(value);$('import').removeAttribute('aria-invalid');notify('已导入，尚未查询最新状态');}
 catch(e){if(e instanceof SyntaxError)e.code='INVALID_PACKAGE_JSON';$('package-info').textContent='导入失败：'+userMessage(e);$('import').setAttribute('aria-invalid','true');throw e;}
});
$('download').onclick=()=>pkg&&download('ProofPass-v3-'+pkg.payload.credentialId.slice(2,10)+'.json',pkg);$('report').onclick=()=>report&&download('ProofPass-v3-report.json',report);
$('revoke').onclick=()=>run(async()=>{if(!pkg)throw new Error('请先导入或签发凭证。');const actor=needAccount(),s=await adapter.snapshot(pkg.payload.institution);if(!s.institution.enabled||s.institution.key!==actor)throw new Error('请使用该机构当前的签发钱包；机构停用时，请在机构管理中发起紧急撤销。');invalidateReport();await adapter.send('revoke',[pkg.payload.institution,pkg.payload.credentialId,await hashText(required('revoke-reason'))],actor);await verify();});
$('propose').onclick=()=>run(propose);$('read-proposal').onclick=()=>run(readProposal);for(const name of ['approve','execute','cancel'])$(name).onclick=()=>run(()=>proposalAction(name));
$('proposal-id').oninput=()=>{invalidateProposal('提案编号已变化，请重新读取。');permissions();};$('institution').oninput=()=>{$('institution-name').textContent='机构已变化，待查询';invalidateHistory();invalidateProposal('机构已切换，请重新查看提案详情。');permissions();$('org-state').textContent='机构编号已变化，请重新查询。';};$('history-id').oninput=()=>{invalidateHistory('凭证编号已变化，请重新查询。');permissions();};$('query').onclick=()=>run(query);
$('check-transaction').onclick=()=>run(async()=>{if(!transaction)throw new Error('暂无可查询的交易。');const result=await adapter.checkTransaction(transaction.transactionHash,transaction.from);trackTransaction(result);details(result);notify(result.state==='已入块成功'?'交易成功，请刷新凭证状态。':'交易尚未确认，请稍后重新查询，不要重复发送。');});
for(const name of ['previous','next'])$(name).onclick=()=>run(async()=>{if(!history)return;$('history-id').value=history.record[name==='previous'?'previousId':'replacedBy'];await query();});
$('operation').onchange=()=>{const correcting=$('operation').value==='correct';$('correction-fields').hidden=!correcting;$('issue').textContent=correcting?'提交更正':'登记凭证';};$('action').onchange=()=>{const a=Number($('action').value);$('key-fields').hidden=a>1;$('enabled-fields').hidden=a!==2;$('emergency-fields').hidden=a!==3;};
const tabs=[...document.querySelectorAll('[data-tab]')];
function activateTab(button){document.querySelector('.workspace-shell').classList.toggle('evidence-view',button.dataset.tab==='evidence');$('page-title').textContent=({credentials:'签发与更正',governance:'机构管理',history:'状态查询',evidence:'网络信息'})[button.dataset.tab];for(const b of tabs){const active=b===button;b.classList.toggle('selected',active);b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;$(b.dataset.tab).hidden=!active;}}
for(const button of tabs){button.onclick=()=>{activateTab(button);window.history.replaceState(null,'','#'+button.dataset.tab);};button.onkeydown=e=>{
 if(e.key==='Tab'&&!e.shiftKey&&!busy){const first=$(button.dataset.tab).querySelector('input:not([disabled]),select:not([disabled]),button:not([disabled]),textarea:not([disabled]),a[href],summary');if(first){e.preventDefault();first.focus();}return;}
 if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key)||busy)return;e.preventDefault();
 const i=tabs.indexOf(button),next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(['ArrowRight','ArrowDown'].includes(e.key)?1:-1)+tabs.length)%tabs.length;
 tabs[next].click();tabs[next].focus();
};}
const initialTab=tabs.find(b=>'#'+b.dataset.tab===location.hash);if(initialTab)activateTab(initialTab);
for(const field of document.querySelectorAll('input,textarea,select'))field.addEventListener('input',()=>field.removeAttribute('aria-invalid'));

const d=new Date(Date.now()+365*86400000);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());$('expires').value=d.toISOString().slice(0,16);
function updatePreview(){
 $('preview-title').textContent=$('title').value.trim()||'待填写证书标题';
 $('preview-holder').textContent=$('holder').value.trim()||'待填写';
 const value=$('expires').value,date=new Date(value);
 $('preview-expiry').textContent=value&&!Number.isNaN(date.getTime())?date.toLocaleString('zh-CN',{year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}):'待填写';
}
for(const id of ['title','holder','expires'])$(id).addEventListener('input',updatePreview);
const navigationQuery=matchMedia('(max-width:760px)');
function orientNavigation(){ $('workspace').setAttribute('aria-orientation',navigationQuery.matches?'horizontal':'vertical'); }
navigationQuery.addEventListener('change',orientNavigation);orientNavigation();updatePreview();$('issue').textContent='登记凭证';
permissions();
if(local)await run(connect);else notify(config.deploymentStatus==='deployed'?'连接钱包进行操作，或导入凭证直接查询。':'工作台暂未开放，请稍后再试。');
