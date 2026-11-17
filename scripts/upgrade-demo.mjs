// Ephemeral local EVM only. No mainnet/testnet private keys are loaded or exported.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fixture} from './upgrade-fixture.mjs';
export async function startDemo(port=8081,{heartbeatMs=15000}={}) {
  const f=await fixture({seed:true}),root=fileURLToPath(new URL('../',import.meta.url));
  const allowed=new Set(['eth_chainId','eth_getCode','eth_getTransactionReceipt','eth_getBlockByNumber','eth_call','eth_accounts','eth_estimateGas','eth_sendTransaction']);
  let origin;
  const server=http.createServer(async (req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    if(req.headers.host!==new URL(origin).host || (req.headers.origin&&req.headers.origin!==origin)) {res.writeHead(403);return res.end('Local origin required');}
    try {
      const url=new URL(req.url,origin);
      if(url.pathname==='/rpc' && req.method==='POST') {
        if(!req.headers['content-type']?.startsWith('application/json')) throw new Error('JSON only');
        let body='';for await(const part of req){body+=part;if(body.length>150000)throw new Error('Request too large');}
        const query=JSON.parse(body);if(!allowed.has(query.method))throw new Error('Method not allowed');
        let params=query.params??[];
        if(query.method==='eth_sendTransaction') {const tx={...params[0]};if(!f.addresses.some(a=>a.toLowerCase()===tx.from?.toLowerCase()))throw new Error('Unknown local account');tx.gas='0x'+(BigInt(await f.rpc.request({method:'eth_estimateGas',params:[tx]}))*13n/10n).toString(16);params=[tx];}
        res.setHeader('Content-Type','application/json');
        try {return res.end(JSON.stringify({jsonrpc:'2.0',id:query.id,result:await f.rpc.request({method:query.method,params})}));}
        catch(e){return res.end(JSON.stringify({jsonrpc:'2.0',id:query.id,error:{code:e.code??-32000,message:e.message}}));}
      }
      if(req.method!=='GET')throw new Error('GET only');
      if(url.pathname==='/upgrade/config.json') {res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({...f.config,demo:{accounts:f.addresses.map(a=>a.toLowerCase()),orgA:f.orgA,orgB:f.orgB}}));}
      let name=decodeURIComponent(url.pathname);if(name==='/')name='/upgrade/';if(name.endsWith('/'))name+='index.html';
      if(!/^\/(upgrade\/|chain\/(protocol\.js|adapters\.js|vendor\/))/.test(name) || name.includes('..') || !/\.(html|css|js|json)$/.test(name)) {res.writeHead(404);return res.end('Not found');}
      const data=await fs.readFile(path.join(root,name));res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json'})[path.extname(name)]);res.end(data);
    } catch(e){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}
  });
  try {await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});} catch(e){await f.close();throw e;}origin=`http://127.0.0.1:${server.address().port}`;
  // Mine empty local blocks while idle so normal freshness checks stay meaningful.
  const heartbeat=setInterval(()=>f.rpc.request({method:'evm_mine',params:[]}).catch(e=>console.error('Local block production failed:',e.message)),heartbeatMs);
  return {origin,f,close:async()=>{clearInterval(heartbeat);server.closeAllConnections();await new Promise(r=>server.close(r));await f.close();}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const demo=await startDemo(Number(process.env.PROOFPASS_DEMO_PORT??8081));
  console.log('升级实验台已启动：'+demo.origin+'/upgrade/');
  console.log('本机临时 EVM / chain 31337 / 虚构账户。停止进程后状态不保存；不是 Sepolia 部署。');
  const stop=async()=>{await demo.close();process.exit();};process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
