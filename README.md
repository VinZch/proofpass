# ProofPass：离线教学版与 Chain 测试网版

按 2026-11-03 实施任务书修改。原始审核包保存在 `audit_source/`，修复版为根目录 `ProofPass_跨校证书核验实验室.html`，真实合约前端在 `chain/`。

**基础版已于 2026-11-04 部署 Sepolia，公共测试网完整验收仍未完成。** 合约 `0xdaf9d8f06bc5895a79a4cdae66ec3ea262435149`，部署交易 `0x31295221993f326284ec0d5f16c7cc5978fddbc831a6a648897e2d6169677473`。只读 RPC 已核对成功回执、部署区块和完整运行时代码，配置已写入 `chain/config.json`，证据见 `evidence/sepolia-deployment.json`。当前管理员测试钱包的签发授权已完成，证据见 `evidence/sepolia-issuer-authorization.json`。真实测试证书已完成签发 → Safari 独立导入核验有效 → 原签发方撤销 → Safari 复查已撤销。证据见 `evidence/sepolia-issued.json`、`evidence/sepolia-revoked.json`、`evidence/sepolia-browser-check.json`、`evidence/sepolia-safari-revoked-report.json`；首轮 A 兼任管理员与签发方；追加机构 B 独立地址已完成授权、同编号签发、Safari 有效核验、撤销与 Safari 复查，A 原记录全部字段保持不变。四阶段 32 项只读权限检查通过（含重复断言，不是 32 笔交易），详情见 `P0验收记录.md`。`evidence/local-evm.json` 及浏览器测试包里的地址、交易哈希只属于本机临时 Ganache 测试，不可复制到真实部署配置。未生成访谈、成员现场截图或现实机构认证材料。

**升级版新增状态（2026-11-07）：** 2026-11-07 已在 Sepolia（chainId 11155111）真实部署升级合约 `0x623b2e6a55003da0aa144ef0ec53547af3f61410`，交易 `0x069e1a31d7ffd37aaaa17e079c120633c7eab8bb7d1bb0a30983a51e12d72bb7`，部署区块 **12081167**，成功回执 `status=0x1`。已核对发送者、交易及回执哈希、规范区块、完整运行时代码、创建字节码和治理构造参数；证据见 `evidence/upgrade-sepolia-deployment.json`。在复核时点 `2026-11-07T04:26:07.195Z`，部署交易已达到 **finalized**；该结论仅对应这笔部署交易，后续业务交易的最终性分别记录。

升级版已在公共测试网完成提案 #1 的两票准入执行、TEST ONLY 凭证签发和原子更正，并核对新旧记录双向关联。原包、更正版包及标题篡改样本的三项只读校验通过，证据见 `evidence/upgrade-sepolia-governance-executed.json`、`evidence/upgrade-sepolia-issued.json`、`evidence/upgrade-sepolia-corrected.json`、`evidence/upgrade-sepolia-correction-package-checks.json`。轮换执行、epoch=2 新密钥实际签发、停用 #3 执行及权限检查已完成；紧急撤销 #4 已完成两票执行及独立审计，公共测试网核心业务链路及 IAB 独立浏览器报告验收已完成，团队现场取证仍待完成；三个治理账户来自同一本机 MetaMask，不代表三家独立机构。

轮换提案 **#2 已执行并核验通过**：交易 `0xdd4c86215d20f259a12aaba848ecc7cdd9daf420b2238ec96f8af71b177d10de`，区块 **12081540**；该执行区块的机构密钥变为 Account 2，epoch=2、revision=2、enabled=true；后续停用状态见下文。旧密钥签发被拒、新密钥签发模拟可执行，以及历史包仍可核验，分别见 `evidence/upgrade-sepolia-rotation-executed.json`、`evidence/upgrade-sepolia-key-rotation-permissions.json`、`evidence/upgrade-sepolia-key-rotation-current-check.json`。该轮新密钥 `issue` 的成功结果是只读 `eth_call`；随后已另行完成 epoch=2 的实际签发并核对成功回执，见 `evidence/upgrade-sepolia-key2-issued.json`。此前 2/2 票、未执行的区块 12081297 快照保留为历史阶段。

