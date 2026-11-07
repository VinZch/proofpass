// Protocol v2: restricted JSON schema; lexicographic UTF-16 keys, no floats or Unicode normalization.
export function canonical(value) {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') {
    if (!value.isWellFormed()) throw new Error('无效 Unicode 字符');
    return JSON.stringify(value);
  }
  if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && Object.getPrototypeOf(value) === Object.prototype)
    return '{' + Object.keys(value).sort().map(k => canonical(k) + ':' + canonical(value[k])).join(',') + '}';
  throw new Error('协议仅允许 JSON 对象、字符串、安全整数、布尔值及 null');
}
export const hex = bytes => '0x' + [...bytes].map(n=>n.toString(16).padStart(2,'0')).join('');
export const random32 = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export const is32 = s => typeof s === 'string' && /^0x[0-9a-f]{64}$/.test(s) && !/^0x0+$/.test(s);
export const isAddress = s => typeof s === 'string' && /^0x[0-9a-f]{40}$/.test(s) && !/^0x0+$/.test(s);
export function validatePackage(pkg, config) {
  const p=pkg?.payload;
  const fields=['schemaVersion','chainId','registryAddress','issuer','credentialId','title','category','level','holderRef','validUntil'];
  if (!p || Object.keys(p).sort().join() !== fields.sort().join()) throw new Error('载荷字段不符合 v2 协议');
  if (p.schemaVersion!==2 || p.chainId!==config.chainId || p.registryAddress!==config.registryAddress?.toLowerCase()) throw new Error('拒绝不受信任的网络或合约');
  if (!isAddress(p.issuer)||!is32(p.credentialId)||!is32(pkg.salt)) throw new Error('地址 / ID / 盐格式错误');
  if (!Number.isSafeInteger(p.validUntil)||p.validUntil<=0) throw new Error('有效期格式错误');
  for (const key of ['title','category','level','holderRef']) if(typeof p[key]!=='string'||p[key].length<1||p[key].length>200) throw new Error('字段长度错误：'+key);
  canonical(p);
  return p;
}
export async function commitment(pkg, config) {
  validatePackage(pkg,config);
  const enc=new TextEncoder(), prefix=enc.encode('ProofPass:v2:'), salt=Uint8Array.from(pkg.salt.slice(2).match(/../g),x=>parseInt(x,16)), body=enc.encode(canonical(pkg.payload));
  const bytes=new Uint8Array(prefix.length+32+body.length);bytes.set(prefix);bytes.set(salt,prefix.length);bytes.set(body,prefix.length+32);
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));
}
export async function verifyPackage(pkg, adapter, config) {
  const p=validatePackage(pkg,config), digest=await commitment(pkg,config);
  const record=await adapter.getRecord(p.issuer,p.credentialId);
  const integrity=record.exists && record.commitment===digest && record.validUntil===p.validUntil;
  const status=!record.exists?'未登记':record.revoked?'已撤销':record.validUntil<=record.blockTimestamp?'已过期':'Active';
  const technicalPass=integrity && status==='Active';
  return {technicalPass,source:record.exists?'可信部署内的原签发地址登记（地址与现实机构的绑定仍需线下确认）':'未找到登记',integrity:integrity?'匹配':'不匹配',status,holder:'未验证',school:'未审批；演示目录匹配：'+((p.category==='竞赛获奖'&&p.level==='省级一等奖')||(p.category==='技能证书'&&p.level==='高级')?'是':'否'),policyVersion:config.policyVersion,issuer:p.issuer,credentialId:p.credentialId,commitment:digest,query:record.query,conclusion:technicalPass?'前三项技术检查通过；持有人与学校审批尚未完成':'未通过技术检查'};
}
