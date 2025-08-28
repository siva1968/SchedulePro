'use client';

import { ReactNode } from 'react';
import DashboardSidebar from './DashboardSidebar';
import { cn } from '@/lib/utils';

interface DashboardLayoutProps {
  children: ReactNode;
  className?: string;
}

export default function DashboardLayout({ children, className }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardSidebar />
      
      {/* Main content */}
      <div className="lg:ml-64 pt-16 lg:pt-0">
        <main className={cn('min-h-screen', className)}>
          {children}
        </main>
      </div>
    </div>
  );
}
