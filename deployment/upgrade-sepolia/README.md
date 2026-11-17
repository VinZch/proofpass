# 升级版 Sepolia 部署包

2026-11-07 已在 Sepolia（chainId 11155111）真实部署升级合约 `0x623b2e6a55003da0aa144ef0ec53547af3f61410`，交易 `0x069e1a31d7ffd37aaaa17e079c120633c7eab8bb7d1bb0a30983a51e12d72bb7`，部署区块 **12081167**，成功回执 `status=0x1`。已核对发送者、交易及回执哈希、规范区块、完整运行时代码、创建字节码和治理构造参数；证据见 `evidence/upgrade-sepolia-deployment.json`。在复核时点 `2026-11-07T04:26:07.195Z`，部署交易已达到 **finalized**；该结论仅对应这笔部署交易，后续业务交易的最终性分别记录。

用户选择同一本机 MetaMask 的三个账户测试 2/3 治理，不代表三家现实独立机构。治理地址按构造顺序保存在 `governors.json`；部署发送者为 `0xcdf9996213efdfc6014f9ab4c3554cd4e6e398ac`，value 为 0。

**部署已核验且 finalized；公共测试网两票准入、真实签发、原子更正、三项包校验、密钥轮换、epoch=2 新密钥实际签发、停用及紧急撤销执行等核心业务链路及 IAB 独立浏览器技术闭环已完成，真实团队现场取证和现实身份/学校审批仍未完成，完整 P0 不计完成。** 不要重复部署以继续业务测试；现有部署已写入 `upgrade/config.json`。基础版地址与 v2 凭证保持原样。

## 复核现有部署

在项目根目录执行以下命令，仅调用只读 RPC，核对通过后更新本地升级配置和证据文件：

```sh
# 默认 dry-run，只读核对、不写文件
node scripts/verify-upgrade-deployment.mjs https://ethereum-sepolia.publicnode.com 0x623b2e6a55003da0aa144ef0ec53547af3f61410 0x069e1a31d7ffd37aaaa17e079c120633c7eab8bb7d1bb0a30983a51e12d72bb7 deployment/upgrade-sepolia/governors.json 2 0xcdf9996213efdfc6014f9ab4c3554cd4e6e398ac --artifact deployment/upgrade-sepolia/artifact.json

# 核对无误后加 --write 才更新 upgrade/config.json 并登记证据（旧同名证据不覆盖）
```

脚本保存完整交易对象、发送者和最终性查询结果；finalized 查询失败记为 unknown。成功入块与最终性分开报告。

## 部署复现材料

本目录保留 `ProofPassGoverned.sol`、`artifact.json`、`compiler-input.json`，编译设置为 0.8.38、optimizer 200、Shanghai。如确需重新部署，Remix 的源码文件须在工作区根目录命名 `ProofPassGoverned.sol`，保持源文件键一致。构造参数为三个治理地址数组、阈值 2，value 为 0；新部署会有不同地址，不替代现有证据。

## 待完成的公共测试网验收

- 按实际参与情况补齐现实持有人身份验证、学校审批和相关访谈材料；技术核验不能替代这些审核。
- 团队完成真实现场取证、日期及成员分工记录。

每一步保存交易哈希、成功回执、查询区块及真实页面截图。成员分工、实际访谈、身份和学校审批由团队如实补充；不以模拟图或原基础版 v2 回执替代升级版取证。

## 提案 #1 的历史一票权限检查（2026-11-07）

测试机构准入提案 #1 已由 Account 1 实际提交，交易 `0xad82988f9d636249ae55e00ff3630b6b3f152d1dad5c730ea6560d8ff646a05b`，成功回执 `status=0x1`。固定区块 **12081208**（`0xb85838`）下，机构编号、签发密钥和原因摘要均与治理测试计划一致，提案在该历史快照中未过期、未取消、未执行，为 **1/2 票**；随后已完成第二票和执行，见后文。完整交易、回执、Proposed 和初始 Approved 事件，以及规范区块复核记录见 `evidence/upgrade-sepolia-governance-one-vote.json`。

同一固定区块完成三项只读 `eth_call` 检查，均精确解码合约回退原因：

| 调用 | 发送者参数 | 结果 |
|---|---|---|
| `execute(1)` | Account 1 | `threshold`：一票不能执行 |
| `approve(1)` | Account 1 | `already approved`：同一账户不能重复计票 |
| `approve(1)` | `0x1111111111111111111111111111111111111111` | `governor`：非治理地址不能投票 |

