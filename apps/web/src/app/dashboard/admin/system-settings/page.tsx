'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { Shield, Settings, AlertCircle, CheckCircle } from 'lucide-react';

interface SystemSetting {
  id?: string;
  settingKey: string;
  settingValue: string;
  description?: string;
}

export default function SystemSettingsPage() {
  const { user, token } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // System settings state
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  useEffect(() => {
    if (user?.systemRole !== 'ADMIN' && user?.systemRole !== 'SUPER_ADMIN') {
      setMessage({ type: 'error', text: 'Access denied. Admin privileges required.' });
      return;
    }
    loadSettings();
  }, [user]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      // Load system settings
      const systemResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/v1/system-settings`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (systemResponse.ok) {
        const systemSettings = await systemResponse.json();
        const regSetting = systemSettings.find((s: SystemSetting) => s.settingKey === 'registration_enabled');
        const maintenanceSetting = systemSettings.find((s: SystemSetting) => s.settingKey === 'maintenance_mode');
        
        setRegistrationEnabled(regSetting?.settingValue === 'true');
        setMaintenanceMode(maintenanceSetting?.settingValue === 'true');
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      setMessage({ type: 'error', text: 'Failed to load settings' });
    } finally {
      setLoading(false);
    }
  };

  const updateSystemSetting = async (key: string, value: string) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/v1/system-settings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ settingKey: key, settingValue: value }),
      });

      if (!response.ok) {
        throw new Error('Failed to update setting');
      }

      setMessage({ type: 'success', text: 'Setting updated successfully' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error updating setting:', error);
      setMessage({ type: 'error', text: 'Failed to update setting' });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  if (user?.systemRole !== 'ADMIN' && user?.systemRole !== 'SUPER_ADMIN') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-600">You need admin privileges to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <div className="flex items-center space-x-3">
            <Shield className="h-8 w-8 text-red-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">System Settings</h1>
              <p className="text-sm text-gray-600">Manage global system configuration and settings</p>
            </div>
          </div>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`p-4 rounded-md ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          <div className="flex items-center space-x-2">
            {message.type === 'success' ? (
              <CheckCircle className="h-5 w-5" />
            ) : (
              <AlertCircle className="h-5 w-5" />
            )}
            <span>{message.text}</span>
          </div>
        </div>
      )}

      {/* System Configuration */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <div className="flex items-center space-x-3 mb-6">
            <Settings className="h-6 w-6 text-gray-600" />
            <h2 className="text-lg font-medium text-gray-900">System Configuration</h2>
          </div>
          
          <div className="space-y-6">
            {/* Registration Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-900">User Registration</h3>
                <p className="text-sm text-gray-500">Allow new users to register accounts</p>
              </div>
              <button
                onClick={() => {
                  const newValue = !registrationEnabled;
                  setRegistrationEnabled(newValue);
                  updateSystemSetting('registration_enabled', newValue.toString());
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  registrationEnabled ? 'bg-blue-600' : 'bg-gray-200'
                }`}
                title={`${registrationEnabled ? 'Disable' : 'Enable'} user registration`}
                aria-label={`${registrationEnabled ? 'Disable' : 'Enable'} user registration`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    registrationEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Maintenance Mode Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-900">Maintenance Mode</h3>
                <p className="text-sm text-gray-500">Temporarily disable access for maintenance</p>
              </div>
              <button
                onClick={() => {
                  const newValue = !maintenanceMode;
                  setMaintenanceMode(newValue);
                  updateSystemSetting('maintenance_mode', newValue.toString());
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  maintenanceMode ? 'bg-red-600' : 'bg-gray-200'
                }`}
                title={`${maintenanceMode ? 'Disable' : 'Enable'} maintenance mode`}
                aria-label={`${maintenanceMode ? 'Disable' : 'Enable'} maintenance mode`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    maintenanceMode ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Additional System Settings */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">System Information</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-900">Application Status</h3>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm text-gray-600">System Online</span>
              </div>
            </div>
            
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-900">Registration Status</h3>
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${registrationEnabled ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-sm text-gray-600">
                  {registrationEnabled ? 'Open' : 'Closed'}
                </span>
              </div>
            </div>
            
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-900">Maintenance Status</h3>
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${maintenanceMode ? 'bg-yellow-500' : 'bg-green-500'}`}></div>
                <span className="text-sm text-gray-600">
                  {maintenanceMode ? 'Under Maintenance' : 'Normal Operation'}
                </span>
              </div>
            </div>
            
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-900">Admin Access</h3>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span className="text-sm text-gray-600">Active</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
