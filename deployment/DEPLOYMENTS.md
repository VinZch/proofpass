# 合约版本与部署状态

本文件是合约源码版本与公共测试网部署的唯一对照表。**源码版本不要求等于已部署版本**：
前端用 `chain/config.json`、`upgrade/config.json` 里的 `runtimeCodeHash` 固定已部署字节码，
改源码不会改动链上合约，也不会自动改动本地配置。

## 已部署（Sepolia，chainId 11155111）

| 版本 | 合约 | 地址 | 部署交易 | 运行时代码哈希 | 部署区块 |
|---|---|---|---|---|---|
| v1 | `ProofPassRegistry` | `0xdaf9d8f06bc5895a79a4cdae66ec3ea262435149` | `0x31295221993f326284ec0d5f16c7cc5978fddbc831a6a648897e2d6169677473` | `0xe78d184febd310ae8838745377afc6f537cb982cca3b983d0e66578edbdb665c` | 12062149 |
| v1 | `ProofPassGoverned` | `0x623b2e6a55003da0aa144ef0ec53547af3f61410` | `0x069e1a31d7ffd37aaaa17e079c120633c7eab8bb7d1bb0a30983a51e12d72bb7` | `0x290a4d7de547f18edd9876758adfcf27834a9808a258386f4fa2f75c427f9591` | 12081167 |

`chain/config.json`、`upgrade/config.json` 以及 `evidence/` 中的公共测试网证据仍对应上述 v1 部署。

复核 v1 部署（只读，默认 dry-run，不写文件）：

```sh
node scripts/verify-deployment.mjs https://ethereum-sepolia.publicnode.com \
  0xdaf9d8f06bc5895a79a4cdae66ec3ea262435149 \
  0x31295221993f326284ec0d5f16c7cc5978fddbc831a6a648897e2d6169677473 \
  --artifact deployment/sepolia-registry/ProofPassRegistry.deployed.json

node scripts/verify-upgrade-deployment.mjs https://ethereum-sepolia.publicnode.com \
  0x623b2e6a55003da0aa144ef0ec53547af3f61410 \
  0x069e1a31d7ffd37aaaa17e079c120633c7eab8bb7d1bb0a30983a51e12d72bb7 \
  deployment/upgrade-sepolia/governors.json 2 0xcdf9996213efdfc6014f9ab4c3554cd4e6e398ac \
  --artifact deployment/upgrade-sepolia/artifact.json
```

确认无误后加 `--write` 才会更新配置并登记新证据；历史证据不会被覆盖。

## 源码 v2（2026-11-17，未部署）

| 合约 | 当前源码运行时代码哈希 | 主要变更 |
|---|---|---|
| `ProofPassRegistry` | `0x480073695cc7d9922a45d51fd2cd72140bed77471d611e2dfc7f7168cc7f611e` | 两阶段管理员转移（`transferAdmin` / `acceptAdmin` / `cancelAdminTransfer`）与管理员事件；`validUntil` 上限 10 年 |
| `ProofPassGoverned` | `0xc2d87548d7565d58747d1de5a0cf9298801fe210f4dfbb763d90f04269af4315` | 取消提案需提案人或达到阈值；紧急撤销提案预检记录存在且未撤销；治理成员不得兼任机构签发密钥；有效期上限 10 年；紧急撤销不再发 `InstitutionChanged` |

**ABI 兼容性**：v2 ABI 是 v1 的严格超集，现有 UI 调用的函数签名和 `proposals` 返回结构都没有变。
因此 `chain/` 与 `upgrade/` 页面连到 v1 部署仍然正常工作；`transferAdmin`、`proposer` 等新增函数
只有重新部署后才可用。

重新部署后，按 README「公共测试网部署与验收」执行，用 `--write` 写入新配置并登记证据。
新部署不会让旧证据失效，两版可以并存对照。

## 文件对应

- v1 源码与产物（冻结，勿改）：`deployment/sepolia-registry/`（基础版）、`deployment/upgrade-sepolia/`（升级版）。
- 当前源码编译产物：`artifacts/`、`chain/abi.json`、`upgrade/abi.json`。
- 证据哈希清单：`evidence/manifest.json`（`npm run evidence:verify` 校验）。