最新已核验证据：Account 2 已在区块 **12081578** 实际签发 epoch=2 的 TEST ONLY 凭证；停用提案 **#3 已于区块 12081617 执行**，机构 key=Account 2、epoch=2、revision=3、enabled=false。证据见 `evidence/upgrade-sepolia-key2-issued.json`、`evidence/upgrade-sepolia-suspension-executed.json` 和 `evidence/upgrade-sepolia-suspension-permissions.json`。紧急撤销提案 **#4 已完成两票执行并通过双重只读审计**：Account 2 的 `execute(4)` 交易 `0xbecd392071c5f8744d07a151d21baf82da58df1a7d17ecbaf6940cbee37fc39b` 在区块 **12082287** 成功。机构仍停用，key=Account 2、epoch=2、revision=4；仅更正版变为已紧急撤销，原版与 epoch=2 凭证记录全部字段保持不变。证据见 `evidence/upgrade-sepolia-emergency-revoke-executed.json` 和 `evidence/upgrade-sepolia-emergency-revoke-audit.json`；本次执行最终性查询仍为 pending，不能写成 finalized。此前一票、两票未执行快照是历史阶段，当前不再等待钱包执行。

升级版已通过 **ChatGPT in-app browser（IAB）新独立标签页**，在未连接钱包的情况下导入三份 v3 包、查询链上状态并导出报告与截图：更正版在区块 12082327 为已紧急撤销，原版在 12082330 为已被更正版替代，epoch=2 凭证在 12082332 为有效；三份内容完整性均匹配、机构均已停用。各报告与固定区块 RPC 重算结果逐字段一致，索引见 `evidence/upgrade-sepolia-independent-browser-acceptance.json`，独立浏览器技术验收完成。IAB 和复核仍使用同一 PublicNode RPC，浏览器隔离不等于独立 RPC 提供商验证。

此前 Safari 在区块 12081643 的“更正版有效、内容匹配、机构已停用”仅为紧急撤销前的界面观察，导出失败且未保存报告；本次完成项来自 IAB，不归为 Safari 成果。截图属于技术测试证据，真实团队现场材料、现实身份与学校审批仍未完成。

## 运行

- 离线版：双击根目录 HTML，保留原界面、文件 SHA-256 比较、ECDSA 和八种案例。无安装、无钱包、无后端。新版本的排序编码与旧版签名格式不兼容；本地会话密钥刷新仍会失效，跨浏览器核验由 Chain 版完成。
- Chain 版：在此目录 `npm run serve`，访问 `http://127.0.0.1:8080/chain/`。已随项目附带浏览器 ethers 库，不依赖 CDN。配置 RPC 后审核员无需连接钱包；没有 RPC 时使用钱包提供的只读请求。
- 开发：Node 22+（本次 Node 26.5.0），`npm ci`、`npm run compile`、`npm test`。浏览器流程：`node scripts/browser-check.mjs`，默认使用 macOS Chrome；其他平台调整脚本 executablePath。测试代码及依赖只供本地开发，不发布 node_modules 或本地 RPC 服务。

## 版本控制与证据（2026-11-17）

- 版本库：本目录为完整源码仓库（`main` 分支），远端 `https://github.com/VinZch/proofpass` 的 `main` 是 GitHub Pages 发布分支，源码推送到该仓库的 `source` 分支。`deployment/github-pages/` 是发布副本，不进入源码提交。
- 测试与证据分离：`npm test`、`node scripts/browser-check.mjs` 等只写 `artifacts/test-output/`，不再改写 `evidence/`。
- 证据登记：`node scripts/evidence.mjs record <文件> --note "说明"` 写入 `evidence/` 并更新 `evidence/manifest.json`（sha256、大小、登记时间、提交号）。
- 证据校验：`npm run evidence:verify` 重算全部哈希；被改动、缺失或未登记的文件都会报错并以非零码退出。
- 部署核验：`node scripts/verify-deployment.mjs <RPC> <地址> <部署交易哈希>` 默认 dry-run，不写任何文件；确认后加 `--write` 才写 `chain/config.json` 并把证据登记进 manifest，旧配置先备份、旧证据不覆盖。
- 交付 zip 与 `deployment/public-site/dist/` 视为生成物，不入库；需要时重新打包或挂到 GitHub Release。
- 跳过的 `upgrade-bootstrap` 用例需要 `npm run test:vm`（`--experimental-vm-modules`）才会执行。

## 合约版本

2026-11-17 起 `contracts/` 是 **v2 源码**：基础版新增两阶段管理员转移与有效期上限；升级版把取消提案改为“提案人或达到阈值”，紧急撤销提案增加记录预检，治理成员不得兼任机构密钥，并让紧急撤销不再发出误导性的 `InstitutionChanged`。

