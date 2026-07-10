import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { ethers } from "ethers";
import {
  ArrowUpRight,
  Bot,
  CheckCircle2,
  ClipboardList,
  Clock3,
  ExternalLink,
  FileText,
  HandCoins,
  Loader2,
  PlugZap,
  RefreshCcw,
  Send,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import "./styles.css";

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || "";
const MONAD_CHAIN_ID = "0x279f";
const MONAD_EXPLORER = "https://testnet.monadvision.com";
const MONAD_RPC_URL = "https://testnet-rpc.monad.xyz";

const ABI = [
  "function taskCount() view returns (uint256)",
  "function createTask(string metadataURI,uint64 deadline) payable returns (uint256)",
  "function acceptTask(uint256 taskId)",
  "function submitTask(uint256 taskId,string resultURI)",
  "function approveTask(uint256 taskId)",
  "function cancelTask(uint256 taskId)",
  "function refundExpired(uint256 taskId)",
  "function getTask(uint256 taskId) view returns ((uint256 id,address creator,address worker,uint256 bounty,string metadataURI,string resultURI,uint64 createdAt,uint64 deadline,uint8 status))",
];

const statusLabels = ["开放中", "已接单", "已提交", "已放款", "已取消", "已退款"];

const starterTasks = [
  {
    id: 1,
    title: "整理 Monad AI Agent 资料",
    brief: "收集 3 个相关链接，并写一段适合新人理解的 200 字总结。",
    creator: "0xCB10...5A24",
    worker: "",
    bounty: "0.08",
    status: 0,
    deadlineText: "明天",
    resultURI: "",
  },
  {
    id: 2,
    title: "检查一个 Solidity 托管合约",
    brief: "找出最小任务托管合约里的 3 个潜在风险，并给出修改建议。",
    creator: "0xA93D...D5FA",
    worker: "0x7025...1cbf",
    bounty: "0.12",
    status: 1,
    deadlineText: "2 天",
    resultURI: "",
  },
];

function shortAddress(address) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function parseMetadata(metadataURI) {
  const [title = "未命名任务", ...rest] = metadataURI.split("\n");
  return { title, brief: rest.join("\n") || "暂无详情。" };
}

function getInjectedWalletName(provider, fallback = "浏览器钱包") {
  if (provider?.isOkxWallet || provider?.isOKExWallet) return "OKX Wallet";
  if (provider?.isMetaMask) return "MetaMask";
  if (provider?.isRabby) return "Rabby";
  if (provider?.isCoinbaseWallet) return "Coinbase Wallet";
  return fallback;
}

function getInjectedWalletId(provider, index = 0) {
  if (provider?.isOkxWallet || provider?.isOKExWallet) return "com.okx.wallet";
  if (provider?.isMetaMask) return "io.metamask";
  if (provider?.isRabby) return "io.rabby";
  if (provider?.isCoinbaseWallet) return "com.coinbase.wallet";
  return `legacy-wallet-${index}`;
}

function dedupeWallets(wallets) {
  const providerRefs = new Set();
  const seen = new Set();
  return wallets.filter((wallet) => {
    if (providerRefs.has(wallet.provider)) return false;
    providerRefs.add(wallet.provider);

    const key = wallet.rdns || wallet.id || wallet.name;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getLegacyWallets() {
  if (typeof window === "undefined" || !window.ethereum) return [];

  const providers = window.ethereum.providers?.length ? window.ethereum.providers : [window.ethereum];
  return providers.map((injectedProvider, index) => {
    const name = getInjectedWalletName(injectedProvider);
    const id = getInjectedWalletId(injectedProvider, index);
    return {
      id,
      rdns: id,
      name,
      provider: injectedProvider,
      source: "legacy",
    };
  });
}

function App() {
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState("");
  const [wallets, setWallets] = useState([]);
  const [selectedWallet, setSelectedWallet] = useState(null);
  const [showWalletPicker, setShowWalletPicker] = useState(false);
  const [tasks, setTasks] = useState(starterTasks);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTx, setActiveTx] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({
    title: "体验一个 AI Agent 工作流",
    brief: "跑通一个小型 Agent 工作流，并提交结果链接或简短说明。",
    bounty: "0.05",
    deadlineDays: "3",
  });
  const [resultDrafts, setResultDrafts] = useState({});

  const hasContract = ethers.isAddress(CONTRACT_ADDRESS);
  const isMonad = chainId === MONAD_CHAIN_ID;

  const provider = useMemo(() => {
    if (!selectedWallet?.provider) return null;
    return new ethers.BrowserProvider(selectedWallet.provider);
  }, [selectedWallet]);

  const readProvider = useMemo(() => new ethers.JsonRpcProvider(MONAD_RPC_URL), []);

  async function connectWallet(wallet = selectedWallet) {
    if (!wallet && wallets.length > 1) {
      setShowWalletPicker(true);
      return;
    }

    const targetWallet = wallet || wallets[0];
    if (!targetWallet?.provider) {
      setNotice("未检测到可用钱包，请确认 MetaMask 已安装并启用。");
      return;
    }

    const accounts = await targetWallet.provider.request({ method: "eth_requestAccounts" });
    setSelectedWallet(targetWallet);
    setShowWalletPicker(false);
    setAccount(accounts[0]);
    const currentChain = await targetWallet.provider.request({ method: "eth_chainId" });
    setChainId(currentChain);
    localStorage.setItem("preferredWallet", targetWallet.id || targetWallet.name);
  }

  async function switchToMonad() {
    if (!selectedWallet?.provider) {
      setShowWalletPicker(true);
      return;
    }
    try {
      await selectedWallet.provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: MONAD_CHAIN_ID }],
      });
    } catch (error) {
      if (error.code === 4902) {
        await selectedWallet.provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: MONAD_CHAIN_ID,
              chainName: "Monad Testnet",
              nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
              rpcUrls: ["https://testnet-rpc.monad.xyz"],
              blockExplorerUrls: [MONAD_EXPLORER],
            },
          ],
        });
      } else {
        setNotice(error.message || "切换网络失败。");
      }
    }
  }

  async function getContract(withSigner = false) {
    if (!hasContract) return null;
    if (!withSigner) return new ethers.Contract(CONTRACT_ADDRESS, ABI, readProvider);
    if (!provider) {
      setShowWalletPicker(true);
      throw new Error("请先选择并连接钱包。");
    }
    const signerOrProvider = withSigner ? await provider.getSigner() : provider;
    return new ethers.Contract(CONTRACT_ADDRESS, ABI, signerOrProvider);
  }

  async function loadTasks() {
    if (!hasContract) return;
    setIsLoading(true);
    try {
      const contract = await getContract(false);
      const count = Number(await contract.taskCount());
      const items = [];
      for (let id = 1; id <= count; id += 1) {
        const task = await contract.getTask(id);
        const meta = parseMetadata(task.metadataURI);
        items.push({
          id: Number(task.id),
          title: meta.title,
          brief: meta.brief,
          creator: task.creator,
          worker: task.worker === ethers.ZeroAddress ? "" : task.worker,
          bounty: ethers.formatEther(task.bounty),
          status: Number(task.status),
          deadlineText: new Date(Number(task.deadline) * 1000).toLocaleDateString(),
          resultURI: task.resultURI,
        });
      }
      setTasks(items.reverse());
    } catch (error) {
        setNotice(error.shortMessage || error.message || "读取任务失败。");
    } finally {
      setIsLoading(false);
    }
  }

  async function runTx(actionName, onchainAction, demoAction) {
    setNotice("");
    setActiveTx(actionName);
    try {
      if (hasContract && account && isMonad && selectedWallet) {
        const tx = await onchainAction();
        setNotice(`交易已提交：${tx.hash}`);
        await tx.wait();
        setNotice(`交易已确认：${tx.hash}`);
        await loadTasks();
      } else {
        await new Promise((resolve) => setTimeout(resolve, 450));
        demoAction();
        setNotice("演示模式已在本地更新。部署合约并填写地址后，可切换为真实链上交易。");
      }
    } catch (error) {
      setNotice(error.shortMessage || error.message || "交易失败。");
    } finally {
      setActiveTx("");
    }
  }

  async function createTask(event) {
    event.preventDefault();
    const metadataURI = `${form.title}\n${form.brief}`;
    const deadline = Math.floor(Date.now() / 1000) + Number(form.deadlineDays || 1) * 86400;
    await runTx(
      "createTask",
      async () => {
        const contract = await getContract(true);
        return contract.createTask(metadataURI, deadline, { value: ethers.parseEther(form.bounty || "0") });
      },
      () => {
        setTasks((items) => [
          {
            id: Date.now(),
            title: form.title,
            brief: form.brief,
            creator: account ? shortAddress(account) : "0xCreator",
            worker: "",
            bounty: form.bounty || "0",
            status: 0,
            deadlineText: `${form.deadlineDays || 1} 天`,
            resultURI: "",
          },
          ...items,
        ]);
      }
    );
  }

  async function acceptTask(taskId) {
    await runTx(
      "acceptTask",
      async () => {
        const contract = await getContract(true);
        return contract.acceptTask(taskId);
      },
      () => setTasks((items) => items.map((task) => (task.id === taskId ? { ...task, status: 1, worker: account ? shortAddress(account) : "0xWorker" } : task)))
    );
  }

  async function submitTask(taskId) {
    const resultURI = resultDrafts[taskId] || "https://example.com/result";
    await runTx(
      "submitTask",
      async () => {
        const contract = await getContract(true);
        return contract.submitTask(taskId, resultURI);
      },
      () => setTasks((items) => items.map((task) => (task.id === taskId ? { ...task, status: 2, resultURI } : task)))
    );
  }

  async function approveTask(taskId) {
    await runTx(
      "approveTask",
      async () => {
        const contract = await getContract(true);
        return contract.approveTask(taskId);
      },
      () => setTasks((items) => items.map((task) => (task.id === taskId ? { ...task, status: 3 } : task)))
    );
  }

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const eip6963Wallets = [];
    let legacyTimer = null;

    const publishWallets = () => {
      if (eip6963Wallets.length > 0) {
        setWallets(dedupeWallets(eip6963Wallets));
        return;
      }

      setWallets(dedupeWallets(getLegacyWallets()));
    };

    const addWallet = (wallet) => {
      eip6963Wallets.push(wallet);
      publishWallets();
    };

    const onAnnounceProvider = (event) => {
      const { info, provider: announcedProvider } = event.detail;
      addWallet({
        id: info.uuid || info.rdns || info.name,
        rdns: info.rdns,
        name: info.name,
        icon: info.icon,
        provider: announcedProvider,
        source: "eip6963",
      });
    };

    window.addEventListener("eip6963:announceProvider", onAnnounceProvider);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    legacyTimer = window.setTimeout(publishWallets, 500);

    return () => {
      window.removeEventListener("eip6963:announceProvider", onAnnounceProvider);
      if (legacyTimer) window.clearTimeout(legacyTimer);
    };
  }, []);

  useEffect(() => {
    if (!selectedWallet?.provider) return undefined;

    selectedWallet.provider.request({ method: "eth_accounts" }).then(([first]) => {
      setAccount(first || "");
    });
    selectedWallet.provider.request({ method: "eth_chainId" }).then(setChainId);

    const onAccountsChanged = ([first]) => setAccount(first || "");
    const onChainChanged = (currentChainId) => setChainId(currentChainId);
    selectedWallet.provider.on?.("accountsChanged", onAccountsChanged);
    selectedWallet.provider.on?.("chainChanged", onChainChanged);

    return () => {
      selectedWallet.provider.removeListener?.("accountsChanged", onAccountsChanged);
      selectedWallet.provider.removeListener?.("chainChanged", onChainChanged);
    };
  }, [selectedWallet]);

  useEffect(() => {
    if (hasContract) loadTasks();
  }, [hasContract, account, chainId]);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Monad Testnet MVP</p>
          <h1>Agent 任务托管</h1>
        </div>
        <div className="actions">
          {hasContract ? (
            <a className="link-button" href={`${MONAD_EXPLORER}/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer">
              <ExternalLink size={16} />
              区块浏览器
            </a>
          ) : (
            <span className="mode-badge">演示模式</span>
          )}
          {account ? (
            <button className="wallet-button" type="button" onClick={() => setShowWalletPicker(true)}>
              <Wallet size={16} />
              {selectedWallet?.name || "已连接"} · {shortAddress(account)}
            </button>
          ) : (
            <button className="primary" type="button" onClick={() => connectWallet()}>
              <PlugZap size={16} />
              连接钱包
            </button>
          )}
        </div>
      </header>

      {showWalletPicker ? (
        <section className="wallet-picker">
          <div>
            <h2>选择钱包</h2>
            <p>检测到多个浏览器钱包，请选择这次要用于 Monad Testnet 交互的钱包。</p>
          </div>
          <div className="wallet-options">
            {wallets.map((wallet) => (
              <button key={wallet.id || wallet.name} type="button" onClick={() => connectWallet(wallet)}>
                {wallet.icon ? <img src={wallet.icon} alt="" /> : <Wallet size={18} />}
                {wallet.name}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="summary-grid">
        <div className="summary-cell">
          <Bot size={18} />
          <span>场景</span>
          <strong>人类 / Agent 小任务</strong>
        </div>
        <div className="summary-cell">
          <ShieldCheck size={18} />
          <span>托管</span>
          <strong>赏金锁定在合约中</strong>
        </div>
        <div className="summary-cell">
          <HandCoins size={18} />
          <span>结算</span>
          <strong>确认完成后释放 MON</strong>
        </div>
        <div className="summary-cell">
          <Clock3 size={18} />
          <span>网络</span>
          <strong>{isMonad ? "Monad Testnet" : "未连接"}</strong>
        </div>
      </section>

      {!isMonad && account ? (
        <div className="notice-row">
          <span>钱包已连接，但当前不在 Monad Testnet。</span>
          <button type="button" onClick={switchToMonad}>切换网络</button>
        </div>
      ) : null}

      <section className="workspace">
        <form className="creator-panel" onSubmit={createTask}>
          <div className="section-title">
            <ClipboardList size={18} />
            <h2>发布赏金任务</h2>
          </div>
          <label>
            任务标题
            <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          </label>
          <label>
            任务说明
            <textarea rows="4" value={form.brief} onChange={(event) => setForm({ ...form, brief: event.target.value })} />
          </label>
          <div className="field-row">
            <label>
              赏金 MON
              <input value={form.bounty} onChange={(event) => setForm({ ...form, bounty: event.target.value })} />
            </label>
            <label>
              截止天数
              <input value={form.deadlineDays} onChange={(event) => setForm({ ...form, deadlineDays: event.target.value })} />
            </label>
          </div>
          <button className="primary wide" type="submit" disabled={activeTx === "createTask"}>
            {activeTx === "createTask" ? <Loader2 className="spin" size={16} /> : <Send size={16} />}
            发布任务
          </button>
          <p className="hint">第一版把简短任务说明写入链上。后续可以把长文本、附件和 Agent 输出迁移到 IPFS 或普通 URL。</p>
        </form>

        <section className="task-panel">
          <div className="section-title split">
            <div>
              <FileText size={18} />
              <h2>任务大厅</h2>
            </div>
            <button className="ghost" type="button" onClick={loadTasks} disabled={!hasContract || isLoading}>
              <RefreshCcw size={15} />
              刷新
            </button>
          </div>
          <div className="task-list">
            {tasks.map((task) => (
              <article className="task-card" key={task.id}>
                <div className="task-head">
                  <div>
                    <span className={`status status-${task.status}`}>{statusLabels[task.status]}</span>
                    <h3>{task.title}</h3>
                  </div>
                  <strong>{Number(task.bounty).toFixed(3)} MON</strong>
                </div>
                <p>{task.brief}</p>
                <dl>
                  <div>
                    <dt>发布者</dt>
                    <dd>{shortAddress(task.creator) || task.creator}</dd>
                  </div>
                  <div>
                    <dt>执行者</dt>
                    <dd>{shortAddress(task.worker) || task.worker || "未接单"}</dd>
                  </div>
                  <div>
                    <dt>截止</dt>
                    <dd>{task.deadlineText}</dd>
                  </div>
                </dl>
                {task.status === 1 ? (
                  <input
                    className="result-input"
                    placeholder="结果链接或 hash"
                    value={resultDrafts[task.id] || ""}
                    onChange={(event) => setResultDrafts({ ...resultDrafts, [task.id]: event.target.value })}
                  />
                ) : null}
                {task.resultURI ? <p className="result-line">结果：{task.resultURI}</p> : null}
                <div className="task-actions">
                  <button type="button" onClick={() => acceptTask(task.id)} disabled={task.status !== 0 || activeTx}>
                    <ArrowUpRight size={15} />
                    接单
                  </button>
                  <button type="button" onClick={() => submitTask(task.id)} disabled={task.status !== 1 || activeTx}>
                    <Send size={15} />
                    提交
                  </button>
                  <button type="button" onClick={() => approveTask(task.id)} disabled={task.status !== 2 || activeTx}>
                    <CheckCircle2 size={15} />
                    确认放款
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>

      <section className="log-panel">
        <h2>交易记录</h2>
        <div className="terminal">
          <p>{notice || "准备就绪。可以连接钱包，也可以先用演示模式体验流程。"}</p>
          {hasContract ? <p>合约地址：{CONTRACT_ADDRESS}</p> : <p>尚未配置合约地址。部署后在 .env 中设置 VITE_CONTRACT_ADDRESS。</p>}
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
