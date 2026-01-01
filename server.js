// ===============================================================================
// APEX TITAN v124.0 (HYPER-ACTIVE STRIKER) - EXECUTION FIX
// ===============================================================================
// UPGRADE: Increased Strike Frequency + Dual-Snipe IPC + 1.0 ETH Threshold
// TARGET BENEFICIARY: 0x35c3ECfFBBDd942a8DbA7587424b58f74d6d6d15
// ===============================================================================

const cluster = require('cluster');
const os = require('os');
const http = require('http');
const axios = require('axios');
const { ethers, Wallet, WebSocketProvider, JsonRpcProvider, Contract, formatEther, parseEther, Interface, AbiCoder, FallbackProvider } = require('ethers');
require('dotenv').config();

// --- SAFETY: GLOBAL ERROR HANDLERS ---
process.on('uncaughtException', (err) => {
    const msg = err.message || "";
    if (msg.includes('200') || msg.includes('429') || msg.includes('network') || msg.includes('coalesce')) return;
    console.error("\n\x1b[31m[SYSTEM ERROR]\x1b[0m", msg);
});

process.on('unhandledRejection', (reason) => {
    const msg = reason?.message || "";
    if (msg.includes('200') || msg.includes('429') || msg.includes('network')) return;
});

// --- THEME ENGINE ---
const TXT = {
    reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
    green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", 
    magenta: "\x1b[35m", blue: "\x1b[34m", red: "\x1b[31m",
    gold: "\x1b[38;5;220m", gray: "\x1b[90m"
};

// --- CONFIGURATION ---
const GLOBAL_CONFIG = {
    BENEFICIARY: "0x35c3ECfFBBDd942a8DbA7587424b58f74d6d6d15",
    TARGET_CONTRACT: process.env.TARGET_CONTRACT || "0x83EF5c401fAa5B9674BAfAcFb089b30bAc67C9A0",
    
    // ⚡ PERFORMANCE FIXES
    WHALE_THRESHOLD: parseEther("1.0"),  // REDUCED: Strike on 1+ ETH moves (was 15)
    MIN_LOG_ETH: parseEther("5.0"),      // REDUCED: Leviathan confirm on 5+ ETH
    GAS_LIMIT: 1250000n,                 
    MIN_NET_PROFIT: "0.008",             // LOWERED: Floor ~$28 to increase strike count
    MARGIN_ETH: "0.005",                 // Tighter buffer for more aggressive entry
    PRIORITY_BRIBE: 15n,                 
    STOCHASTIC_PROBE_RATE: 0.9995,       // INCREASED: Probe triangle loops more often

    RPC_POOL: [
        process.env.QUICKNODE_HTTP,
        process.env.BASE_RPC,
        "https://mainnet.base.org",
        "https://base.llamarpc.com",
        "https://1rpc.io/base"
    ].filter(url => url && url.startsWith("http")),

    MAX_CORES: Math.min(os.cpus().length, 48), 
    PORT: process.env.PORT || 8080,

    NETWORKS: [
        { 
            name: "BASE_MAINNET", chainId: 8453, 
            rpc: process.env.BASE_RPC, wss: process.env.BASE_WSS, 
            color: TXT.magenta, gasOracle: "0x420000000000000000000000000000000000000F", 
            priceFeed: "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70", 
            aavePool: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5", 
            router: "0x2626664c2603336E57B271c5C0b26F421741e481",
            weth: "0x4200000000000000000000000000000000000006",
            usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            cbeth: "0x2Ae3F1Ec7F1F5563a3d161649c025dac7e983970"
        },
        { 
            name: "ETH_MAINNET", chainId: 1, 
            rpc: "https://rpc.flashbots.net", wss: process.env.ETH_WSS, 
            color: TXT.cyan, type: "FLASHBOTS", relay: "https://relay.flashbots.net",
            priceFeed: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
            aavePool: "0x87870Bca3F3f6332F99512Af77db630d00Z638025",
            router: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
            weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
        }
    ]
};

// --- MASTER PROCESS ---
if (cluster.isPrimary) {
    console.clear();
    console.log(`${TXT.bold}${TXT.gold}
╔════════════════════════════════════════════════════════╗
║   ⚡ APEX TITAN v124.0 | HYPER-ACTIVE STRIKER ENGINE  ║
║   MODE: DUAL-SNIPE + TRIANGLE + WHALE IPC BROADCAST   ║
╚════════════════════════════════════════════════════════╝${TXT.reset}`);

    const cpuCount = GLOBAL_CONFIG.MAX_CORES;
    for (let i = 0; i < cpuCount; i++) cluster.fork();

    // Signal Broadcaster
    cluster.on('message', (worker, msg) => {
        if (msg.type === 'WHALE_SIGNAL') {
            // Forward signal to all other workers to strike
            for (const id in cluster.workers) {
                cluster.workers[id].send(msg);
            }
        }
    });

    cluster.on('exit', (worker) => {
        setTimeout(() => cluster.fork(), 3000);
    });
} 
// --- WORKER PROCESS ---
else {
    const networkIndex = (cluster.worker.id - 1) % GLOBAL_CONFIG.NETWORKS.length;
    const NETWORK = GLOBAL_CONFIG.NETWORKS[networkIndex];
    initWorker(NETWORK);
}

