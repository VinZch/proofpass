import {canonical,hex,is32,isAddress} from '../chain/protocol.js';
export const ZERO='0x'+'0'.repeat(64);
export function validatePackage(pkg,config) {
  const p=pkg?.payload;
  const fields=['schemaVersion','chainId','registryAddress','institution','issuer','keyEpoch','credentialId','previousId','title','holderRef','validUntil'];
  if(!p || Object.keys(p).sort().join()!==fields.sort().join()) throw new Error('需要升级版 v3 凭证包；基础版凭证请到原页面核验');
  if(p.schemaVersion!==3 || p.chainId!==config.chainId || p.registryAddress!==config.registryAddress?.toLowerCase()) throw new Error('凭证不属于当前网络或升级版合约');
  if(!is32(p.institution)||!is32(p.credentialId)||!is32(pkg.salt)||!isAddress(p.issuer)||!(p.previousId===ZERO||is32(p.previousId))) throw new Error('机构、地址、ID 或盐格式错误');
  if(!Number.isSafeInteger(p.keyEpoch)||p.keyEpoch<1||!Number.isSafeInteger(p.validUntil)||p.validUntil<1) throw new Error('密钥版本或有效期错误');
  for(const k of ['title','holderRef']) if(typeof p[k]!=='string'||!p[k].length||p[k].length>200) throw new Error('字段长度错误：'+k);
  canonical(p);return p;
}
export async function commitment(pkg,config) {
  validatePackage(pkg,config);
  const prefix=new TextEncoder().encode('ProofPass:v3:'), body=new TextEncoder().encode(canonical(pkg.payload));
  const bytes=new Uint8Array(prefix.length+32+body.length);bytes.set(prefix);
  bytes.set(Uint8Array.from(pkg.salt.slice(2).match(/../g),h=>parseInt(h,16)),prefix.length);bytes.set(body,prefix.length+32);
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));
}
export async function verifyPackage(pkg,adapter,config) {
  const p=validatePackage(pkg,config), digest=await commitment(pkg,config), snapshot=await adapter.snapshot(p.institution,p.credentialId),r=snapshot.record;
  const integrity=r.commitment===digest&&r.validUntil===p.validUntil&&r.issuedBy===p.issuer&&r.keyEpoch===p.keyEpoch&&r.previousId===p.previousId;
  const status=r.commitment===ZERO?'未登记':r.revocationKind===2?'已被更正版替代':r.revocationKind===3?'已紧急撤销':r.revocationKind?'已撤销':r.validUntil<=snapshot.query.blockTimestamp?'已过期':'有效';
  return {mode:config.mode,technicalPass:integrity&&status==='有效',status,integrity,institution:p.institution,credentialId:p.credentialId,issuer:p.issuer,keyEpoch:p.keyEpoch,currentKey:snapshot.institution.key,institutionEnabled:snapshot.institution.enabled,previousId:r.previousId,replacedBy:r.replacedBy,revocationKind:r.revocationKind,reasonHash:r.reasonHash,holder:'未验证',school:'未审批',query:snapshot.query,conclusion:'机构编号在轮换后保持不变；停用仅限制后续操作。持有人身份和学校认可仍需独立审核。'};
}
