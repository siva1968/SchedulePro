import { Metadata } from 'next';
import { AuthInitializer } from '@/components/AuthInitializer';
import DashboardLayout from '@/components/DashboardLayout';

export const metadata: Metadata = {
  title: 'Dashboard | SchedulePro',
  description: 'Manage your appointments, calendar, and scheduling settings',
};

export default function DashboardRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AuthInitializer />
      <DashboardLayout>
        {children}
      </DashboardLayout>
    </>
  );
}
