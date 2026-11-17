# 项目状态、时间线与证据

更新：2026-11-17。本文保存项目的历史状态与验收口径；操作入口见 [README](README.md)，信任边界见 [SECURITY](SECURITY.md)，合约版本见 [deployment/DEPLOYMENTS.md](deployment/DEPLOYMENTS.md)。

## 当前状态（2026-11-17）

- **源码**：`contracts/` 为 v2（基础版两阶段管理员转移与有效期上限；治理版取消阈值、紧急撤销预检、职责分离、事件语义修正）。
- **链上**：Sepolia 运行的仍是 v1（基础版 2026-11-04、升级版 2026-11-07 部署）。`chain/config.json`、`upgrade/config.json` 与现有证据都指向 v1；v2 需要重新部署才生效。
- **测试**：70 个 Node 用例（69 通过、1 个需 `npm run test:vm`）、浏览器端到端 35 项、ESLint/Prettier、artifacts 一致性与 136 份证据哈希校验均通过。
- **未完成**：完整 P0、团队现场取证、现实身份与学校审批、持有人挑战与身份绑定、治理成员自身轮换；P2 未开展。

## 基础版公共测试网时间线

**基础版已于 2026-11-04 部署 Sepolia，公共测试网完整验收仍未完成。** 合约 `0xdaf9d8f06bc5895a79a4cdae66ec3ea262435149`，部署交易 `0x31295221993f326284ec0d5f16c7cc5978fddbc831a6a648897e2d6169677473`。只读 RPC 已核对成功回执、部署区块和完整运行时代码，配置已写入 `chain/config.json`，证据见 `evidence/sepolia-deployment.json`。当前管理员测试钱包的签发授权已完成，证据见 `evidence/sepolia-issuer-authorization.json`。真实测试证书已完成签发 → Safari 独立导入核验有效 → 原签发方撤销 → Safari 复查已撤销。证据见 `evidence/sepolia-issued.json`、`evidence/sepolia-revoked.json`、`evidence/sepolia-browser-check.json`、`evidence/sepolia-safari-revoked-report.json`；首轮 A 兼任管理员与签发方；追加机构 B 独立地址已完成授权、同编号签发、Safari 有效核验、撤销与 Safari 复查，A 原记录全部字段保持不变。四阶段 32 项只读权限检查通过（含重复断言，不是 32 笔交易），详情见 `P0验收记录.md`。`evidence/local-evm.json` 及浏览器测试包里的地址、交易哈希只属于本机临时 Ganache 测试，不可复制到真实部署配置。未生成访谈、成员现场截图或现实机构认证材料。

## 升级版公共测试网时间线（2026-11-07）

**升级版新增状态：** 2026-11-07 已在 Sepolia（chainId 11155111）真实部署升级合约 `0x623b2e6a55003da0aa144ef0ec53547af3f61410`，交易 `0x069e1a31d7ffd37aaaa17e079c120633c7eab8bb7d1bb0a30983a51e12d72bb7`，部署区块 **12081167**，成功回执 `status=0x1`。已核对发送者、交易及回执哈希、规范区块、完整运行时代码、创建字节码和治理构造参数；证据见 `evidence/upgrade-sepolia-deployment.json`。在复核时点 `2026-11-07T04:26:07.195Z`，部署交易已达到 **finalized**；该结论仅对应这笔部署交易，后续业务交易的最终性分别记录。

升级版已在公共测试网完成提案 #1 的两票准入执行、TEST ONLY 凭证签发和原子更正，并核对新旧记录双向关联。原包、更正版包及标题篡改样本的三项只读校验通过，证据见 `evidence/upgrade-sepolia-governance-executed.json`、`evidence/upgrade-sepolia-issued.json`、`evidence/upgrade-sepolia-corrected.json`、`evidence/upgrade-sepolia-correction-package-checks.json`。轮换执行、epoch=2 新密钥实际签发、停用 #3 执行及权限检查已完成；紧急撤销 #4 已完成两票执行及独立审计，公共测试网核心业务链路及 IAB 独立浏览器报告验收已完成，团队现场取证仍待完成；三个治理账户来自同一本机 MetaMask，不代表三家独立机构。

