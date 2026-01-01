// ===============================================================================
// APEX ULTIMATE OMNISCIENT SNIPER v26.5 (ULTIMATE MERGE) - SELF-HEALING AI
// ===============================================================================
// INTEGRATED: GEMINI 2.5 FLASH AUTO-OPTIMIZER + DYNAMIC RECOVERY DNA
// STRATEGY: OMNISCIENT SNIPE + TRIANGLE + POOL-DEPTH SCALING (10% RULE)
// TARGET BENEFICIARY: 0x4B8251e7c80F910305bb81547e301DcB8A596918
// ===============================================================================

const cluster = require('cluster');
const os = require('os');
const http = require('http');
const axios = require('axios');
const { ethers, WebSocketProvider, JsonRpcProvider, Wallet, Interface, parseEther, formatEther, Contract, FallbackProvider, AbiCoder } = require('ethers');
require('dotenv').config();

// --- AI CONFIGURATION ---
const apiKey = ""; // Environment provided
const GEMINI_MODEL = "gemini-2.5-flash-preview-09-2025";
let lastAiCorrection = Date.now();

// --- SAFETY: GLOBAL ERROR HANDLERS ---
process.on('uncaughtException', (err) => {
    const msg = err.message || "";
    if (msg.includes('200') || msg.includes('429') || msg.includes('network') || msg.includes('insufficient funds')) return;
    console.error("\n\x1b[31m[CRITICAL ERROR]\x1b[0m", msg);
});

// --- THEME ENGINE ---
const TXT = {
    reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
    green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", 
    magenta: "\x1b[35m", blue: "\x1b[34m", red: "\x1b[31m",
    gold: "\x1b[38;5;220m", gray: "\x1b[90m"
};

const GLOBAL_CONFIG = {
    TARGET_CONTRACT: process.env.TARGET_CONTRACT || "0x83EF5c401fAa5B9674BAfAcFb089b30bAc67C9A0", 
    BENEFICIARY: process.env.BENEFICIARY || "0x4B8251e7c80F910305bb81547e301DcB8A596918",
    
    // ASSETS
    WETH: "0x4200000000000000000000000000000000000006",
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    WETH_USDC_POOL: "0x88A43bb75941904d47401946215162a26bc773dc",

    // AI TUNABLE PARAMETERS (Gemini will adjust these)
    TUNABLES: {
        WHALE_THRESHOLD: 1.0, 
        MARGIN_ETH: 0.008,
        PRIORITY_BRIBE: 25,
        GAS_SAFETY_MULT: 1.2
    },

    RPC_POOL: [
        "https://eth.llamarpc.com",
        "https://1rpc.io/eth",
        "https://rpc.flashbots.net",
        "https://base.llamarpc.com",
        "https://mainnet.base.org"
    ]
};

// --- AI SELF-HEALING ENGINE ---
async function askAiForOptimization(errorContext) {
    if (Date.now() - lastAiCorrection < 60000) return; // Limit AI calls to 1/min
    
    const prompt = `You are a high-frequency trading bot optimizer. 
    Current tunables: ${JSON.stringify(GLOBAL_CONFIG.TUNABLES)}.
    Recent Error: ${errorContext}.
    Provide a JSON object with updated values for WHALE_THRESHOLD, MARGIN_ETH, PRIORITY_BRIBE, and GAS_SAFETY_MULT to ensure transactions land successfully. 
    Be aggressive but protect capital.`;

    try {
        const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        });
        const suggestion = JSON.parse(res.data.candidates[0].content.parts[0].text);
        Object.assign(GLOBAL_CONFIG.TUNABLES, suggestion);
        console.log(`${TXT.gold}[AI OPTIMIZER] Internal parameters recalibrated by Gemini.${TXT.reset}`);
        lastAiCorrection = Date.now();
    } catch (e) { /* Silent fail for AI */ }
}

