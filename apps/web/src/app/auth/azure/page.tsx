'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function AzureAuthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Handle OAuth callback
    const accessToken = searchParams.get('access_token');
    const refreshToken = searchParams.get('refresh_token');
    const errorMessage = searchParams.get('message');

    if (errorMessage) {
      setError(decodeURIComponent(errorMessage));
    } else if (accessToken && refreshToken) {
      // Store tokens and redirect to dashboard
      localStorage.setItem('access_token', accessToken);
      localStorage.setItem('refresh_token', refreshToken);
      router.push('/dashboard');
    }
  }, [searchParams, router]);

  const handleAzureSignIn = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Redirect to Azure AD auth endpoint
      window.location.href = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/v1/auth/azure`;
    } catch (err) {
      setError('Failed to initiate Azure authentication');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in with Azure AD
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Use your Microsoft Azure Active Directory account to access SchedulePro
          </p>
        </div>
        
        <div className="mt-8 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">
                    Authentication Error
                  </h3>
                  <div className="mt-2 text-sm text-red-700">
                    <p>{error}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div>
            <button
              onClick={handleAzureSignIn}
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg className="w-5 h-5 mr-2" viewBox="0 0 21 21" fill="currentColor">
                  <path d="M11.344 5.71c0-.73.074-1.43.19-2.09.114-.66.282-1.267.53-1.82.248-.553.576-1.04.99-1.46.413-.42.954-.63 1.62-.63.667 0 1.207.21 1.62.63.414.42.742.907.99 1.46.248.553.416 1.16.53 1.82.116.66.19 1.36.19 2.09 0 .73-.074 1.43-.19 2.09-.114.66-.282 1.267-.53 1.82-.248.553-.576 1.04-.99 1.46-.413.42-.953.63-1.62.63-.666 0-1.207-.21-1.62-.63-.414-.42-.742-.907-.99-1.46-.248-.553-.416-1.16-.53-1.82-.116-.66-.19-1.36-.19-2.09zm-5.014 0c0-.73.074-1.43.19-2.09.114-.66.282-1.267.53-1.82.248-.553.576-1.04.99-1.46.413-.42.954-.63 1.62-.63.667 0 1.207.21 1.62.63.414.42.742.907.99 1.46.248.553.416 1.16.53 1.82.116.66.19 1.36.19 2.09 0 .73-.074 1.43-.19 2.09-.114.66-.282 1.267-.53 1.82-.248.553-.576 1.04-.99 1.46-.413.42-.953.63-1.62.63-.666 0-1.207-.21-1.62-.63-.414-.42-.742-.907-.99-1.46-.248-.553-.416-1.16-.53-1.82-.116-.66-.19-1.36-.19-2.09z"/>
                </svg>
              )}
              {loading ? 'Redirecting to Azure...' : 'Sign in with Microsoft Azure'}
            </button>
          </div>

          <div className="text-center">
            <p className="text-sm text-gray-600">
              By signing in, you agree to our{' '}
              <a href="#" className="font-medium text-blue-600 hover:text-blue-500">
                Terms of Service
              </a>{' '}
              and{' '}
              <a href="#" className="font-medium text-blue-600 hover:text-blue-500">
                Privacy Policy
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AzureAuthPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    }>
      <AzureAuthContent />
    </Suspense>
  );
}
