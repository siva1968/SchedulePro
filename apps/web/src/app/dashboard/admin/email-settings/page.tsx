'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { Mail, Send, AlertCircle, CheckCircle, Save, TestTube } from 'lucide-react';

interface EmailSetting {
  id?: string;
  provider: 'SENDGRID' | 'NODEMAILER';
  config: Record<string, any>;
  isActive: boolean;
}

export default function EmailSettingsPage() {
  const { user, token } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Email settings state
  const [emailSettings, setEmailSettings] = useState<EmailSetting | null>(null);
  const [emailProvider, setEmailProvider] = useState<'SENDGRID' | 'NODEMAILER'>('SENDGRID');
  const [sendGridApiKey, setSendGridApiKey] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('');
  const [testEmail, setTestEmail] = useState('');

  // NODEMAILER specific settings
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUsername, setSmtpUsername] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpSecure, setSmtpSecure] = useState(false);

  useEffect(() => {
    if (user?.systemRole !== 'ADMIN' && user?.systemRole !== 'SUPER_ADMIN') {
      setMessage({ type: 'error', text: 'Access denied. Admin privileges required.' });
      return;
    }
    loadEmailSettings();
  }, [user]);

  const loadEmailSettings = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/v1/email/settings`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const emailData = await response.json();
        setEmailSettings(emailData);
        if (emailData) {
          setEmailProvider(emailData.provider);
          if (emailData.config.apiKey) setSendGridApiKey(emailData.config.apiKey);
          if (emailData.config.fromEmail) setFromEmail(emailData.config.fromEmail);
          if (emailData.config.fromName) setFromName(emailData.config.fromName);
          
          // NODEMAILER settings
          if (emailData.config.host) setSmtpHost(emailData.config.host);
          if (emailData.config.port) setSmtpPort(emailData.config.port.toString());
          if (emailData.config.username) setSmtpUsername(emailData.config.username);
          if (emailData.config.password) setSmtpPassword(emailData.config.password);
          if (emailData.config.secure !== undefined) setSmtpSecure(emailData.config.secure);
        }
      }
    } catch (error) {
      console.error('Error loading email settings:', error);
      setMessage({ type: 'error', text: 'Failed to load email settings' });
    } finally {
      setLoading(false);
    }
  };

  const saveEmailSettings = async () => {
    setLoading(true);
    try {
      let config: Record<string, any>;
      
      if (emailProvider === 'SENDGRID') {
        config = {
          apiKey: sendGridApiKey,
          fromEmail: fromEmail,
          fromName: fromName,
        };
      } else {
        config = {
          host: smtpHost,
          port: parseInt(smtpPort),
          username: smtpUsername,
          password: smtpPassword,
          secure: smtpSecure,
          fromEmail: fromEmail,
          fromName: fromName,
        };
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/v1/email/settings`, {
        method: emailSettings ? 'PUT' : 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: emailProvider,
          config: config,
          isActive: true,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save email settings');
      }

      setMessage({ type: 'success', text: 'Email settings saved successfully' });
      setTimeout(() => setMessage(null), 3000);
      loadEmailSettings(); // Reload settings
    } catch (error) {
      console.error('Error saving email settings:', error);
      setMessage({ type: 'error', text: 'Failed to save email settings' });
      setTimeout(() => setMessage(null), 3000);
    } finally {
      setLoading(false);
    }
  };

  const testEmailSettings = async () => {
    if (!testEmail) {
      setMessage({ type: 'error', text: 'Please enter a test email address' });
      return;
    }

    setTestLoading(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/v1/email/test`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: testEmail,
          subject: 'SchedulePro Email Test',
          text: 'This is a test email from SchedulePro admin panel.',
        }),
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Test email sent successfully!' });
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to send test email');
      }
    } catch (error) {
      console.error('Error sending test email:', error);
      setMessage({ type: 'error', text: `Failed to send test email: ${error instanceof Error ? error.message : 'Unknown error'}` });
    } finally {
      setTestLoading(false);
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
            <Mail className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Email Settings</h1>
              <p className="text-sm text-gray-600">Configure email provider and sending settings</p>
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

      {/* Email Provider Configuration */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-6">Email Provider Configuration</h2>
          
          <div className="space-y-6">
            {/* Email Provider Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email Provider</label>
              <select
                value={emailProvider}
                onChange={(e) => setEmailProvider(e.target.value as 'SENDGRID' | 'NODEMAILER')}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                title="Select email provider"
                aria-label="Select email provider"
              >
                <option value="SENDGRID">SendGrid</option>
                <option value="NODEMAILER">SMTP (Nodemailer)</option>
              </select>
            </div>

            {/* SendGrid Configuration */}
            {emailProvider === 'SENDGRID' && (
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-blue-900 mb-4">SendGrid Configuration</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">SendGrid API Key</label>
                    <input
                      type="password"
                      value={sendGridApiKey}
                      onChange={(e) => setSendGridApiKey(e.target.value)}
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="SG.xxxxxxxxxxxxxxxxxxxxx"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Get your API key from SendGrid dashboard
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* SMTP Configuration */}
            {emailProvider === 'NODEMAILER' && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-gray-900 mb-4">SMTP Configuration</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">SMTP Host</label>
                    <input
                      type="text"
                      value={smtpHost}
                      onChange={(e) => setSmtpHost(e.target.value)}
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="smtp.gmail.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">SMTP Port</label>
                    <input
                      type="number"
                      value={smtpPort}
                      onChange={(e) => setSmtpPort(e.target.value)}
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="587"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Username</label>
                    <input
                      type="text"
                      value={smtpUsername}
                      onChange={(e) => setSmtpUsername(e.target.value)}
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="your-email@gmail.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                    <input
                      type="password"
                      value={smtpPassword}
                      onChange={(e) => setSmtpPassword(e.target.value)}
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="your-app-password"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="smtpSecure"
                        checked={smtpSecure}
                        onChange={(e) => setSmtpSecure(e.target.checked)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <label htmlFor="smtpSecure" className="ml-2 block text-sm text-gray-900">
                        Use secure connection (SSL/TLS)
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Common Email Settings */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">From Email Address</label>
                <input
                  type="email"
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="noreply@example.com"
                />
                <p className="mt-1 text-xs text-gray-500">
                  This email address will be used as the sender for all outgoing emails
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">From Name</label>
                <input
                  type="text"
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="SchedulePro"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Display name for outgoing emails
                </p>
              </div>
            </div>

            {/* Save Button */}
            <div className="pt-4">
              <button
                onClick={saveEmailSettings}
                disabled={loading}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <Save className="h-4 w-4 mr-2" />
                {loading ? 'Saving...' : 'Save Email Settings'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Test Email */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-6">Test Email Configuration</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Test Email Address</label>
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="test@example.com"
              />
              <p className="mt-1 text-xs text-gray-500">
                Send a test email to verify your email configuration is working
              </p>
            </div>

            <div>
              <button
                onClick={testEmailSettings}
                disabled={testLoading || !testEmail}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
              >
                <TestTube className="h-4 w-4 mr-2" />
                {testLoading ? 'Sending...' : 'Send Test Email'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