// --- MASTER PROCESS ---
if (cluster.isPrimary) {
    console.clear();
    console.log(`${TXT.bold}${TXT.gold}╔════════════════════════════════════════════════════════╗${TXT.reset}`);
    console.log(`${TXT.bold}${TXT.gold}║   ⚡ APEX MASTER v26.5 | AI SELF-HEALING CLUSTER     ║${TXT.reset}`);
    console.log(`${TXT.bold}${TXT.gold}║   DNA: GEMINI 2.5 FLASH LIVE AUTO-OPTIMIZATION       ║${TXT.reset}`);
    console.log(`${TXT.bold}${TXT.gold}╚════════════════════════════════════════════════════════╝${TXT.reset}\n`);

    for (let i = 0; i < Math.min(os.cpus().length, 32); i++) cluster.fork();

    cluster.on('exit', () => setTimeout(() => cluster.fork(), 2000));
} 
// --- WORKER PROCESS ---
else {
    const networkIndex = (cluster.worker.id - 1) % 3;
    const NETWORKS = [
        { name: "ETH_MAINNET", chainId: 1, rpc: process.env.ETH_RPC || "https://eth.llamarpc.com", wss: process.env.ETH_WSS || "wss://ethereum-rpc.publicnode.com", type: "FLASHBOTS", relay: "https://relay.flashbots.net", router: "0xE592427A0AEce92De3Edee1F18E0157C05861564", color: TXT.cyan },
        { name: "ARBITRUM", chainId: 42161, rpc: process.env.ARB_RPC || "https://arb1.arbitrum.io/rpc", wss: process.env.ARB_WSS || "wss://arb1.arbitrum.io/feed", router: "0xE592427A0AEce92De3Edee1F18E0157C05861564", color: TXT.blue },
        { name: "BASE_MAINNET", chainId: 8453, rpc: process.env.BASE_RPC || "https://mainnet.base.org", wss: process.env.BASE_WSS || "wss://base-rpc.publicnode.com", privateRpc: "https://base.merkle.io", router: "0x2626664c2603336E57B271c5C0b26F421741e481", color: TXT.magenta, gasOracle: "0x420000000000000000000000000000000000000F" }
    ];
    initWorker(NETWORKS[networkIndex]);
}

async function initWorker(CHAIN) {
    const TAG = `${CHAIN.color}[${CHAIN.name}]${TXT.reset}`;
    let currentEthPrice = 0;

    const rawKey = process.env.TREASURY_PRIVATE_KEY || process.env.PRIVATE_KEY || "";
    if (!rawKey) return;
    const walletKey = rawKey.trim();

    async function connect() {
        try {
            const network = ethers.Network.from(CHAIN.chainId);
            const rpcConfigs = [CHAIN.rpc, ...GLOBAL_CONFIG.RPC_POOL].map((url, i) => ({
                provider: new JsonRpcProvider(url, network, { staticNetwork: true }),
                priority: i + 1, stallTimeout: 1500
            }));
            const provider = new FallbackProvider(rpcConfigs, network, { quorum: 1 });
            const wsProvider = new WebSocketProvider(CHAIN.wss, network);
            const wallet = new Wallet(walletKey, provider);

            const priceFeed = CHAIN.chainId === 1 ? new Contract("0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", ["function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"], provider) : null;
            const gasOracle = CHAIN.gasOracle ? new Contract(CHAIN.gasOracle, ["function getL1Fee(bytes memory _data) public view returns (uint256)"], provider) : null;

            if (priceFeed) {
                const update = async () => { try { const [, p] = await priceFeed.latestRoundData(); currentEthPrice = Number(p) / 1e8; } catch(e){} };
                await update(); setInterval(update, 20000);
            }

            console.log(`${TXT.green}✅ CORE ACTIVE on ${TAG}${TXT.reset}`);

            const titanIface = new Interface([
                "function requestTitanLoan(address _token, uint256 _amount, address[] calldata _path)",
                "function executeTriangle(address[] path, uint256 amount)"
            ]);

            wsProvider.on("pending", async (txHash) => {
                try {
                    const tx = await provider.getTransaction(txHash).catch(() => null);
                    if (!tx || !tx.to) return;
                    const val = tx.value || 0n;
                    if (val >= parseEther(GLOBAL_CONFIG.TUNABLES.WHALE_THRESHOLD.toString()) && tx.to.toLowerCase() === CHAIN.router.toLowerCase()) {
                        await attemptStrike(provider, wallet, titanIface, gasOracle, CHAIN, "WHALE");
                    }
                } catch (err) {}
            });

            setInterval(async () => {
                try { await wsProvider.getBlockNumber(); } catch (e) { process.exit(1); }
            }, 12000);

        } catch (e) { setTimeout(connect, 5000); }
    }
    connect();
}

