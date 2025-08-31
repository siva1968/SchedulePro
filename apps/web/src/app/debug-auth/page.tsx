'use client';

import { useAuthStore } from '@/stores/auth-store';

export default function DebugAuthPage() {
  const { user, token, isAuthenticated } = useAuthStore();

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Auth Debug Page</h1>
      
      <div className="space-y-4">
        <div>
          <h2 className="font-semibold">Authentication Status:</h2>
          <p>Authenticated: {isAuthenticated ? 'Yes' : 'No'}</p>
          <p>Token exists: {token ? 'Yes' : 'No'}</p>
        </div>
        
        <div>
          <h2 className="font-semibold">User Data:</h2>
          <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
            {JSON.stringify(user, null, 2)}
          </pre>
        </div>
        
        <div>
          <h2 className="font-semibold">System Role Check:</h2>
          <p>user?.systemRole: {user?.systemRole || 'undefined'}</p>
          <p>Is Admin: {(user?.systemRole === 'ADMIN' || user?.systemRole === 'SUPER_ADMIN') ? 'Yes' : 'No'}</p>
        </div>
      </div>
    </div>
  );
}
