'use client';
import useSWR from 'swr';
import { useState } from 'react';
import { signTransaction } from '@stellar/freighter-api';
import { fetchBalances } from '@/lib/stellarReads';

const HORIZON_URL = process.env.NEXT_PUBLIC_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015'; // Networks.TESTNET
const SST_ISSUER = process.env.NEXT_PUBLIC_SST_ISSUER || '';

export const useTrustline = (publicKey: string) => {
  const { data, mutate, isLoading } = useSWR(
    publicKey ? ['balances', publicKey] : null,
    ([, pk]: [string, string]) => fetchBalances(pk),
    { refreshInterval: 5000 }
  );

  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const addTrustline = async () => {
    if (!publicKey) return;
    setIsAdding(true);
    setAddError(null);

    try {
      // 1. Dynamic import of Stellar SDK
      const { Horizon, TransactionBuilder, Operation, Asset, BASE_FEE } = await import('@stellar/stellar-sdk');

      // 2. Load account from Horizon
      const server = new Horizon.Server(HORIZON_URL);
      const account = await server.loadAccount(publicKey);

      // 3. Build a changeTrust transaction
      const sstAsset = new Asset('SST', SST_ISSUER || account.account_id);
      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(
          Operation.changeTrust({
            asset: sstAsset,
            limit: '1000000', // 1M SST limit
          })
        )
        .setTimeout(180)
        .build();

      // 4. Sign with Freighter
      const signedResult = await signTransaction(tx.toXDR(), {
        networkPassphrase: NETWORK_PASSPHRASE,
      });

      // Handle both v1 (string) and v2 ({ signedTxXdr }) return shapes
      const signedXDR: string =
        typeof signedResult === 'string'
          ? signedResult
          : (signedResult as { signedTxXdr?: string })?.signedTxXdr ?? '';

      if (!signedXDR) throw new Error('Freighter did not return a signed transaction');

      // 5. Submit to Horizon
      const signedTx = TransactionBuilder.fromXDR(signedXDR, NETWORK_PASSPHRASE);
      const response = await server.submitTransaction(signedTx);

      // 6. Refresh balance/trustline data
      await mutate();
      return (response as unknown as { hash: string }).hash;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAddError(msg);
      console.error('[useTrustline] addTrustline failed:', msg);
      throw err;
    } finally {
      setIsAdding(false);
    }
  };

  return {
    hasTrustline: data?.hasTrustline || false,
    sstBalance: data?.sstBalance || '0',
    sstLimit: data?.sstLimit || '0',
    isLoading,
    isAdding,
    addError,
    addTrustline,
  };
};