这三项是公共测试网固定区块的 **eth_call 模拟执行，不是三笔失败的实发交易**；from 字段是只读模拟参数，不证明该地址的私钥控制权。提案创建是一笔实际成功交易。后续第二票、准入执行、签发及原子更正均已完成；本段保留执行前的一票反例，不表示提案当前仍等待执行。

可复现本阶段快照：`node scripts/audit-upgrade-one-vote.mjs 0xb85838`。脚本默认使用这一本阶段区块，不随最新状态漂移。三个治理账户仍来自同一本机 MetaMask，不代表现实独立机构。


## 升级版两票准入、签发与原子更正验收（2026-11-07）

以下均为新版 Sepolia 合约的实际成功交易；同一本机 MetaMask 的 Account 1、Account 2 参与本轮治理，第三账户仍是固定治理成员。这是多地址阈值测试，不是现实独立机构认证。

| 阶段 | 实际交易与区块 | 核验结果与证据 |
|---|---|---|
| 提案 #1 第二票 | `0xe17e4816246894a34d0d4ee3520f6f422805f569a9afcb2d506732f86d8db07f`，区块 12081223 | Account 2 批准成功，Approved 事件匹配；执行前快照为 2 票。`evidence/upgrade-sepolia-governance-two-votes.json` |
| 提案 #1 执行准入 | `0x16028e6dbc7c3097fcdb902862385a0bb773eb20516d433d8d5b2cd1902f3551`，区块 12081228 | `executed=true`、`approvals=2`；快照 12081230 的机构密钥为 Account 1，epoch=1、revision=1、enabled=true，keyInstitution 绑定正确。`evidence/upgrade-sepolia-governance-executed.json` |
| 首次签发 | `0xf22f84d2a8fff0daf3156b6b7fb257cb1ca439ca6e23f19679e9413c46ca1f5a`，区块 12081241 | TEST ONLY 原包、承诺、完整 ABI 参数、Issued 事件及签发者/epoch 匹配；交易所在区块记录有效。`evidence/upgrade-sepolia-issued.json` |
| 原子更正 | `0xdb362701670cf4fbf88c3dd0568c1b76683ff86f6ab6ac497b8e8009349e0adc`，区块 12081257 | 同笔交易的 Revoked、Issued、Corrected 三事件匹配；旧记录 revocationKind=2，旧 replacedBy 指向新 ID，新 previousId 指向旧 ID，新记录在该区块有效。`evidence/upgrade-sepolia-corrected.json` |

原凭证 ID 为 `0x6b47782f2cacc5fc553db2b170d43b44a8060de46e4b784b530efe71d461dad6`，更正版 ID 为 `0xaaeb8577272d9bddac334b2a2b7473ed45d9724fc2860c4dd1b8f593b91864b9`。两份包分别保存在 `evidence/upgrade-sepolia-original-package.json` 和 `evidence/upgrade-sepolia-corrected-package.json`。

区块 **12081292** 的三项只读包校验全部符合预期：原包内容匹配但已被更正版替代（technicalPass=false）；更正版内容匹配且有效（technicalPass=true）；仅篡改更正版标题的样本完整性失败（integrity=false、technicalPass=false）。证据为 `evidence/upgrade-sepolia-correction-package-checks.json`。这三项是 RPC 查询及本地承诺比较，没有发送新交易，也不计作另一浏览器独立验收。

签发和更正证据固定在各自交易所在区块，描述历史状态；后续治理或撤销不会把这些历史快照改成当前状态证明。它们当时的最终性查询记录仍为 pending；部署已 finalized 不代表这些业务交易的最终性已另行复核。

**仍待完成：** 真实团队现场取证和现实身份/学校审批。IAB 独立浏览器报告验收已完成，详见末节。轮换执行、新密钥实际签发、停用、紧急撤销执行及相应权限和隔离检查已完成，见下节。没有用原 v2 的浏览器结果或模拟图替代上述项目。


## 轮换提案 #2：历史批准阶段与已完成执行（2026-11-07）

本提案已将测试机构 A 的签发密钥从 Account 1 轮换为 Account 2。以下先保留执行前的历史阶段：创建时一票快照保存在 `evidence/upgrade-sepolia-rotation-pending.json`（区块 12081276）。Account 2 第二票交易 `0x6964f35e174e76c6fc2a7295c2a21c0117a92d90e1b4113b514706dc717750a2` 已成功，固定快照区块 **12081297** 下为 **2/2 票、executed=false**；完整核验见 `evidence/upgrade-sepolia-rotation-two-votes.json`。

