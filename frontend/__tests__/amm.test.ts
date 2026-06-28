import { describe, it, expect } from 'vitest';
import { swapOutputStroops, displayQuote } from '../lib/amm';

describe('swapOutputStroops (constant-product, matches contract)', () => {
  it('matches the contract test_swap_output case (1000/1000, in=100 -> 91)', () => {
    expect(swapOutputStroops(1000n, 1000n, 100n)).toBe(91n);
  });

  it('yields a positive output strictly below the output reserve', () => {
    const rIn = 1000n;
    const rOut = 1000n;
    const amtIn = 100n;
    const out = swapOutputStroops(rIn, rOut, amtIn);
    expect(out).toBeGreaterThan(0n);
    expect(out).toBeLessThan(rOut);
  });

  // NOTE: the pool charges NO swap fee and rounds the quotient down, so the
  // constant-product invariant k is NOT guaranteed to grow on a swap (here it
  // goes 1_000_000 -> 999_900). The 1% fee lives in token.transfer, not the
  // pool math. This test documents the real behavior rather than asserting a
  // protection the contract does not implement.
  it('does not grow k on a feeless swap (documents missing pool fee)', () => {
    const rIn = 1000n;
    const rOut = 1000n;
    const amtIn = 100n;
    const out = swapOutputStroops(rIn, rOut, amtIn);
    const kAfter = (rIn + amtIn) * (rOut - out);
    expect(kAfter).toBeLessThanOrEqual(rIn * rOut);
  });

  it('returns 0 for non-positive inputs', () => {
    expect(swapOutputStroops(0n, 1000n, 100n)).toBe(0n);
    expect(swapOutputStroops(1000n, 1000n, 0n)).toBe(0n);
    expect(swapOutputStroops(1000n, 0n, 100n)).toBe(0n);
  });
});

describe('displayQuote', () => {
  it('multiplies by price for SST -> XLM', () => {
    expect(displayQuote(0.05, '100', 'SST_TO_XLM')).toBe('5.000000');
  });

  it('divides by price for XLM -> SST', () => {
    expect(displayQuote(0.05, '5', 'XLM_TO_SST')).toBe('100.000000');
  });

  it('returns empty string for invalid / empty / zero input', () => {
    expect(displayQuote(0.05, '', 'SST_TO_XLM')).toBe('');
    expect(displayQuote(0.05, '0', 'SST_TO_XLM')).toBe('');
    expect(displayQuote(0, '100', 'SST_TO_XLM')).toBe('');
  });
});
