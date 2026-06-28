/**
 * scripts/deploy.js
 *
 * Full SecureStream deployment script.
 * Covers: fund → deploy → initialize → mint → add_liquidity → save record.
 *
 * Usage:
 *   STELLAR_ISSUER_SECRET=S... STELLAR_DISTRIBUTOR_SECRET=S... node scripts/deploy.js
 */

'use strict';

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const https = require('https');
const { Keypair, StellarTomlResolver } = require('@stellar/stellar-sdk');

// ─── ENV ──────────────────────────────────────────────────────────────────────
const ISSUER_SECRET      = process.env.STELLAR_ISSUER_SECRET;
const DISTRIBUTOR_SECRET = process.env.STELLAR_DISTRIBUTOR_SECRET;
const RPC_URL   = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
const HORIZON   = process.env.HORIZON_URL     || 'https://horizon-testnet.stellar.org';
const NETWORK   = 'testnet';
const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';

if (!ISSUER_SECRET || !DISTRIBUTOR_SECRET) {
  console.error('\n[ERROR] Set STELLAR_ISSUER_SECRET and STELLAR_DISTRIBUTOR_SECRET\n');
  process.exit(1);
}

const issuerKp      = Keypair.fromSecret(ISSUER_SECRET);
const distributorKp = Keypair.fromSecret(DISTRIBUTOR_SECRET);
const ISSUER_PUB      = issuerKp.publicKey();
const DISTRIBUTOR_PUB = distributorKp.publicKey();

const WASM_DIR    = path.join(__dirname, '..', 'contracts', 'target', 'wasm32-unknown-unknown', 'release');
const DEPLOY_DIR  = path.join(__dirname, '..', 'deployments');
const DEPLOY_FILE = path.join(DEPLOY_DIR, 'testnet.json');

if (!fs.existsSync(DEPLOY_DIR)) fs.mkdirSync(DEPLOY_DIR, { recursive: true });

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const log  = (msg) => console.log(`\n  ${msg}`);
const ok   = (msg) => console.log(`  ✓  ${msg}`);
const fail = (msg) => { console.error(`  ✗  ${msg}`); process.exit(1); };

/** Run a shell command and return trimmed stdout. */
function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts }).trim();
  } catch (e) {
    throw new Error(e.stderr || e.message);
  }
}

/** HTTP GET → parsed JSON. */
function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { resolve(body); }
      });
    }).on('error', reject);
  });
}

/** Get XLM balance for a public key via Horizon. */
async function getXlmBalance(pubKey) {
  try {
    const acc = await httpGet(`${HORIZON}/accounts/${pubKey}`);
    const native = (acc.balances || []).find((b) => b.asset_type === 'native');
    return parseFloat(native?.balance || '0');
  } catch {
    return 0;
  }
}

/** Stellar CLI shorthand. */
function soroban(subCmd) {
  const cmd = `./bin/stellar ${subCmd}`;
  return run(cmd, {
    env: {
      ...process.env,
      STELLAR_NETWORK: NETWORK,
      STELLAR_RPC_URL: RPC_URL,
      STELLAR_NETWORK_PASSPHRASE: NETWORK_PASSPHRASE,
    }
  });
}

/** Deploy a WASM file and return contract ID. */
function deployWasm(wasmPath, sourceSecret) {
  return soroban(
    `contract deploy --wasm ${wasmPath} --source ${sourceSecret} --fee 10000`
  );
}

/** Invoke a contract function and return stdout (tx hash or result). */
function invoke(contractId, sourceSecret, fn, args = '') {
  return soroban(
    `contract invoke --id ${contractId} --source ${sourceSecret} --fee 10000 -- ${fn} ${args}`
  );
}

