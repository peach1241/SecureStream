'use client';
import useSWR from 'swr';

export const useSSTBalance = (publicKey: string) => {
  const { data, isLoading, mutate } = useSWR(
    publicKey ? `/api/balance/${publicKey}` : null,
    (url) => fetch(url).then((res) => res.json()),
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