该快照下机构密钥仍为 Account 1，epoch=1、revision=1、enabled=true，Account 2 尚未绑定为机构签发密钥。`execute(2)` 的 `eth_call` 返回 `0x`，表明模拟可执行；它不是已签名执行交易，也不会更新机构状态。该证据的最终性查询为当时的 pending。

随后执行交易 `0xdd4c86215d20f259a12aaba848ecc7cdd9daf420b2238ec96f8af71b177d10de` 已在区块 **12081540** 成功。`evidence/upgrade-sepolia-rotation-executed.json` 核对了交易、回执、Executed/InstitutionChanged 事件、2 票及 executed=true，并核对执行前一块 12081539 与执行后状态：key 从 Account 1 变为 Account 2，epoch 和 revision 从 1 变为 2，enabled 保持 true；两个密钥的 keyInstitution 均保留同一机构绑定。该执行证据的最终性查询为当时的 pending。

`evidence/upgrade-sepolia-key-rotation-permissions.json` 在区块 12081540 使用相同 issue 参数、不同 from 做只读模拟：旧密钥精确回退 `active issuer`，新密钥返回 `0x`；探测记录调用前后均不存在，没有新增凭证交易。原包仍为“已被更正版替代”且内容匹配，更正版仍有效且内容匹配，两包保留原 issuer 和 keyEpoch=1。区块 **12081567** 的复核见 `evidence/upgrade-sepolia-key-rotation-current-check.json`，机构 key/epoch/revision 与两项权限模拟结果一致。这些权限检查不是实发失败交易或新密钥实际签发。

补充历史读取的限制：RPC 对提案创建前一区块 **12081275** 返回 `historical state ... is not available`，原因未确认，不能断言是节点剪枝。该创建前状态没有在本轮重新核验；执行前一块及执行后状态、实际交易与事件核验均成功，已有创建及第二票历史证据保留。

Account 2 的该份草稿随后已实际签发，凭证 ID 为 `0x9680d38f0728e6e14bc2040279e012a47d79f5c194ff8203a4cb5e1930125a78`；epoch=2 的成功回执及之后停用、紧急撤销提案进度见下节。


## epoch=2 实际签发、停用 #3 与紧急撤销 #4（2026-11-07）

Account 2 已实际签发新密钥凭证，交易 `0xf80fc89cb6482fbcd2c170842168487402c57b05489db98e5dfa582b4616dfbf` 在区块 **12081578** 成功。`evidence/upgrade-sepolia-key2-issued.json` 已核对发送者、epoch=2、凭证包承诺、ABI 参数、Issued 事件及交易所在区块的有效记录；此前“草稿待确认”已是历史状态。

停用提案 #3 的一票、两票和执行三个阶段分别保存在 `evidence/upgrade-sepolia-suspension-pending.json`、`evidence/upgrade-sepolia-suspension-two-votes.json`、`evidence/upgrade-sepolia-suspension-executed.json`。执行交易 `0x0249250047638fffbeca7a24dc701a1a26c88c4936066b10eb13996f95793db1` 在区块 **12081617** 成功；机构 key 保持 Account 2，epoch 保持 2，revision 变为 3，enabled=false。

停用权限对照见 `evidence/upgrade-sepolia-suspension-permissions.json`：当前密钥对 `issue`、`revoke`、`correct` 的相同参数在停用前区块 12081616 均模拟返回 `0x`，在停用后区块 12081617 均精确回退 `active issuer`。六次调用都是只读 `eth_call`，没有发出业务交易；原版、更正版及 epoch=2 凭证三条记录的字段在停用前后保持不变，停用不等于批量撤销历史凭证。

紧急撤销提案 #4 的创建交易 `0x91b4ead0b93614163d315f5bfce77febb8ab3b66226d4e8340ca5a3f812f29ed` 在区块 **12081634** 成功，当时为 1/2 票、未执行；该历史阶段保存在 `evidence/upgrade-sepolia-emergency-revoke-pending.json`。目标为更正版 `0xaaeb8577272d9bddac334b2a2b7473ed45d9724fc2860c4dd1b8f593b91864b9`。

第二票交易 `0xbb313624349ff4bbc4c72995e66e98f1b5f3460cee9172348c7f8c0d9944a3d6` 已在区块 **12081695** 成功，`evidence/upgrade-sepolia-emergency-revoke-two-votes.json` 记录当时为 **2/2 票、executed=false**。同区块的 `execute(4)` 只读 `eth_call` 返回 `0x`，仅是执行前模拟；这是一段历史阶段，后续已实际执行。