async function attemptStrike(provider, wallet, iface, oracle, CHAIN, mode) {
    try {
        const bal = await provider.getBalance(wallet.address);
        const loanAmount = bal > parseEther("0.1") ? parseEther("100") : parseEther("25");
        const data = iface.encodeFunctionData("requestTitanLoan", [GLOBAL_CONFIG.WETH, loanAmount, [GLOBAL_CONFIG.WETH, GLOBAL_CONFIG.USDC]]);
        
        await executeAIOptimizedStrike(provider, wallet, data, loanAmount, oracle, CHAIN, mode);
    } catch (e) {}
}

async function executeAIOptimizedStrike(provider, wallet, data, loanAmount, oracle, CHAIN, mode) {
    const TAG = `${CHAIN.color}[${CHAIN.name}]${TXT.reset}`;
    try {
        const [simulation, l1Fee, feeData, nonce, balance] = await Promise.all([
            provider.call({ to: GLOBAL_CONFIG.TARGET_CONTRACT, data: data, from: wallet.address, gasLimit: 1300000n }).catch((e) => {
                askAiForOptimization(`Simulation Reverted: ${e.message}`);
                return null;
            }),
            oracle ? oracle.getL1Fee(data).catch(() => 0n) : 0n,
            provider.getFeeData(),
            provider.getTransactionCount(wallet.address, 'latest'),
            provider.getBalance(wallet.address)
        ]);

        if (!simulation || simulation === "0x") return;

        const baseGas = feeData.maxFeePerGas || feeData.gasPrice || parseEther("0.1", "gwei");
        const priority = (feeData.maxPriorityFeePerGas || 0n) * (100n + BigInt(GLOBAL_CONFIG.TUNABLES.PRIORITY_BRIBE)) / 100n;
        const maxFee = baseGas + priority;
        const gasRequirement = 1200000n * maxFee + l1Fee;

        if (balance < gasRequirement) {
            console.log(`${TAG} ${TXT.red}⚠️ GAS LOCK: Have ${formatEther(balance)} Need ${formatEther(gasRequirement)}${TXT.reset}`);
            return;
        }

        const rawProfit = BigInt(simulation);
        const threshold = gasRequirement + parseEther(GLOBAL_CONFIG.TUNABLES.MARGIN_ETH.toString());

        if (rawProfit > threshold) {
            console.log(`${TXT.green}${TXT.bold}💎 STRIKE [${mode}] Profit: ${formatEther(rawProfit - threshold)} ETH${TXT.reset}`);

            const tx = {
                to: GLOBAL_CONFIG.TARGET_CONTRACT, data, type: 2, chainId: CHAIN.chainId,
                maxFeePerGas: maxFee, maxPriorityFeePerGas: priority, gasLimit: 1200000n,
                nonce, value: 0n
            };

            const signed = await wallet.signTransaction(tx);
            // Nuclear Broadcast
            wallet.sendTransaction(tx).catch(e => askAiForOptimization(e.message));
            axios.post(CHAIN.rpc, { jsonrpc: "2.0", id: 1, method: "eth_sendRawTransaction", params: [signed] }, { timeout: 3000 }).catch(() => {});
        }
    } catch (e) {
        askAiForOptimization(e.message);
    }
}
