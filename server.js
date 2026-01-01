/**
 * ===============================================================================
 * APEX ULTIMATE MASTER v53.3 (QUANTUM TITAN FINALITY) - RPC RESILIENCE BUILD
 * ===============================================================================
 * FIX: AUTOMATIC SKIP OF EXHAUSTED (429) RPCs | MASTER BOOTSTRAP RECOVERY
 * DNA: 32-CORE STAGGERED CLUSTER | L1-GAS AWARE | MULTI-RPC FALLBACK
 * ===============================================================================
 */
const cluster = require('cluster');
const os = require('os');
const { 
    ethers, JsonRpcProvider, Wallet, Contract, FallbackProvider, 
    WebSocketProvider, parseEther, formatEther 
} = require('ethers');
require('dotenv').config();

// --- THEME ENGINE ---
const TXT = {
    reset: "\x1b[0m", bold: "\x1b[1m", green: "\x1b[32m", 
    cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m", gold: "\x1b[38;5;220m"
};

// --- GLOBAL CONFIGURATION ---
const GLOBAL_CONFIG = {
    CHAIN_ID: 8453,
    TARGET_CONTRACT: "0x83EF5c401fAa5B9674BAfAcFb089b30bAc67C9A0",
    BENEFICIARY: "0x35c3ECfFBBDd942a8DbA7587424b58f74d6d6d15",
    STRIKE_DATA: "0x535a720a00000000000000000000000042000000000000000000000000000000000000060000000000000000000000004edbc9ba171790664872997239bc7a3f3a6331900000000000000000000000000000000000000000000000015af1d78b58c40000",
    GAS_LIMIT: 1250000n,
    GAS_PRIORITY_FEE: 1000n, 
    MIN_NET_PROFIT: parseEther("0.0005"),
    RPC_POOL: [
        "https://base.merkle.io", // Aggressive Private RPC
        "https://1rpc.io/base",   // High-capacity 1RPC
        "https://mainnet.base.org",
        "https://base.llamarpc.com"
    ]
};

// --- MASTER PROCESS ---
if (cluster.isPrimary) {
    console.clear();
    console.log(`${TXT.gold}╔════════════════════════════════════════════════════════╗`);
    console.log(`║   ⚡ APEX TITAN v53.3 | RPC-ROTATION RECOVERY ACTIVE ║`);
    console.log(`║   DNA: BYPASSING EXHAUSTED KEYS | AUTO-SYNC ENABLED  ║`);
    console.log(`╚════════════════════════════════════════════════════════╝${TXT.reset}\n`);

    let masterNonce = -1;
    const network = ethers.Network.from(GLOBAL_CONFIG.CHAIN_ID);

    async function initMaster() {
        // Try every RPC in the pool until one works (Bypasses Alchemy 429)
        for (const url of GLOBAL_CONFIG.RPC_POOL) {
            try {
                const provider = new JsonRpcProvider(url, network, { staticNetwork: true });
                const wallet = new Wallet(process.env.TREASURY_PRIVATE_KEY.trim(), provider);
                masterNonce = await provider.getTransactionCount(wallet.address, 'latest');
                
                console.log(`${TXT.green}✅ MASTER BOOTSTRAP SUCCESS VIA: ${new URL(url).hostname}${TXT.reset}`);
                console.log(`${TXT.green}✅ MASTER NONCE SYNCED: ${masterNonce}${TXT.reset}`);
                
                // Launch Workers only after nonce is synced
                for (let i = 0; i < Math.min(os.cpus().length, 32); i++) {
                    setTimeout(() => cluster.fork(), i * 1200);
                }
                return; // Initialization complete
            } catch (e) {
                console.log(`${TXT.yellow}⚠️  RPC ${new URL(url).hostname} Exhausted (429/Limit). Rotating...${TXT.reset}`);
            }
        }
        console.error(`${TXT.red}❌ CRITICAL: ALL RPC NODES EXHAUSTED. REBOOTING IN 60s...${TXT.reset}`);
        setTimeout(initMaster, 60000);
    }

    cluster.on('message', (worker, msg) => {
        if (msg.type === 'NONCE_REQ') {
            worker.send({ type: 'NONCE_RES', nonce: masterNonce, id: msg.id });
            masterNonce++;
        }
        if (msg.type === 'SIGNAL') {
            Object.values(cluster.workers).forEach(w => {
                if (w && w.isConnected()) w.send({ type: 'STRIKE_CMD' });
            });
        }
    });

    initMaster();
} 

// --- WORKER PROCESS ---
else {
    runWorkerCore();
}

async function runWorkerCore() {
    const network = ethers.Network.from(GLOBAL_CONFIG.CHAIN_ID);
    
    // Create a Fallback Provider that automatically rotates around dead Alchemy keys
    const provider = new FallbackProvider(GLOBAL_CONFIG.RPC_POOL.map((url, i) => ({
        provider: new JsonRpcProvider(url, network, { staticNetwork: true }),
        priority: i + 1,
        stallTimeout: 1000
    })), network, { quorum: 1 });

    const wallet = new Wallet(process.env.TREASURY_PRIVATE_KEY.trim(), provider);
    const l1Oracle = new Contract("0x420000000000000000000000000000000000000F", ["function getL1Fee(bytes) view returns (uint256)"], provider);
    const priceFeed = new Contract("0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70", ["function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"], provider);
    
    const ROLE = (cluster.worker.id % 4 === 0) ? "LISTENER" : "STRIKER";
    const TAG = `${TXT.cyan}[CORE ${cluster.worker.id}] [${ROLE}]${TXT.reset}`;

    if (ROLE === "LISTENER") {
        // Listening via Fallback (not just Alchemy)
        provider.on('block', () => process.send({ type: 'SIGNAL' }));
        console.log(`${TAG} Zero-Throttle Peering Active.`);
    } else {
        process.on('message', async (msg) => {
            if (msg.type === 'STRIKE_CMD') await executeQuantumStrike(provider, wallet, l1Oracle, priceFeed, TAG);
        });
        console.log(`${TAG} Striker Standby.`);
    }
}

async function executeQuantumStrike(provider, wallet, l1Oracle, priceFeed, TAG) {
    try {
        const reqId = Math.random();
        const nonce = await new Promise((res, rej) => {
            const timeout = setTimeout(() => rej("Nonce Timeout"), 2000);
            const h = m => { if(m.id === reqId) { clearTimeout(timeout); process.removeListener('message', h); res(m.nonce); }};
            process.on('message', h);
            process.send({ type: 'NONCE_REQ', id: reqId });
        });

        const [sim, l1Fee, feeData, priceData] = await Promise.all([
            provider.call({ to: GLOBAL_CONFIG.TARGET_CONTRACT, data: GLOBAL_CONFIG.STRIKE_DATA, from: wallet.address, gasLimit: GLOBAL_CONFIG.GAS_LIMIT }).catch(() => "0x"),
            l1Oracle.getL1Fee(GLOBAL_CONFIG.STRIKE_DATA).catch(() => 0n),
            provider.getFeeData(),
            priceFeed.latestRoundData().catch(() => [0, 0n])
        ]);

        if (sim === "0x" || BigInt(sim) === 0n) return;

        const priorityFee = parseEther("1000", "gwei");
        const baseFee = feeData.gasPrice || parseEther("0.1", "gwei");
        const totalCost = (GLOBAL_CONFIG.GAS_LIMIT * (baseFee + priorityFee)) + l1Fee;
        const netProfit = BigInt(sim) - totalCost;

        if (netProfit > GLOBAL_CONFIG.MIN_NET_PROFIT) {
            const ethPrice = Number(priceData[1]) / 1e8;
            console.log(`\n${TXT.green}${TXT.bold}⚡ TITAN STRIKE: +${formatEther(netProfit)} ETH (~$${(parseFloat(formatEther(netProfit)) * ethPrice).toFixed(2)})${TXT.reset}`);

            const tx = {
                to: GLOBAL_CONFIG.TARGET_CONTRACT, data: GLOBAL_CONFIG.STRIKE_DATA, nonce,
                gasLimit: GLOBAL_CONFIG.GAS_LIMIT, maxFeePerGas: baseFee + priorityFee,
                maxPriorityFeePerGas: priorityFee, type: 2, chainId: 8453
            };

            const response = await wallet.sendTransaction(tx);
            console.log(`${TAG} 🚀 MINED: ${response.hash.substring(0, 20)}...`);
        }
    } catch (e) { }
}
