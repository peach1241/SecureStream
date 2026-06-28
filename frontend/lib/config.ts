/**
 * lib/config.ts
 *
 * Single source of truth for network + contract addresses. Values come from
 * NEXT_PUBLIC_* env vars when present, otherwise fall back to the live
 * SecureStream testnet deployment so the static build works with no env config
 * (e.g. on Cloudflare Pages/Workers where env vars may not be set at build time).
 * All values are public.
 */
export const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015'; // Networks.TESTNET

export const SOROBAN_RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
export const HORIZON_URL =
  process.env.NEXT_PUBLIC_HORIZON_URL || 'https://horizon-testnet.stellar.org';

export const POOL_CONTRACT =
  process.env.NEXT_PUBLIC_POOL_CONTRACT_ADDRESS ||
  'CAWL62KWM4PYN25BMG7UGZTNGZUO4J7Z4H27DJICRR56CEJEVG5FY2CG';
export const TOKEN_CONTRACT =
  process.env.NEXT_PUBLIC_TOKEN_CONTRACT_ADDRESS ||
  'CCELLZIVJGLIGBPSPW225663T5FPMMZOMYQV62M5XC6R7PAMQF2NP2T2';
export const XLM_CONTRACT =
  process.env.NEXT_PUBLIC_XLM_CONTRACT_ADDRESS ||
  'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
export const SST_ISSUER =
  process.env.NEXT_PUBLIC_SST_ISSUER ||
  'GAEWKVJAQ4IJHS3D3QJZZFJ2EUB6PWLIX4PZRPKHERJJ5KGQU3R7LZCB';