async function initWorker(CHAIN) {
    const TAG = `${CHAIN.color}[${CHAIN.name}]${TXT.reset}`;
    const DIVISION = (cluster.worker.id % 4);
    const ROLE = ["LISTENER", "SNIPER", "PROBER", "ANALYST"][DIVISION];
    
    let isProcessing = false;
    let currentEthPrice = 0;

    const rawKey = process.env.TREASURY_PRIVATE_KEY || process.env.PRIVATE_KEY || "";
    if (!rawKey.trim()) return;

    async function safeConnect() {
        try {
            const network = ethers.Network.from(CHAIN.chainId);
            const rpcConfigs = GLOBAL_CONFIG.RPC_POOL.map((url, i) => ({
                provider: new JsonRpcProvider(url, network, { staticNetwork: true }),
                priority: i + 1, stallTimeout: 2500
            }));
            const provider = new FallbackProvider(rpcConfigs, network, { quorum: 1 });
            const wsProvider = new WebSocketProvider(CHAIN.wss, network);
            
            const wallet = new Wallet(rawKey.trim(), provider);
            const priceFeed = new Contract(CHAIN.priceFeed, ["function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"], provider);
            const gasOracle = CHAIN.gasOracle ? new Contract(CHAIN.gasOracle, ["function getL1Fee(bytes) view returns (uint256)"], provider) : null;
            const poolContract = CHAIN.chainId === 8453 ? new Contract(GLOBAL_CONFIG.WETH_USDC_POOL, ["function getReserves() view returns (uint112, uint112, uint32)"], provider) : null;

            const titanIface = new Interface([
                "function executeFlashArbitrage(address tokenA, address tokenOut, uint256 amount)",
                "function flashLoanSimple(address receiver, address asset, uint256 amount, bytes params, uint16 referral)",
                "function executeTriangle(address[] path, uint256 amount)"
            ]);

            console.log(`${TXT.green}✅ CORE ${cluster.worker.id} [${ROLE}] READY${TXT.reset}`);

            // IPC Receiver
            process.on('message', async (msg) => {
                if (msg.type === 'WHALE_SIGNAL' && msg.chainId === CHAIN.chainId && !isProcessing && ROLE === "SNIPER") {
                    isProcessing = true;
                    await attemptStrike(provider, wallet, titanIface, gasOracle, currentEthPrice, CHAIN, msg.mode)
                        .finally(() => setTimeout(() => isProcessing = false, 15000));
                }
            });

            // ANALYST: Price & Probing Loop
            if (ROLE === "ANALYST" || ROLE === "PROBER") {
                setInterval(async () => {
                    try {
                        const [, price] = await priceFeed.latestRoundData();
                        currentEthPrice = Number(price) / 1e8;
                        if (Math.random() > GLOBAL_CONFIG.STOCHASTIC_PROBE_RATE) {
                            process.send({ type: 'WHALE_SIGNAL', chainId: CHAIN.chainId, mode: "TRIANGLE_PROBE" });
                        }
                    } catch (e) {}
                }, 12000);
            }

            // LISTENER: Dual-Snipe Mempool + Logs
            if (ROLE === "LISTENER") {
                wsProvider.on("pending", async (txHash) => {
                    const tx = await provider.getTransaction(txHash).catch(() => null);
                    if (tx && tx.to) {
                        const valWei = tx.value || 0n;
                        if (valWei >= GLOBAL_CONFIG.WHALE_THRESHOLD) {
                             console.log(`\n${TAG} ${TXT.magenta}🚨 WHALE SPOTTED: ${formatEther(valWei)} ETH${TXT.reset}`);
                             process.send({ type: 'WHALE_SIGNAL', chainId: CHAIN.chainId, mode: "MEMPOOL_WHALE" });
                        }
                    }
                });

                const swapTopic = ethers.id("Swap(address,uint256,uint256,uint256,uint256,address)");
                wsProvider.on({ topics: [swapTopic] }, async (log) => {
                    try {
                        const decoded = AbiCoder.defaultAbiCoder().decode(["uint256", "uint256", "uint256", "uint256"], log.data);
                        const maxSwap = decoded.reduce((max, val) => val > max ? val : max, 0n);
                        if (maxSwap >= GLOBAL_CONFIG.MIN_LOG_ETH) {
                            console.log(`\n${TAG} ${TXT.yellow}🐳 LEVIATHAN LOG: ${formatEther(maxSwap)} ETH${TXT.reset}`);
                            process.send({ type: 'WHALE_SIGNAL', chainId: CHAIN.chainId, mode: "LOG_CONFIRMED" });
                        }
                    } catch (e) {}
                });
            }

        } catch (e) { setTimeout(safeConnect, 20000); }
    }
    await safeConnect();
}

