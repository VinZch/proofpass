# ProofPass 升级版

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

现有项目：静态 HTML/CSS、JavaScript ES modules、ethers、Solidity；本机实验使用 Ganache。不是新建技术栈。

## Users

现有流程中的机构签发方、治理成员与独立审核者。用户正在本机演示、升级和整理课程项目材料。

## Product Purpose

以机构编号维护凭证承诺、版本与撤销状态。机构密钥可轮换，证书更正可在一笔交易中完成，关键机构权限须由三个治理账户中的两个批准。

## Capabilities and Constraints

基础版与升级版均有各自的 Sepolia 部署和证据。升级版合约为 `0x623b2e6a55003da0aa144ef0ec53547af3f61410`，已完成两票准入、实际签发、原子更正、密钥轮换、epoch=2 新密钥签发、停用和紧急撤销，并通过独立浏览器的三包核验。基础版回执不作为升级版证据。

升级版固定三个治理账户、至少两票，链下包采用 v3 协议。本次三个账户来自同一本机 MetaMask，不代表三家独立机构。机构真实身份、持有人身份与学校认可均不由链上核验自动证明；真实团队现场材料仍待完成。

## Brand Commitments

项目名称 ProofPass。用户明确要求圆润界面，随后否定原绿色页面并要求推倒重做。当前重设计保留适度圆角，替换原布局和色系。

## Evidence on Hand

本机与 Sepolia 技术证据均位于 `evidence/`。本轮页面使用实际 Sepolia 操作截图：IAB 新独立标签页未连接钱包，保存了原版被替代、更正版已紧急撤销、epoch=2 凭证有效的三份报告和截图；三份内容匹配，机构均已停用。索引为 `evidence/upgrade-sepolia-independent-browser-acceptance.json`，固定区块 RPC 重算与报告一致。

浏览器隔离仍使用同一 PublicNode RPC，不代表不同提供商交叉验证；历史 Safari 观察未成功导出报告，不归入此次三份 IAB 成果。技术截图不是成员现场证据。模拟访谈、工时、角色和预设实验继续明确标记模拟，不能作为实测结果。