Sepolia 上运行的仍是 2026-11-04 / 2026-11-07 部署的 **v1**，`chain/config.json`、`upgrade/config.json` 和现有证据都指向 v1；v2 需要重新部署后才生效，ABI 仍向后兼容。版本对照、运行时代码哈希与复核命令见 [deployment/DEPLOYMENTS.md](deployment/DEPLOYMENTS.md)。

## 真实技术证据与历史演示材料

主网页的取证栏目改用本轮真实 Sepolia 技术证据：3 张 IAB 独立浏览器截图及对应报告，分别展示原版被替代、更正版已紧急撤销、epoch=2 凭证有效。证据与固定区块复核索引位于 `evidence/upgrade-sepolia-independent-browser-acceptance.json`；图片位于 `evidence/upgrade-sepolia-independent-*.jpg`。这些是实际测试操作截图，不能代替团队成员现场材料或现实身份审批。

原 8 张模拟图保留在 `demo-placeholders/images/`，作为有明确标记的历史排练材料。主网页、共享展示资源和证据目录应一起保留，避免相对链接失效。历史模拟材料不改变真实验收状态。

## 模拟研究资料（2026-11-05）

主网页新增「07 · 模拟研究资料」，已按用户要求用明确标记的模拟数据补齐展示材料：16 项核心合成任务、8 项扩展设计场景、15 段虚构角色访谈、7 步流程、48 条三方案对照模型记录、5 项治理假设、4 个模拟分工角色和 10 条答辩问答。汇编与 JSON 位于 `simulation-research/`，独立页面为 `simulation-research/index.html`。

访谈不是受访者记录，工时不是实测，预设结论不是已执行测试。资料中的当前能力说明已对照本轮 Sepolia 证据更新；模拟身份绑定、持有人挑战等未完成功能仍未实现，真实团队现场取证、实际访谈与完整验收状态分别记录。使用 `python3 simulation-research/build.py --standalone-only` 可仅重建该目录的数据、汇编及独立页面；不加此参数还会重写主 HTML 的模拟研究资料区块，请避免与页面编辑同时运行。

## 公共测试网部署与验收（团队操作）

1. 当场新建一个空钱包，仅申请免费的 Sepolia 测试币；不要使用有真实资产的钱包，也不向页面或脚本输入私钥、助记词。
2. Remix 打开 `contracts/ProofPassRegistry.sol`。编译器 **0.8.38**，优化器 **enabled / 200 runs**，EVM **shanghai**。文件名须保持 `ProofPassRegistry.sol`，精确编译输入见 `artifacts/compiler-input.json`。当前源码为基础合约 v2（50 行，含两阶段管理员转移与有效期上限）；没有用整段挤成一行伪装。它仍是单管理员基础合约，不是多签或联盟链。
3. Remix Deploy & Run 选择 **Browser Extension**，确认钱包网络 Sepolia、value 为 0，部署并等待成功回执。Remix VM 不算测试网证据。
4. 执行 `node scripts/verify-deployment.mjs https://你的只读RPC 真实合约地址 真实部署交易哈希`。脚本只读核对链 ID、成功回执、区块哈希、完整运行时代码，默认 dry-run 不写文件；核对无误后加 `--write`，才会写入 `chain/config.json` 并登记 `evidence/sepolia-deployment.json`（旧配置先备份，旧证据不覆盖）。RPC 地址将出现在浏览器配置中，不使用秘密 API 凭据。
5. 管理员连接页面，授权一个新建的机构测试钱包。切换机构钱包，输入虚构信息并登记，等待 **receipt.status=0x1**。保存下载的凭证包和交易证据。机构与现实学校的对应关系由线下准入审核确认。
6. 在另一浏览器打开同一固定配置页面，导入包并查询；修改包的标题或盐应完整性失败，修改网络或合约地址应拒绝。以未授权钱包直接调用 issue 应回退。原机构撤销后，另一浏览器重新查询应显示撤销。
7. 团队亲自拍摄部署、授权、签发、查询、撤销截图，记录查询日期及区块；填写 `P0验收记录.md` 的公共测试网栏。代码和本地测试完成不等于 P0 全部完成。

## 协议与安全边界

链下包：`payload`、32 字节随机 `salt` 和可选历史 `receipt`。哈希仅覆盖固定 schemaVersion=2 的 payload 与原始盐字节：`SHA256(UTF8("ProofPass:v2:") || salt32 || UTF8(canonical(payload)))`。payload 的网络、合约、签发地址全部在承诺内；可信网络及合约来自站点配置，不能由包覆盖。ID 为独立密码学随机 bytes32；不公开身份或盐。交易 value 固定为 0。

