const cluster = require('cluster');
const { ethers } = require('ethers');
const axios = require('axios');
require('dotenv').config();

// --- THEME ENGINE ---
const TXT = {
    reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
    green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", 
    magenta: "\x1b[35m", blue: "\x1b[34m", red: "\x1b[31m",
    gold: "\x1b[38;5;220m", silver: "\x1b[38;5;250m"
};

// --- CONFIGURATION ---
const CONFIG = {
    // 🔒 RECIPIENT ADDRESS (LOCKED)
    TARGET_ADDRESS: "0x4B8251e7c80F910305bb81547e301DcB8A596918",

    // ⚙️ NETWORK & EXECUTION
    CHAIN_ID: 8453, // Base Network
    AMOUNT_TO_SEND: "0.01", // <--- CHANGE THIS AMOUNT
    GAS_LIMIT: 21000, 
    PRIORITY_FEE: 2n, // Priority tip for faster processing
};

// MULTI-RPC FAILOVER POOL
const RPC_POOL = [
    process.env.QUICKNODE_HTTP,
    "https://mainnet.base.org",
    "https://base.llamarpc.com",
    "https://1rpc.io/base"
].filter(url => url);

// --- MASTER THREAD ---
if (cluster.isPrimary) {
    console.clear();
    console.log(`${TXT.bold}${TXT.gold}╔═══════════════════════════════════════════════╗${TXT.reset}`);
    console.log(`${TXT.bold}${TXT.gold}║    🔱 APEX v38.17.1 | SECURE TRANSFER NODE    ║${TXT.reset}`);
    console.log(`${TXT.bold}${TXT.gold}╚═══════════════════════════════════════════════╝${TXT.reset}\n`);
    
    const worker = cluster.fork();
    worker.on('exit', (code) => {
        if (code !== 0) {
            console.log(`${TXT.red}⚠️ Worker died. Respawning...${TXT.reset}`);
            cluster.fork();
        } else {
            console.log(`${TXT.green}✅ Process Complete. Shutting down.${TXT.reset}`);
            process.exit(0);
        }
    });
} else {
    runWorker();
}

// --- WORKER THREAD ---
async function runWorker() {
    try {
        // 1. SETUP FAILOVER PROVIDER
        // Checks both TREASURY_PRIVATE_KEY (from your snippet) and PRIVATE_KEY (standard)
        const rawKey = process.env.TREASURY_PRIVATE_KEY || process.env.PRIVATE_KEY;
        if (!rawKey) { 
            console.error(`${TXT.red}❌ ERROR: Key Missing in .env (TREASURY_PRIVATE_KEY or PRIVATE_KEY)${TXT.reset}`); 
            process.exit(1); 
        }
        
        const network = ethers.Network.from(CONFIG.CHAIN_ID);
        const configs = RPC_POOL.map((url, i) => ({
            provider: new ethers.JsonRpcProvider(url, network, { staticNetwork: true }),
            priority: i + 1,
            stallTimeout: 2000
        }));

        const provider = new ethers.FallbackProvider(configs, network, { quorum: 1 });
        const wallet = new ethers.Wallet(rawKey.trim(), provider);
        
        // State
        let nextNonce = await provider.getTransactionCount(wallet.address);
        const amountWei = ethers.parseEther(CONFIG.AMOUNT_TO_SEND);

        process.stdout.write(`${TXT.cyan}[INIT] Nonce: ${nextNonce} | RPCs: ${RPC_POOL.length} | Wallet: ${wallet.address}${TXT.reset}\n`);

        // 2. BALANCE CHECK
        const balance = await provider.getBalance(wallet.address);
        if (balance < amountWei) {
            console.error(`\n${TXT.red}❌ INSUFFICIENT FUNDS${TXT.reset}`);
            console.error(`${TXT.silver}Required: ${CONFIG.AMOUNT_TO_SEND} ETH | Available: ${ethers.formatEther(balance)} ETH${TXT.reset}`);
            process.exit(1);
        }

        console.log(`\n${TXT.magenta}🎯 TARGET LOCKED: ${CONFIG.TARGET_ADDRESS}${TXT.reset}`);
        console.log(`${TXT.gold}💰 SENDING AMOUNT: ${CONFIG.AMOUNT_TO_SEND} ETH${TXT.reset}`);

        // 3. EXECUTION
        const feeData = await provider.getFeeData();
        
        // Construct Transaction
        const tx = {
            to: CONFIG.TARGET_ADDRESS,
            value: amountWei,
            gasLimit: CONFIG.GAS_LIMIT,
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas + ethers.parseUnits(CONFIG.PRIORITY_FEE.toString(), 'gwei'),
            maxFeePerGas: feeData.maxFeePerGas,
            nonce: nextNonce,
            type: 2,
            chainId: CONFIG.CHAIN_ID
        };

        console.log(`${TXT.yellow}⚡ BROADCASTING TRANSACTION...${TXT.reset}`);

        const sentTx = await wallet.sendTransaction(tx);
        
        console.log(`${TXT.green}🚀 TRANSACTION SENT: ${sentTx.hash}${TXT.reset}`);
        console.log(`${TXT.dim}🔗 Explorer: https://basescan.org/tx/${sentTx.hash}${TXT.reset}`);
        
        console.log(`\n${TXT.yellow}⏳ Waiting for confirmation...${TXT.reset}`);
        await sentTx.wait();
        
        console.log(`${TXT.bold}${TXT.green}🎉 CONFIRMED. FUNDS SECURED.${TXT.reset}`);
        process.exit(0);

    } catch (e) {
        console.error(`${TXT.red}❌ FATAL ERROR: ${e.message}${TXT.reset}`);
        process.exit(1);
    }
}
