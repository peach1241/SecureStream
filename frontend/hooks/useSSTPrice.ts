'use client';
import useSWR from 'swr';
import { fetchPrice } from '@/lib/stellarReads';

export const useSSTPrice = () => {
  const { data, isLoading } = useSWR('sst-price', fetchPrice, { refreshInterval: 5000 });

  return {
    price: data?.price || '0.00',
    change24h: data?.change24h || '0.00',
    isLoading,
  };
};
