/**
 * lib/amm.ts
 *
 * Pure, framework-free AMM helpers. These mirror the on-chain
 * constant-product math in contracts/secure-stream-pool so the UI quote
 * and the contract agree. Kept side-effect free so they're unit-testable.
 */

/**
 * Constant-product swap output, in integer stroops, matching the contract:
 *   k = reserveIn * reserveOut
 *   amountOut = reserveOut - k / (reserveIn + amountIn)   (integer division)
 *
 * Returns 0 for any non-positive input.
 */
export function swapOutputStroops(
  reserveIn: bigint,
  reserveOut: bigint,
  amountIn: bigint
): bigint {
  if (reserveIn <= 0n || reserveOut <= 0n || amountIn <= 0n) return 0n;
  const k = reserveIn * reserveOut;
  const newReserveIn = reserveIn + amountIn;
  const newReserveOut = k / newReserveIn;
  return reserveOut - newReserveOut;
}

/**
 * Display-side estimated output using the current spot price (XLM per SST).
 * `dir` 'SST_TO_XLM' multiplies by price; 'XLM_TO_SST' divides.
 * Returns '' for empty/invalid input so the UI can show a placeholder.
 */
export function displayQuote(
  price: number,
  amountIn: string,
  dir: 'SST_TO_XLM' | 'XLM_TO_SST'
): string {
  const n = parseFloat(amountIn);
  if (!amountIn || isNaN(n) || n <= 0 || price <= 0) return '';
  const out = dir === 'SST_TO_XLM' ? n * price : n / price;
  return out.toFixed(6);
}
