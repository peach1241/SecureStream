'use client';
import useSWR from 'swr';
import { fetchBalances } from '@/lib/stellarReads';

export const useSSTBalance = (publicKey: string) => {
  const { data, isLoading, mutate } = useSWR(
    publicKey ? ['balances', publicKey] : null,
    ([, pk]: [string, string]) => fetchBalances(pk),
    { refreshInterval: 8000 }
  );

  return {
    sstBalance: data?.sstBalance || '0',
    xlmBalance: data?.xlmBalance || '0',
    hasTrustline: data?.hasTrustline || false,
    isLoading,
    mutate,
  };
};
