'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';

export function AuthInitializer() {
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    console.log('DEBUG - AuthInitializer useEffect running');
    initialize();
  }, [initialize]);

  return null; // This component doesn't render anything
}