轮换提案 **#2 已执行并核验通过**：交易 `0xdd4c86215d20f259a12aaba848ecc7cdd9daf420b2238ec96f8af71b177d10de`，区块 **12081540**；该执行区块的机构密钥变为 Account 2，epoch=2、revision=2、enabled=true；后续停用状态见下文。旧密钥签发被拒、新密钥签发模拟可执行，以及历史包仍可核验，分别见 `evidence/upgrade-sepolia-rotation-executed.json`、`evidence/upgrade-sepolia-key-rotation-permissions.json`、`evidence/upgrade-sepolia-key-rotation-current-check.json`。该轮新密钥 `issue` 的成功结果是只读 `eth_call`；随后已另行完成 epoch=2 的实际签发并核对成功回执，见 `evidence/upgrade-sepolia-key2-issued.json`。此前 2/2 票、未执行的区块 12081297 快照保留为历史阶段。

最新已核验证据：Account 2 已在区块 **12081578** 实际签发 epoch=2 的 TEST ONLY 凭证；停用提案 **#3 已于区块 12081617 执行**，机构 key=Account 2、epoch=2、revision=3、enabled=false。证据见 `evidence/upgrade-sepolia-key2-issued.json`、`evidence/upgrade-sepolia-suspension-executed.json` 和 `evidence/upgrade-sepolia-suspension-permissions.json`。紧急撤销提案 **#4 已完成两票执行并通过双重只读审计**：Account 2 的 `execute(4)` 交易 `0xbecd392071c5f8744d07a151d21baf82da58df1a7d17ecbaf6940cbee37fc39b` 在区块 **12082287** 成功。机构仍停用，key=Account 2、epoch=2、revision=4；仅更正版变为已紧急撤销，原版与 epoch=2 凭证记录全部字段保持不变。证据见 `evidence/upgrade-sepolia-emergency-revoke-executed.json` 和 `evidence/upgrade-sepolia-emergency-revoke-audit.json`；本次执行最终性查询仍为 pending，不能写成 finalized。此前一票、两票未执行快照是历史阶段，当前不再等待钱包执行。

升级版已通过 **ChatGPT in-app browser（IAB）新独立标签页**，在未连接钱包的情况下导入三份 v3 包、查询链上状态并导出报告与截图：更正版在区块 12082327 为已紧急撤销，原版在 12082330 为已被更正版替代，epoch=2 凭证在 12082332 为有效；三份内容完整性均匹配、机构均已停用。各报告与固定区块 RPC 重算结果逐字段一致，索引见 `evidence/upgrade-sepolia-independent-browser-acceptance.json`，独立浏览器技术验收完成。IAB 和复核仍使用同一 PublicNode RPC，浏览器隔离不等于独立 RPC 提供商验证。

此前 Safari 在区块 12081643 的“更正版有效、内容匹配、机构已停用”仅为紧急撤销前的界面观察，导出失败且未保存报告；本次完成项来自 IAB，不归为 Safari 成果。截图属于技术测试证据，真实团队现场材料、现实身份与学校审批仍未完成。

## 证据与展示材料

主网页的取证栏目使用本轮真实 Sepolia 技术证据：3 张 IAB 独立浏览器截图及对应报告，分别展示原版被替代、更正版已紧急撤销、epoch=2 凭证有效。证据与固定区块复核索引位于 `evidence/upgrade-sepolia-independent-browser-acceptance.json`；图片位于 `evidence/upgrade-sepolia-independent-*.jpg`。这些是实际测试操作截图，不能代替团队成员现场材料或现实身份审批。

原 8 张模拟图保留在 `demo-placeholders/images/`，作为有明确标记的历史排练材料。主网页、共享展示资源和证据目录应一起保留，避免相对链接失效。历史模拟材料不改变真实验收状态。

