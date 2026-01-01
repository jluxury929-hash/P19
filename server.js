/**
 * ===============================================================================
 * APEX ULTIMATE MASTER v53.2 (QUANTUM TITAN FINALITY) - FINAL REPAIR BUILD
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
    GAS_PRIORITY_FEE: 1000n, // Gwei nuclear tip
    MIN_NET_PROFIT: parseEther("0.0005"),
    GAS_ORACLE: "0x420000000000000000000000000000000000000F",
    CHAINLINK_FEED: "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70",
    RPC_POOL: [
        process.env.WSS_URL ? process.env.WSS_URL.replace("wss://", "https://") : null,
        "https://mainnet.base.org",
        "https://base.llamarpc.com",
        "https://1rpc.io/base"
    ].filter(url => url !== null)
};

// --- MASTER PROCESS ---
if (cluster.isPrimary) {
    console.clear();
    console.log(`${TXT.gold}╔════════════════════════════════════════════════════════╗`);
    console.log(`║   ⚡ APEX TITAN v53.2 | ABSOLUTE FINALITY ENGAGED    ║`);
    console.log(`║   RESILIENCE: 32-CORE | L1-AWARE | MULTI-RPC SYNC   ║`);
    console.log(`╚════════════════════════════════════════════════════════╝${TXT.reset}\n`);

    let masterNonce = -1;
    const network = ethers.Network.from(GLOBAL_CONFIG.CHAIN_ID);

    async function initMaster() {
        try {
            const provider = new JsonRpcProvider(GLOBAL_CONFIG.RPC_POOL[0], network, { staticNetwork: true });
            const wallet = new Wallet(process.env.TREASURY_PRIVATE_KEY.trim(), provider);
            masterNonce = await provider.getTransactionCount(wallet.address, 'latest');
            console.log(`${TXT.green}✅ MASTER NONCE SYNCED: ${masterNonce}${TXT.reset}`);
            
            // Staggered launch to prevent RPC handshake saturation
            for (let i = 0; i < Math.min(os.cpus().length, 32); i++) {
                setTimeout(() => cluster.fork(), i * 1500);
            }
        } catch (e) {
            console.error(`${TXT.red}MASTER INIT ERROR: ${e.message}${TXT.reset}`);
            setTimeout(initMaster, 10000);
        }
    }

    cluster.on('message', (worker, msg) => {
        if (msg.type === 'NONCE_REQ') {
            worker.send({ type: 'NONCE_RES', nonce: masterNonce, id: msg.id });
            masterNonce++;
        }
        if (msg.type === 'SIGNAL') {
            Object.values(cluster.workers).forEach(w => w.send({ type: 'STRIKE_CMD' }));
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
    const provider = new FallbackProvider(GLOBAL_CONFIG.RPC_POOL.map((url, i) => ({
        provider: new JsonRpcProvider(url, network, { staticNetwork: true }),
        priority: i + 1,
        stallTimeout: 1500
    })));

    const wallet = new Wallet(process.env.TREASURY_PRIVATE_KEY.trim(), provider);
    const l1Oracle = new Contract(GLOBAL_CONFIG.GAS_ORACLE, ["function getL1Fee(bytes) view returns (uint256)"], provider);
    const priceFeed = new Contract(GLOBAL_CONFIG.CHAINLINK_FEED, ["function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"], provider);
    
    const ROLE = (cluster.worker.id % 4 === 0) ? "LISTENER" : "STRIKER";
    const TAG = `${TXT.cyan}[CORE ${cluster.worker.id}] [${ROLE}]${TXT.reset}`;

    if (ROLE === "LISTENER") {
        const ws = new WebSocketProvider(process.env.WSS_URL, network);
        ws.on('block', () => process.send({ type: 'SIGNAL' }));
        console.log(`${TAG} Scanning Mempool...`);
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
        const nonce = await new Promise(res => {
            const h = m => { if(m.id === reqId) { process.removeListener('message', h); res(m.nonce); }};
            process.on('message', h);
            process.send({ type: 'NONCE_REQ', id: reqId });
        });

        const [sim, l1Fee, feeData, priceData] = await Promise.all([
            provider.call({ 
                to: GLOBAL_CONFIG.TARGET_CONTRACT, 
                data: GLOBAL_CONFIG.STRIKE_DATA, 
                from: wallet.address,
                gasLimit: GLOBAL_CONFIG.GAS_LIMIT
            }).catch(() => "0x"),
            l1Oracle.getL1Fee(GLOBAL_CONFIG.STRIKE_DATA).catch(() => 0n),
            provider.getFeeData(),
            priceFeed.latestRoundData().catch(() => [0, 0n])
        ]);

        if (sim === "0x" || BigInt(sim) === 0n) return;

        const priorityFee = parseEther(GLOBAL_CONFIG.GAS_PRIORITY_FEE.toString(), "gwei");
        const baseFee = feeData.gasPrice || parseEther("0.1", "gwei");
        const totalCost = (GLOBAL_CONFIG.GAS_LIMIT * (baseFee + priorityFee)) + l1Fee;
        const netProfit = BigInt(sim) - totalCost;

        if (netProfit > GLOBAL_CONFIG.MIN_NET_PROFIT) {
            const ethPrice = Number(priceData[1]) / 1e8;
            console.log(`\n${TXT.green}${TXT.bold}⚡ TITAN STRIKE: +${formatEther(netProfit)} ETH (~$${(parseFloat(formatEther(netProfit)) * ethPrice).toFixed(2)})${TXT.reset}`);

            const tx = {
                to: GLOBAL_CONFIG.TARGET_CONTRACT,
                data: GLOBAL_CONFIG.STRIKE_DATA,
                nonce: nonce,
                gasLimit: GLOBAL_CONFIG.GAS_LIMIT,
                maxFeePerGas: baseFee + priorityFee,
                maxPriorityFeePerGas: priorityFee,
                type: 2,
                chainId: 8453
            };

            const response = await wallet.sendTransaction(tx);
            console.log(`${TAG} 🚀 MINED: ${response.hash.substring(0, 20)}...`);
        }
    } catch (e) { /* Nonce drift/Simulation failure handled silently */ }
}
