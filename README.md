# ProofPass：离线教学版与 Chain 测试网版

按 2026-11-03 实施任务书修改。原始审核包保存在 `audit_source/`，离线版为根目录 `ProofPass_跨校证书核验实验室.html`，真实合约前端在 `chain/`，治理工作台在 `upgrade/`。

基础版与升级版都已部署到 Sepolia 测试网并完成核心业务流程；**完整 P0、团队现场取证、现实身份与学校审批仍未完成**。当前状态、时间线与证据索引见 [STATUS.md](STATUS.md)；信任边界与已知限制见 [SECURITY.md](SECURITY.md)；合约版本对照见 [deployment/DEPLOYMENTS.md](deployment/DEPLOYMENTS.md)。

## 运行

- 离线版：双击根目录 HTML，保留原界面、文件 SHA-256 比较、ECDSA 和八种案例。无安装、无钱包、无后端。新版本的排序编码与旧版签名格式不兼容；本地会话密钥刷新仍会失效，跨浏览器核验由 Chain 版完成。
- Chain 版：在此目录 `npm run serve`，访问 `http://127.0.0.1:8080/chain/`。已随项目附带浏览器 ethers 库，不依赖 CDN。配置 RPC 后审核员无需连接钱包；没有 RPC 时使用钱包提供的只读请求。
- 开发：Node 22+（本次 Node 26.5.0），`npm ci`、`npm run compile`、`npm test`。代码质量：`npm run lint`（ESLint）、`npm run format:check`（Prettier）、`npm run check:artifacts`（源码/ABI/冻结部署材料一致性）。浏览器流程：`node scripts/browser-check.mjs`；默认使用 macOS Chrome，可用 `PROOFPASS_CHROME=/path/to/chrome` 覆盖，找不到时回退 Playwright 自带 Chromium。测试代码及依赖只供本地开发，不发布 node_modules 或本地 RPC 服务。

## 版本控制与证据

- 版本库：本目录为完整源码仓库（`main` 分支），远端 `https://github.com/VinZch/proofpass` 的 `main` 是 GitHub Pages 发布分支，源码推送到该仓库的 `source` 分支。`deployment/github-pages/` 是发布副本，不进入源码提交。
- 测试与证据分离：`npm test`、`node scripts/browser-check.mjs` 等只写 `artifacts/test-output/`，不再改写 `evidence/`。
- 证据登记：`node scripts/evidence.mjs record <文件> --note "说明"` 写入 `evidence/` 并更新 `evidence/manifest.json`（sha256、大小、登记时间、提交号）。
- 证据校验：`npm run evidence:verify` 重算全部哈希；被改动、缺失或未登记的文件都会报错并以非零码退出。
- 部署核验：`node scripts/verify-deployment.mjs <RPC> <地址> <部署交易哈希>` 默认 dry-run，不写任何文件；确认后加 `--write` 才写 `chain/config.json` 并把证据登记进 manifest，旧配置先备份、旧证据不覆盖。
- 交付 zip 与 `deployment/public-site/dist/` 视为生成物，不入库；需要时重新打包或挂到 GitHub Release。
- 前端适配器已拆成 `chain/rpc.js`、`chain/deployment.js`、`chain/transaction.js` 与 `chain/adapters.js`；`chain/abi.json`、`upgrade/abi.json` 由编译脚本生成，不要手改。
- 跳过的 `upgrade-bootstrap` 用例需要 `npm run test:vm`（`--experimental-vm-modules`）才会执行。

## 合约版本

2026-11-17 起 `contracts/` 是 **v2 源码**：基础版新增两阶段管理员转移与有效期上限；升级版把取消提案改为“提案人或达到阈值”，紧急撤销提案增加记录预检，治理成员不得兼任机构密钥，并让紧急撤销不再发出误导性的 `InstitutionChanged`。

