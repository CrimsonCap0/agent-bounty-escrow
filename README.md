# Agent 任务托管

Week 2 的 Monad Testnet DApp 毛坯 Demo。

## 产品想法

`Agent 任务托管` 是一个面向中文社区、训练营和 AI Agent 场景的小任务托管 DApp。任务发布者发布一个小任务，并把 MON 赏金锁定在智能合约中。执行者接单后提交结果，发布者确认完成，合约自动把赏金释放给执行者。

这个项目想验证一个更 Web3-native 的任务协作流程：

```text
发布任务 -> 锁定赏金 -> 接单 -> 提交结果 -> 确认完成 -> 释放付款
```

第一版可以服务人类执行者，后续可以扩展到 AI Agent 自动接单、提交结果和收款。

## 为什么需要上链

这个产品的核心价值不是“展示任务列表”，而是任务赏金托管、结算、状态记录和钱包信誉。

- 赏金由智能合约托管，而不是由中心化平台保管。
- 任务状态变化公开可验证。
- 付款释放按照合约逻辑执行。
- 执行者的钱包地址可以逐渐积累任务历史。
- 未来 AI Agent 可以使用钱包接任务和收款。

## 为什么适合 Monad

一个任务生命周期会产生多次小额、高频的状态更新：发布任务、接单、提交结果、确认完成、退款等。如果每一步都很慢或手续费很高，小额任务就很难成立。

Monad 的高性能、低延迟和 EVM 兼容性比较适合这种高频小额交互。开发者仍然可以使用 Solidity、MetaMask、Remix、ethers.js、Hardhat 等 EVM 工具。

## 当前 MVP

- Solidity 赏金托管合约
- React 毛坯前端
- MetaMask 钱包连接
- Monad Testnet 网络切换提示
- 未部署合约时可使用演示模式
- 发布任务
- 接受任务
- 提交结果
- 确认完成并释放赏金
- 交易记录展示区域

## Monad Testnet 部署记录

- 合约地址：`0xBab0A82101FbB45257DC87Ec82E312b3F8fb25cB`
- 部署交易 hash：`0x33545c781063e477663e011cd91e4a4af6021f62372427dab96a38562794effb`
- 区块浏览器：`https://testnet.monadvision.com/address/0xBab0A82101FbB45257DC87Ec82E312b3F8fb25cB`

## 项目结构

```text
contracts/AgentBountyEscrow.sol
src/main.jsx
src/styles.css
.env.example
```

## 本地运行

```bash
npm install
npm run dev
```

## GitHub Pages 部署

本项目已经包含 GitHub Actions 部署配置：

```text
.github/workflows/deploy-pages.yml
```

把代码推送到 GitHub 的 `main` 分支后，可以在仓库的 `Settings -> Pages` 中选择 `GitHub Actions` 作为部署来源。部署成功后会得到一个可以公开访问的项目页面。

建议仓库名：

```text
agent-bounty-escrow
```

如果使用 GitHub 用户名 `CrimsonCap0`，项目页面一般会是：

```text
https://CrimsonCap0.github.io/agent-bounty-escrow/
```

## 连接已部署合约

从 `.env.example` 创建 `.env`：

```text
VITE_CONTRACT_ADDRESS=your_deployed_contract_address
```

然后重启本地开发服务器。

## 安全注意事项

- 不要提交 `.env`。
- 不要把私钥、助记词、API Key 写进仓库。
- 这是学习用 MVP，不是生产级托管合约。
- 第一版没有争议仲裁和多方审核机制。
