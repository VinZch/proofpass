# 审核证据包使用说明

先读 `ProofPass_审核与上链实施任务书.md`。

`evidence/original_audit_results.json` 是本次实际运行的核心逻辑实验记录，共11组，其中第一组覆盖8个教学案例。发现问题不等于产品通过11项测试。

复跑：安装支持 Web Crypto 的 Node.js（本次使用 v22.16.0），在解压目录执行：

```sh
node evidence/audit_original.cjs
```

脚本会读取同目录上一级的原始 HTML，使用真实 Web Crypto 与 DOM 替身执行核心逻辑，然后重新生成 JSON。它不向外部网站发请求，不操作任何真实钱包或网络。它不是完整浏览器兼容性测试，也不是区块链部署脚本。

`requirements/` 为原始ZIP中三份主要文档的文字提取，供核对要求。没有包含字体文件或缓存。

本包没有新合约部署、没有真实交易哈希，没有声称实现升级任务书里的后续功能。