// ─── STEP 1 — Fund accounts via Friendbot ────────────────────────────────────
async function step1_fund() {
  console.log('\n═══ STEP 1 — Fund accounts via Friendbot ═══');

  for (const [label, pubKey] of [['Issuer', ISSUER_PUB], ['Distributor', DISTRIBUTOR_PUB]]) {
    const bal = await getXlmBalance(pubKey);
    if (bal >= 10) {
      ok(`${label} (${pubKey.slice(0,6)}…) already has ${bal.toFixed(2)} XLM — skipping`);
      continue;
    }
    log(`Funding ${label} via Friendbot…`);
    try {
      const res = await httpGet(`https://friendbot.stellar.org?addr=${pubKey}`);
      if (res.hash) {
        ok(`${label} funded — tx: ${res.hash}`);
      } else {
        ok(`${label} funded`);
      }
    } catch (e) {
      fail(`Friendbot failed for ${label}: ${e.message}`);
    }
    // Wait for ledger
    await new Promise((r) => setTimeout(r, 2000));
  }
}

// ─── STEP 2 — Mint Classic SST via Trustline Script ────────────────────────
async function step2_mint_classic() {
  console.log('\n═══ STEP 2 — Mint Classic SST ═══');
  log('Running setup-trustlines.js to mint classic SST to Distributor…');
  try {
    // Just run the external script which does changeTrust + Payment
    const output = run('node scripts/setup-trustlines.js');
    console.log(output);
    ok('Classic SST Minted successfully.');
  } catch (e) {
    fail(`Classic mint failed: ${e.message}`);
  }
}

// ─── STEP 3 — Deploy contracts ────────────────────────────────────────────────
function step3_deploy() {
  console.log('\n═══ STEP 3 — Deploy Soroban contracts ═══');

  // Deploy SAC for SST
  log(`Deploying SAC Wrapper for SST:${ISSUER_PUB}…`);
  let sstId;
  try {
    sstId = soroban(`contract asset deploy --asset SST:${ISSUER_PUB} --source-account ${ISSUER_SECRET}`);
    ok(`SST SAC deployed → ${sstId}`);
  } catch (e) {
    if (e.message.includes('ExistingValue')) {
      sstId = soroban(`contract id asset --asset SST:${ISSUER_PUB}`).trim();
      ok(`SST SAC already exists → ${sstId}`);
    } else {
      fail(`SAC deploy failed: ${e.message}`);
    }
  }

  const contracts = [
    { name: 'Liquidity Pool', wasm: path.join(WASM_DIR, 'secure_stream_pool.optimized.wasm') },
    { name: 'Bridge',         wasm: path.join(WASM_DIR, 'secure_stream_bridge.optimized.wasm') },
  ];

  const ids = { 'SST Token': sstId };
  for (const { name, wasm } of contracts) {
    if (!fs.existsSync(wasm)) {
      fail(`WASM not found: ${wasm}\nRun: make build-contracts`);
    }
    log(`Deploying ${name} from ${path.basename(wasm)}…`);
    try {
      const contractId = deployWasm(wasm, ISSUER_SECRET);
      ok(`${name} → ${contractId}`);
      ids[name] = contractId;
    } catch (e) {
      fail(`Deploy failed for ${name}: ${e.message}`);
    }
  }

  return {
    sstId:    ids['SST Token'],
    poolId:   ids['Liquidity Pool'],
    bridgeId: ids['Bridge'],
  };
}

// ─── STEP 4 — Initialize contracts ───────────────────────────────────────────
function step4_initialize(sstId, poolId, bridgeId) {
  console.log('\n═══ STEP 4 — Initialize contracts ═══');
  const hashes = {};

  // SST Token (SAC Wrapper) doesn't need initialization!
  hashes.sstInit = 'SAC wrappers do not require initialization';
  ok('SST SAC ready.');

  // Liquidity Pool
  log('Initializing Liquidity Pool…');
  try {
    const XLM_CONTRACT_ID = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'; // native testnet XLM
    hashes.poolInit = invoke(poolId, ISSUER_SECRET, 'initialize',
      `--token_contract ${sstId} --xlm_contract ${XLM_CONTRACT_ID} --admin ${ISSUER_PUB}`
    );
    ok(`Pool initialized — ${hashes.poolInit}`);
  } catch (e) {
    fail(`Pool init failed: ${e.message}`);
  }

  // Bridge
  log('Initializing Bridge…');
  try {
    hashes.bridgeInit = invoke(bridgeId, ISSUER_SECRET, 'initialize',
      `--token_contract ${sstId} --pool_contract ${poolId} --admin ${ISSUER_PUB}`
    );
    ok(`Bridge initialized — ${hashes.bridgeInit}`);
  } catch (e) {
    fail(`Bridge init failed: ${e.message}`);
  }

  return hashes;
}