证据文件的哈希、大小、登记时间与提交号记录在 `evidence/manifest.json`；`npm run evidence:verify` 会重算并报告改动、缺失或未登记文件。测试与浏览器脚本只写 `artifacts/test-output/`，不会改写证据。

## 模拟研究资料（2026-11-05）

主网页「07 · 模拟研究资料」用明确标记的模拟数据补齐展示材料：16 项核心合成任务、8 项扩展设计场景、15 段虚构角色访谈、7 步流程、48 条三方案对照模型记录、5 项治理假设、4 个模拟分工角色和 10 条答辩问答。汇编与 JSON 位于 `simulation-research/`，独立页面为 `simulation-research/index.html`。

访谈不是受访者记录，工时不是实测，预设结论不是已执行测试。资料中的当前能力说明已对照本轮 Sepolia 证据更新；模拟身份绑定、持有人挑战等未完成功能仍未实现，真实团队现场取证、实际访谈与完整验收状态分别记录。使用 `python3 simulation-research/build.py --standalone-only` 可仅重建该目录的数据、汇编及独立页面；不加此参数还会重写主 HTML 的模拟研究资料区块，请避免与页面编辑同时运行。

## 功能升级（2026-11-05 起）

原网页新增「08 · 功能升级」。已实现独立 `ProofPassGoverned.sol` 合约、2/3 阈值治理、稳定机构编号、签发密钥轮换、原子更正与双向版本关联、停用后的紧急撤销；配套 `upgrade/` 页面和 v3 凭证协议。

运行 `npm run upgrade:demo`，打开 `http://127.0.0.1:8081/upgrade/`，即可用预置虚构账户操作实际本机 EVM 合约；重启会清空。这不是 Sepolia 部署，基础版地址和已保存 v2 凭证不迁移。运行 `npm run compile:upgrade` 编译，`npm run test:upgrade:browser` 检查浏览器流程。完整路线、边界和后续部署方法见 [升级说明](upgrade/升级说明.md)。

2026-11-17 源码升到 v2：取消提案需提案人或达到阈值、紧急撤销提案预检记录、治理成员不得兼任机构密钥、`validUntil` 上限 10 年、紧急撤销不再发 `InstitutionChanged`。Sepolia 上的升级合约仍是 v1，重新部署后才启用 v2。

运行 `npm run serve` 后访问 `http://127.0.0.1:8080/upgrade/` 可操作已配置的 Sepolia 升级合约；`8081/upgrade/` 仍为临时本机 EVM，不能混用其凭证和回执。

## 未完成事项

- 完整 P0 验收、团队现场取证、真实访谈与成员分工记录。
- 现实机构身份认证、学校审批、持有人挑战与身份绑定。
- 治理成员自身轮换、治理成员独立设备/机构化、密钥失陷演练。
- P2；公平三后端性能实测；自动通知。
- 依赖替换：Ganache 仍在测试中使用，见下节。

## 依赖与本地 EVM

项目**没有运行时 npm 依赖**：`chain/` 是静态文件，`chain/vendor/ethers.js` 由编译脚本复制。`npm ls --omit=dev` 为空。所有 npm 依赖都在 `devDependencies`（solc、ethers、playwright、ganache、eslint、prettier 等），不进入发布包。

`npm audit` 的告警全部来自开发依赖（主要是 solc 与 Ganache 的传递依赖）。Ganache 已停止维护，但仅在测试进程内使用；本地 EVM 的创建已收敛到 [scripts/evm.mjs](scripts/evm.mjs) 一个文件，替换成 Anvil/Hardhat 只需改这一处。替换未完成的原因：本机未安装 Foundry，CI 需要额外安装系统二进制；在替换前保留零安装的 Ganache 作为后备。

原始审计快照见 `evidence/dependency-audit.json`（2026-11-07）。该文件是历史记录，不随依赖更新自动变化。