Account 2 的执行交易 `0xbecd392071c5f8744d07a151d21baf82da58df1a7d17ecbaf6940cbee37fc39b` 在区块 **12082287** 成功，提案 #4 为 2/2 票、executed=true。`evidence/upgrade-sepolia-emergency-revoke-executed.json` 与 `evidence/upgrade-sepolia-emergency-revoke-audit.json` 双重核验通过：机构仍 disabled，key=Account 2、epoch=2、revision=4；仅目标更正版的 revokedAt、revocationKind=3、reasonHash 发生预期变化，原版和 epoch=2 凭证全部字段保持不变。

区块 12082287 的三份凭证包完整性均为 true；原版状态为“已被更正版替代”，更正版为“已紧急撤销”，epoch=2 凭证为“有效”。这验证了指定凭证紧急撤销及其他记录隔离，并未批量撤销机构记录。执行最终性在本次查询时仍为 pending，另一专项审计未重新查询最终性，不能将成功回执写为 finalized。

补充历史读取边界：对提案 #4 创建前区块 **12081633** 的 RPC 查询返回 `historical state ... is not available`，原因未知，明确未在本轮重新取得该附加状态；执行前一区块 **12082286** 和执行后区块 **12082287** 的核心状态、实际交易与事件核验均通过。

**当前进度：** 升级版公共测试网两票准入、签发、更正、轮换、新密钥实际签发、停用、紧急撤销的核心业务链路已完成，不再等待 #4 钱包执行；IAB 独立浏览器报告验收也已完成，真实团队现场取证仍未完成。

历史观察：Safari 原生界面曾于区块 **12081643**、紧急撤销前读取更正版，看到“有效、内容匹配、机构已停用”；但导出失败，未保存该次 Safari 报告。随后完成的升级版独立浏览器验收来自 IAB，不能写成 Safari 导出成功。原 v2 已保存的 Safari 报告保持原样。

上述新证据中的最终性结果是各自当时的 pending，成功回执与最终性继续分开记录。三个治理账户来自同一本机 MetaMask；团队现场取证、真实身份及学校审批仍待完成。


## 升级版 IAB 独立浏览器技术闭环（2026-11-07）

使用 **ChatGPT in-app browser（IAB）新独立标签页**，全程未连接钱包，依次导入三份保存的 v3 凭证包、读取链上状态并导出 JSON 报告及真实页面截图。本次主体是 IAB，不是此前导出失败的 Safari。

| 导入包 | 查询区块 | 状态与技术结论 | 保存报告 | 页面截图 |
|---|---|---|---|---|
| 更正版 | 12082327 | 已紧急撤销；integrity=true、technicalPass=false | `evidence/upgrade-sepolia-independent-corrected-revoked-report.json` | `evidence/upgrade-sepolia-independent-revoked.jpg` |
| 原版 | 12082330 | 已被更正版替代；integrity=true、technicalPass=false | `evidence/upgrade-sepolia-independent-original-replaced-report.json` | `evidence/upgrade-sepolia-independent-original.jpg` |
| epoch=2 新密钥凭证 | 12082332 | 有效；integrity=true、technicalPass=true | `evidence/upgrade-sepolia-independent-key2-valid-report.json` | `evidence/upgrade-sepolia-independent-key2.jpg` |

三份报告均记录 institutionEnabled=false；截图的导入文件、凭证编号、状态及区块与报告一致。`evidence/upgrade-sepolia-independent-browser-acceptance.json` 已将各报告与其固定区块的协议重算结果逐字段比较，包括查询区块哈希与时间，并核对 Sepolia chainId、合约运行时代码、规范区块、机构 epoch=2/revision=4/disabled 及对应记录，全部通过。

**范围：** 公共测试网核心业务链路与独立浏览器技术闭环已完成。浏览器与复核脚本仍共用配置的 `https://ethereum-sepolia.publicnode.com`，不宣称进行了独立 RPC 提供商交叉验证；报告仅代表各自历史区块，不改变逐交易最终性的单独记录。这些截图和报告是实际技术测试证据，不是团队成员现场照片，也不证明真实持有人身份或学校审批。真实团队现场材料及现实审核仍未完成，完整 P0 不标记完成；本轮未重跑测试，既有 11 组针对性测试记录保持。
