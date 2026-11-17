import test from 'node:test';
import assert from 'node:assert/strict';
import {validateEmergencyRecordChanges} from '../scripts/audit-upgrade-emergency-revoke.mjs';
const hash=n=>'0x'+n.repeat(64),addr='0x'+'a'.repeat(40),zero=hash('0'),target=hash('2'),reason=hash('9');
function fixture(){const before={commitment:hash('7'),registeredAt:'80',validUntil:'500',issuedBy:addr,keyEpoch:'1',previousId:zero,replacedBy:zero,revokedAt:'0',revocationKind:'0',reasonHash:zero};return {recordChecks:['1','2','3'].map(n=>({credentialId:hash(n),before:{...before},after:{...before,...(n==='2'?{revokedAt:'100',revocationKind:'3',reasonHash:reason}:{})}})),targetId:target,reasonHash:reason,executedAt:100n};}
test('Emergency revoke changes only target revocation fields and preserves both unrelated credentials',()=>{
 validateEmergencyRecordChanges(fixture());
 const mutations=[d=>d.recordChecks[0].after.commitment=zero,d=>d.recordChecks[2].after.revocationKind='3',d=>d.recordChecks[1].after.issuedBy='0x'+'b'.repeat(40),d=>d.recordChecks[1].after.replacedBy=hash('3'),d=>d.recordChecks[1].after.revocationKind='2',d=>d.recordChecks[1].after.revokedAt='101',d=>d.recordChecks[1].after.reasonHash=zero,d=>d.recordChecks[1].before.revocationKind='1',d=>d.targetId=hash('4'),d=>d.recordChecks[2].credentialId=target];
 for(const change of mutations){const data=fixture();change(data);assert.throws(()=>validateEmergencyRecordChanges(data));}
});
