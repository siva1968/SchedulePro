'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface DashboardPageContainerProps {
  children: ReactNode;
  className?: string;
}

export default function DashboardPageContainer({
  children,
  className,
}: DashboardPageContainerProps) {
  return (
    <div className={cn('flex-1 overflow-y-auto', className)}>
      <div className="px-6 py-6 lg:px-8">
        {children}
      </div>
    </div>
  );
}
