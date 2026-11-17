---
name: ProofPass Workspace
description: 以凭证操作为中心的机构工作台
colors:
  primary: "#59dfd0"
  primary-hover: "#8af0e4"
  ink: "#e6eef7"
  muted: "#a2b4c9"
  background: "#0b1420"
  surface: "#132131"
  rail: "#0c1826"
  rail-muted: "#91a8bf"
  line: "#293e53"
  control: "#58758e"
  error: "#ffb1bc"
  error-background: "#3c2230"
typography:
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "34px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "-0.025em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "16px"
    lineHeight: 1.65
rounded:
  panel: "24px"
  control: "13px"
spacing:
  compact: "8px"
  control: "12px"
  panel: "24px"
  page: "40px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#06242b"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
---

# ProofPass 工作台设计系统

## Overview

根据用户“不够科技感”的反馈，采用深墨蓝工作区、冷光青主操作和蓝青数字凭证面板。保留圆润布局、留白与默认收起的技术身份；顶部相连的线框块为装饰，不表示链状态。

## Colors

深墨蓝背景与分层蓝色表面建立层级，冷光青用于主操作与焦点；错误用浅红文字和暗红底色，环境状态保留文字。草稿使用蓝青色表面和细描边，明确声明不代表已上链。

## Typography

使用本地中文系统字体，不引入字体网络依赖。34px 页面标题、20px 栏目标题、18px 面板标题，正文基准 16px、表单输入 15px、标签 13px、辅助信息 12px。地址保持可选择，不用展示文案替代真实值。

## Layout

桌面端 232px 侧栏；1200px 以下为 208px。工作区上下文在顶端，签发表单和草稿/核验区域两列排列。1000px 以下内容单列，760px 以下侧栏变顶部导航。页面边距桌面 40px、手机 16px。

## Elevation & Depth

采用留白和表面颜色区分层级，主面板不设边框或阴影。输入框与焦点仍有明确边界。导航与工作区为两个连续背景面。

## Shapes

面板圆角 24px，输入控件圆角 13px，操作按钮使用 13px 圆角，环境标记保留胶囊圆角。卡片之间留出 28px 间距。

## Components

侧栏导航支持方向键、Home、End；Tab 进入当前工作面板。手机导航同步更新 aria-orientation。当前栏目同步到顶部路径与 URL hash。

草稿标题、持有人代号与有效期随表单更新，不依赖生成图像；只使用 textContent，预览数据不构成上链状态。网络、链上报告与提案沿用实际数据。

账户地址与权限、机构技术字段默认收起，可通过具名 summary 展开。当前机构名称保持可见，真实地址不被替换或伪造。

主操作为青色实心按钮配深色文字，辅助查询为描边，撤销入口独立展开。处理中禁用重复操作，缺填项获得焦点，错误文本保留恢复提示。动效仅 180ms 状态过渡，支持减少动态效果。

## Do's and Don'ts

- 维持账户、机构、签发、治理、查询的任务关系。
- 所有环境来源与数据有效性必须明确。
- 不添加虚构数量、成功率、交易历史或机构认证标记。
- 不恢复被用户否定的绿色大横幅，也不把业务按钮做成营销 CTA。
- 独立截图检查：`node scripts/upgrade-tech-check.mjs`；业务回归：`node scripts/upgrade-browser-check.mjs`。

## 当前验证

18 项界面检查通过。正文、辅助文案、主按钮与凭证辅助文案对比度分别为 13.91、6.76、9.95、7.32；输入框边界对比度为 3.60。详见 `evidence/upgrade-tech-contrast.json`。本轮仅调整样式和装饰 SVG，未变更业务逻辑。

## 空间微调 · 第一轮

保持深蓝与冷光青主题，桌面顶栏降为 64px，标题区及账户区收紧，账户与机构采用更均衡的列宽，工作区间距为 24px。1440px 宽度下表单顶部为 431px；手机同步缩减标题留白，保留控件触摸高度。布局、键盘与缩放共 18 项检查通过，记录见 `evidence/upgrade-layout-ui.json`。后续根据实际使用反馈逐步调整，不同时替换主题与业务结构。

## 字体微调

2026-11-05：中文优先 PingFang SC，Windows 回退 Microsoft YaHei；品牌英文和标题中的拉丁字母使用本机 Avenir Next，缺失时回退无衬线。无新增网络字体请求或字体文件分发。标题使用 500 字重，栏目 600，标签 500；日期采用等宽数字，地址和代码使用等宽字体。手机标题为 26px、凭证标题为 24px。正文和标题采用渐进式 pretty / balance 换行。

复用现有布局浏览器脚本，18 项检查通过，并查看桌面与手机实际截图。Impeccable 0.1.18 引擎不可用，自动字体扫描未执行；不将浏览器检查等同该扫描。截图及结果见 `evidence/upgrade-type-*`。

## 实测证据归档 · 2026-11-07

侧栏新增“实测证据”，与主网页第 06 栏共享同一份静态生成内容、图片和样式。三份 IAB 原始截图保留原貌，切换后展示对应查询区块、时间、内容完整性和报告下载；八条执行交易按顺序展示原始回执链接。新增栏目隐藏操作账户区，不发起钱包交易。手机导航改为四列图标与文字布局，避免第四项溢出。深蓝、青色、字体及圆角沿用既有设计。数据从保存的证据 JSON 生成，真实技术证据与模拟研究资料继续分别标明。