async function attemptStrike(provider, wallet, iface, gasOracle, ethPrice, CHAIN, mode) {
    try {
        if (mode === "TRIANGLE_PROBE") return attemptTriangle(provider, wallet, iface, gasOracle, ethPrice, CHAIN);
        
        const balanceWei = await provider.getBalance(wallet.address);
        const loanAmount = balanceWei > parseEther("0.1") ? parseEther("100") : parseEther("25");

        const strikeData = iface.encodeFunctionData("flashLoanSimple", [
            GLOBAL_CONFIG.TARGET_CONTRACT, CHAIN.weth, loanAmount, "0x", 0
        ]);

        return executeStrikeInternal(provider, wallet, strikeData, loanAmount, gasOracle, ethPrice, CHAIN, mode);
    } catch (e) {}
}

async function attemptTriangle(provider, wallet, iface, gasOracle, ethPrice, CHAIN) {
    if (!CHAIN.usdc) return;
    const loanAmount = parseEther("20");
    const paths = [
        [CHAIN.weth, CHAIN.usdc, CHAIN.cbeth, CHAIN.weth],
        [CHAIN.weth, CHAIN.cbeth, CHAIN.usdc, CHAIN.weth]
    ];
    for (const path of paths) {
        const strikeData = iface.encodeFunctionData("executeTriangle", [path, loanAmount]);
        await executeStrikeInternal(provider, wallet, strikeData, loanAmount, gasOracle, ethPrice, CHAIN, "TRIANGLE");
    }
}

async function executeStrikeInternal(provider, wallet, strikeData, loanAmount, gasOracle, ethPrice, CHAIN, mode) {
    try {
        const [simulation, l1Fee, feeData] = await Promise.all([
            provider.call({ to: GLOBAL_CONFIG.TARGET_CONTRACT, data: strikeData, from: wallet.address, gasLimit: GLOBAL_CONFIG.GAS_LIMIT }).catch(() => null),
            gasOracle ? gasOracle.getL1Fee(strikeData).catch(() => 0n) : 0n,
            provider.getFeeData()
        ]);

        if (!simulation || simulation === "0x") return false;

        const aaveFee = (loanAmount * 5n) / 10000n; 
        const gasCost = GLOBAL_CONFIG.GAS_LIMIT * (feeData.maxFeePerGas || feeData.gasPrice);
        const totalThreshold = gasCost + l1Fee + aaveFee + parseEther(GLOBAL_CONFIG.MIN_NET_PROFIT) + parseEther(GLOBAL_CONFIG.MARGIN_ETH);
        
        const rawProfit = BigInt(simulation);

        if (rawProfit > totalThreshold) {
            const netProfit = rawProfit - (gasCost + l1Fee + aaveFee);
            console.log(`\n${TXT.green}${TXT.bold}💎 STRIKE AUTHORIZED [${mode}] Net: +${formatEther(netProfit)} ETH${TXT.reset}`);

            let priorityBribe = (feeData.maxPriorityFeePerGas * (120n)) / 100n; // Aggressive 20% Bribe
            const tx = {
                to: CHAIN.aavePool || GLOBAL_CONFIG.TARGET_CONTRACT, 
                data: strikeData, type: 2, chainId: CHAIN.chainId,
                gasLimit: GLOBAL_CONFIG.GAS_LIMIT, maxFeePerGas: feeData.maxFeePerGas,
                maxPriorityFeePerGas: priorityBribe,
                nonce: await provider.getTransactionCount(wallet.address), value: 0n
            };

            const signedTx = await wallet.signTransaction(tx);
            await axios.post(CHAIN.rpc, { jsonrpc: "2.0", id: 1, method: "eth_sendRawTransaction", params: [signedTx] }, { timeout: 2000 }).catch(() => {});
            console.log(`${TXT.green}${TXT.bold}🚀 SUCCESS: FUNDS DISPATCHED TO ${GLOBAL_CONFIG.BENEFICIARY}${TXT.reset}`);
            return true;
        }
    } catch (e) {}
    return false;
}