// ─── STEP 5 — Add initial liquidity ──────────────────────────────────────────
function step5_liquidity(poolId) {
  console.log('\n═══ STEP 5 — Add initial liquidity ═══');
  // 100,000 SST (×10^7) and 4,000 XLM (×10^7)
  const TOKEN_AMT = '1000000000000';  // 100,000 SST
  const XLM_AMT   = '40000000000';    // 4,000 XLM

  log(`Adding liquidity: ${TOKEN_AMT} SST stroops + ${XLM_AMT} XLM stroops…`);
  try {
    const txHash = invoke(poolId, DISTRIBUTOR_SECRET, 'add_liquidity',
      `--provider ${DISTRIBUTOR_PUB} --token_amount ${TOKEN_AMT} --xlm_amount ${XLM_AMT}`
    );
    ok(`Liquidity added — ${txHash}`);
    return txHash;
  } catch (e) {
    fail(`Add liquidity failed: ${e.message}`);
  }
}

// ─── STEP 6 — Save deployment record ─────────────────────────────────────────
function step6_save(data) {
  console.log('\n═══ STEP 6 — Save deployment record ═══');

  const record = {
    network: 'testnet',
    deployedAt: new Date().toISOString(),
    issuerPublicKey: ISSUER_PUB,
    distributorPublicKey: DISTRIBUTOR_PUB,
    sstAsset: `SST:${ISSUER_PUB}`,
    SSTToken: {
      contractId: data.sstId,
      wasmHash: data.sstWasmHash || '',
      initTxHash: data.sstInit || '',
    },
    LiquidityPool: {
      contractId: data.poolId,
      wasmHash: data.poolWasmHash || '',
      initTxHash: data.poolInit || '',
    },
    Bridge: {
      contractId: data.bridgeId,
      wasmHash: data.bridgeWasmHash || '',
      initTxHash: data.bridgeInit || '',
    },
    trustline: {
      asset: 'SST',
      issuer: ISSUER_PUB,
      limit: '1000000',
      setupTxHash: data.trustlineSetupTxHash || '',
    },
  };

  fs.writeFileSync(DEPLOY_FILE, JSON.stringify(record, null, 2));
  ok(`Record saved → ${DEPLOY_FILE}`);
  return record;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║   SecureStream — Full Deploy               ║');
  console.log('╚════════════════════════════════════════════╝');
  console.log(`\n  Issuer:      ${ISSUER_PUB}`);
  console.log(`  Distributor: ${DISTRIBUTOR_PUB}`);
  console.log(`  Network:     ${NETWORK} (${RPC_URL})`);

  await step1_fund();
  await step2_mint_classic();

  const { sstId, poolId, bridgeId } = step3_deploy();
  const { sstInit, poolInit, bridgeInit } = step4_initialize(sstId, poolId, bridgeId);
  const lpTxHash    = step5_liquidity(poolId);

  const record = step6_save({
    sstId, poolId, bridgeId,
    sstInit, poolInit, bridgeInit,
    mintTxHash: 'Minted via setup-trustlines.js',
    lpTxHash,
  });

  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║   Deployment complete! 🚀                  ║');
  console.log('╠════════════════════════════════════════════╣');
  console.log(`║  SST Token:  ${record.SSTToken.contractId.padEnd(30)} ║`);
  console.log(`║  Pool:       ${record.LiquidityPool.contractId.padEnd(30)} ║`);
  console.log(`║  Bridge:     ${record.Bridge.contractId.padEnd(30)} ║`);
  console.log('╚════════════════════════════════════════════╝');
  console.log('\n  Next steps:');
  console.log('  1. Copy contract IDs into frontend/.env.local');
  console.log('  2. Run: node scripts/setup-trustlines.js');
  console.log('  3. Run: cd frontend && npm run dev\n');
}

main().catch((err) => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