编码是有明确定义并测试的受限 JSON 协议：按 UTF-16 键排序，保留数组顺序；只允许安全整数，不允许浮点、无穷、孤立代理字符；不做 Unicode 归一化。它借鉴 RFC 8785 的排序方法，不宣称实现了通用 JCS 的全部输入空间。导入后按解析出的结构进行语义核验，不验证 JSON 文件的原始字节；重复键由 JSON.parse 解释为最后一项，附加 payload 字段直接拒绝。

合约只保存 `(issuer,id) → commitment, registeredAt, validUntil, revoked`。只能授权机构签发，重复 ID 不可覆盖；其他签发方同 ID 使用独立记录；停用地址后不能签发或撤销，历史不会消失；没有重新激活、覆盖、删除功能。紧急密钥失陷处理、多签、轮换、原子更正不在此版本中。

读查询固定在同一区块并复核区块哈希，记录查询时点、区块号和哈希；超过区块新鲜度阈值或网络错误即失败。界面 60 秒后清除“最新”结论，要求重查。回执成功与 finalized 状态分别显示，不把广播等同成功。RPC 本身是依赖方，本版本不是轻客户端，不能对恶意 RPC 提供独立共识验证。

真实适配器没有教学状态覆盖参数。`LocalDemoAdapter` 明确标为模拟，Chain 页面不会实例化；离线 HTML 保持独立可双击，故仍内嵌本地状态实现。持有人挑战及现实身份绑定尚未实现；前三项技术通过不等于完整业务通过。B 校目录匹配只作教学提示，不等于审批。核验报告可导出，但仅代表历史查询时点。

## 原型修复

- 未知和意外状态均待复核；主核验不再把证书自述持有人当独立认证。
- 排序编码使等价字段重排仍可验签；本地事件串行写入，保存完整 SHA-256。
- 增加“重写并重算全部历史”反例：一致性检查仍会通过，明确展示本地日志缺少外部锚点。
- 保留成本模型和公平比较边界；未伪造中心化比较测量或新增实验数据。

## 官方依据

- [Ethereum 网络文档](https://ethereum.org/developers/docs/networks/)：测试网选择与网络边界。
- [Ethereum JSON-RPC](https://ethereum.org/developers/docs/apis/json-rpc/)：eth_call、回执及区块查询。
- [RFC 8785](https://www.rfc-editor.org/info/rfc8785/)：结构化数据确定性编码的参考。

本版本已完成 P0 代码、本地验证及公共测试网双地址核心流程；团队现场取证等完整验收项仍待完成。P1 已追加独立升级版，详见下节；2026-11-07 已完成公共测试网部署核验、两票准入、签发、原子更正、三项包校验、密钥轮换、新密钥实际签发、停用及紧急撤销执行，公共测试网核心业务链路及独立浏览器技术闭环已完成；真实团队现场验收与完整 P0 仍未完成。P2 未开展。依赖审计及兼容性限制见 `P0验收记录.md`。


## 功能升级（2026-11-05）

原网页新增「08 · 功能升级」。已实现独立 `ProofPassGoverned.sol` 合约、2/3 阈值治理、稳定机构编号、签发密钥轮换、原子更正与双向版本关联、停用后的紧急撤销；配套 `upgrade/` 页面和 v3 凭证协议。

运行 `npm run upgrade:demo`，打开 `http://127.0.0.1:8081/upgrade/`，即可用预置虚构账户操作实际本机 EVM 合约；重启会清空。这不是 Sepolia 部署，基础版地址和已保存 v2 凭证不迁移。运行 `npm run compile:upgrade` 编译，`npm run test:upgrade:browser` 检查浏览器流程。完整路线、边界和后续部署方法见 [升级说明](upgrade/升级说明.md)。

新版已完成本机功能验证及 Sepolia 部署参数核验，并完成公共测试网两票准入、签发、原子更正、三项包校验、密钥轮换、新密钥实际签发、停用及紧急撤销执行，核心业务链路及 IAB 独立浏览器技术闭环已完成；真实团队现场取证仍待完成。治理成员自身轮换、持有人挑战、身份绑定、自动通知、公平三后端性能实测和真实现场材料仍不计完成。

运行 `npm run serve` 后访问 `http://127.0.0.1:8080/upgrade/` 可操作已配置的 Sepolia 升级合约；`8081/upgrade/` 仍为临时本机 EVM，不能混用其凭证和回执。