Sepolia 上运行的仍是 2026-11-04 / 2026-11-07 部署的 **v1**，`chain/config.json`、`upgrade/config.json` 和现有证据都指向 v1；v2 需要重新部署后才生效，ABI 仍向后兼容。版本对照、运行时代码哈希与复核命令见 [deployment/DEPLOYMENTS.md](deployment/DEPLOYMENTS.md)。

## 公共测试网部署与验收（团队操作）

1. 当场新建一个空钱包，仅申请免费的 Sepolia 测试币；不要使用有真实资产的钱包，也不向页面或脚本输入私钥、助记词。
2. Remix 打开 `contracts/ProofPassRegistry.sol`。编译器 **0.8.38**，优化器 **enabled / 200 runs**，EVM **shanghai**。文件名须保持 `ProofPassRegistry.sol`，精确编译输入见 `artifacts/compiler-input.json`。当前源码为基础合约 v2（50 行，含两阶段管理员转移与有效期上限）；没有用整段挤成一行伪装。它仍是单管理员基础合约，不是多签或联盟链。
3. Remix Deploy & Run 选择 **Browser Extension**，确认钱包网络 Sepolia、value 为 0，部署并等待成功回执。Remix VM 不算测试网证据。
4. 执行 `node scripts/verify-deployment.mjs https://你的只读RPC 真实合约地址 真实部署交易哈希`。脚本只读核对链 ID、成功回执、区块哈希、完整运行时代码，默认 dry-run 不写文件；核对无误后加 `--write`，才会写入 `chain/config.json` 并登记 `evidence/sepolia-deployment.json`（旧配置先备份，旧证据不覆盖）。RPC 地址将出现在浏览器配置中，不使用秘密 API 凭据。
5. 管理员连接页面，授权一个新建的机构测试钱包。切换机构钱包，输入虚构信息并登记，等待 **receipt.status=0x1**。保存下载的凭证包和交易证据。机构与现实学校的对应关系由线下准入审核确认。
6. 在另一浏览器打开同一固定配置页面，导入包并查询；修改包的标题或盐应完整性失败，修改网络或合约地址应拒绝。以未授权钱包直接调用 issue 应回退。原机构撤销后，另一浏览器重新查询应显示撤销。
7. 团队亲自拍摄部署、授权、签发、查询、撤销截图，记录查询日期及区块；填写 `P0验收记录.md` 的公共测试网栏。代码和本地测试完成不等于 P0 全部完成。

## 原型修复

- 未知和意外状态均待复核；主核验不再把证书自述持有人当独立认证。
- 排序编码使等价字段重排仍可验签；本地事件串行写入，保存完整 SHA-256。
- 增加“重写并重算全部历史”反例：一致性检查仍会通过，明确展示本地日志缺少外部锚点。
- 保留成本模型和公平比较边界；未伪造中心化比较测量或新增实验数据。

## 文档与证据索引

| 文档 | 内容 |
|---|---|
| [STATUS.md](STATUS.md) | 当前状态、Sepolia 时间线、证据与模拟材料、未完成事项、依赖说明 |
| [SECURITY.md](SECURITY.md) | 信任模型、已实现的安全属性、已知限制、密钥建议 |
| [deployment/DEPLOYMENTS.md](deployment/DEPLOYMENTS.md) | v1 已部署地址/交易/代码哈希与 v2 源码对照、复核命令 |
| [deployment/upgrade-sepolia/README.md](deployment/upgrade-sepolia/README.md) | 升级版部署包、复核与历史提案记录 |
| [upgrade/升级说明.md](upgrade/升级说明.md) | 升级版路线、边界与后续部署方法 |
| [P0验收记录.md](P0验收记录.md) | P0 验收口径、历史记录与限制 |
| `evidence/manifest.json` | 证据文件哈希清单（`npm run evidence:verify`） |

## 官方依据

- [Ethereum 网络文档](https://ethereum.org/developers/docs/networks/)：测试网选择与网络边界。
- [Ethereum JSON-RPC](https://ethereum.org/developers/docs/apis/json-rpc/)：eth_call、回执及区块查询。
- [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785/)：结构化数据确定性编码的参考。
