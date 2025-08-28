'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/stores/auth-store';
import TimezoneSelect from '@/components/TimezoneSelect';
import { User, Clock, Globe, Settings as SettingsIcon } from 'lucide-react';

const MEETING_PROVIDERS = [
  {
    id: 'GOOGLE_MEET',
    name: 'Google Meet',
    description: 'Google Meet video conferencing',
    icon: '📹',
  },
  {
    id: 'MICROSOFT_TEAMS',
    name: 'Microsoft Teams',
    description: 'Microsoft Teams video conferencing',
    icon: '👥',
  },
  {
    id: 'ZOOM',
    name: 'Zoom',
    description: 'Zoom video conferencing',
    icon: '🎥',
  },
  {
    id: 'WEBEX',
    name: 'Webex',
    description: 'Cisco Webex video conferencing',
    icon: '💼',
  },
  {
    id: 'GOTOMEETING',
    name: 'GoToMeeting',
    description: 'GoToMeeting video conferencing',
    icon: '🚀',
  },
  {
    id: 'CUSTOM',
    name: 'Custom',
    description: 'Custom meeting link or location',
    icon: '⚙️',
  },
];

interface MeetingProviderConfig {
  supportedMeetingProviders: string[];
  defaultMeetingProvider: string;
  meetingProviderConfigs: Record<string, any>;
}

interface UserProfileData {
  firstName: string;
  lastName: string;
  timezone: string;
  phoneNumber: string;
}

export default function SettingsPage() {
  const [config, setConfig] = useState<MeetingProviderConfig | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfileData>({
    firstName: '',
    lastName: '',
    timezone: '',
    phoneNumber: ''
  });
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const { user, token, setUser } = useAuthStore();

  useEffect(() => {
    fetchMeetingProviderConfig();
    fetchUserProfile();
  }, []);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const fetchUserProfile = async () => {
    try {
      setProfileLoading(true);
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/v1/auth/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user profile');
      }

      const data = await response.json();
      setUserProfile({
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        timezone: data.timezone || 'UTC',
        phoneNumber: data.phoneNumber || ''
      });
    } catch (error) {
      console.error('Error fetching user profile:', error);
      showMessage('error', 'Failed to load user profile');
    } finally {
      setProfileLoading(false);
    }
  };

  const updateUserProfile = async () => {
    try {
      setProfileSaving(true);
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/v1/auth/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(userProfile),
      });

      if (!response.ok) {
        throw new Error('Failed to update user profile');
      }

      const updatedUser = await response.json();
      
      // Update the user in the auth store with the new data
      setUser(updatedUser);
      
      showMessage('success', 'Profile updated successfully');
    } catch (error) {
      console.error('Error updating user profile:', error);
      showMessage('error', 'Failed to update profile');
    } finally {
      setProfileSaving(false);
    }
  };

  const fetchMeetingProviderConfig = async () => {
    try {
      // For now, use the first organization
      const orgId = user?.organizations?.[0]?.id;
      console.log('DEBUG - Settings: user:', user);
      console.log('DEBUG - Settings: orgId:', orgId);
      if (!orgId) {
        throw new Error('No organization found');
      }

      const apiUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/v1/organizations/${orgId}/meeting-providers`;
      console.log('DEBUG - Settings: API URL:', apiUrl);
      console.log('DEBUG - Settings: token:', token ? 'exists' : 'missing');

      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      console.log('DEBUG - Settings: response status:', response.status);
      if (!response.ok) {
        const errorText = await response.text();
        console.log('DEBUG - Settings: error response:', errorText);
        throw new Error('Failed to fetch meeting provider configuration');
      }

      const data = await response.json();
      console.log('DEBUG - Settings: received data:', data);
      setConfig(data);
    } catch (error) {
      showMessage('error', 'Failed to load meeting provider settings');
      console.error('Error fetching meeting provider config:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateMeetingProviderConfig = async (updates: Partial<MeetingProviderConfig>) => {
    setSaving(true);
    try {
      const orgId = user?.organizations?.[0]?.id;
      if (!orgId) {
        throw new Error('No organization found');
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/v1/organizations/${orgId}/meeting-providers`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error('Failed to update meeting provider configuration');
      }

      const updatedConfig = await response.json();
      setConfig(updatedConfig);
      
      showMessage('success', 'Meeting provider settings updated successfully');
    } catch (error) {
      showMessage('error', 'Failed to update meeting provider settings');
      console.error('Error updating meeting provider config:', error);
    } finally {
      setSaving(false);
    }
  };

  const toggleProvider = (providerId: string, enabled: boolean) => {
    if (!config) return;

    let newSupportedProviders = [...config.supportedMeetingProviders];
    
    if (enabled) {
      if (!newSupportedProviders.includes(providerId)) {
        newSupportedProviders.push(providerId);
      }
    } else {
      newSupportedProviders = newSupportedProviders.filter(id => id !== providerId);
      
      // If we're disabling the default provider, set a new default
      if (config.defaultMeetingProvider === providerId && newSupportedProviders.length > 0) {
        updateMeetingProviderConfig({
          supportedMeetingProviders: newSupportedProviders,
          defaultMeetingProvider: newSupportedProviders[0],
        });
        return;
      }
    }

    updateMeetingProviderConfig({
      supportedMeetingProviders: newSupportedProviders,
    });
  };

  const setDefaultProvider = (providerId: string) => {
    updateMeetingProviderConfig({
      defaultMeetingProvider: providerId,
    });
  };

  if (loading || profileLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-600">Failed to load meeting provider settings</p>
        <Button onClick={fetchMeetingProviderConfig} className="mt-4">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {message && (
        <div className={`p-4 rounded-lg ${
          message.type === 'success' 
            ? 'bg-green-50 text-green-800 border border-green-200' 
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-gray-600 mt-2">
          Manage your profile, timezone preferences and meeting provider settings
        </p>
      </div>

      {/* User Profile Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Profile Settings
          </CardTitle>
          <CardDescription>
            Manage your personal information and timezone preferences
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                value={userProfile.firstName}
                onChange={(e) => setUserProfile(prev => ({ ...prev, firstName: e.target.value }))}
                placeholder="Enter your first name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                value={userProfile.lastName}
                onChange={(e) => setUserProfile(prev => ({ ...prev, lastName: e.target.value }))}
                placeholder="Enter your last name"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phoneNumber">Phone Number (Optional)</Label>
            <Input
              id="phoneNumber"
              value={userProfile.phoneNumber}
              onChange={(e) => setUserProfile(prev => ({ ...prev, phoneNumber: e.target.value }))}
              placeholder="Enter your phone number"
            />
          </div>

          <div className="space-y-2">
            <TimezoneSelect
              value={userProfile.timezone}
              onChange={(timezone) => setUserProfile(prev => ({ ...prev, timezone }))}
              label="Default Timezone"
              showCurrentTime={true}
            />
            <p className="text-xs text-gray-500">
              This timezone will be used for all your bookings and availability settings. 
              Attendees will see times in their own timezone.
            </p>
          </div>

          <Button 
            onClick={updateUserProfile} 
            disabled={profileSaving}
            className="w-full md:w-auto"
          >
            {profileSaving ? 'Saving...' : 'Save Profile'}
          </Button>
        </CardContent>
      </Card>

      {/* Meeting Provider Settings */}
      {config ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SettingsIcon className="h-5 w-5" />
                Meeting Providers
              </CardTitle>
              <CardDescription>
                Choose which meeting providers are available for your bookings. Your clients will be able to select from the enabled providers when booking appointments.
              </CardDescription>
            </CardHeader>
          <CardContent className="space-y-6">
          {MEETING_PROVIDERS.map((provider) => {
            const isEnabled = config.supportedMeetingProviders.includes(provider.id);
            const isDefault = config.defaultMeetingProvider === provider.id;

            return (
              <div key={provider.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center space-x-4">
                  <span className="text-2xl">{provider.icon}</span>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="font-medium">{provider.name}</h3>
                      {isDefault && (
                        <Badge variant="secondary">Default</Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">{provider.description}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  {isEnabled && !isDefault && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDefaultProvider(provider.id)}
                      disabled={saving}
                    >
                      Set as Default
                    </Button>
                  )}
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={`provider-${provider.id}`}
                      checked={isEnabled}
                      onChange={(e) => toggleProvider(provider.id, e.target.checked)}
                      disabled={saving || (isEnabled && config.supportedMeetingProviders.length === 1)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <Label htmlFor={`provider-${provider.id}`}>
                      {isEnabled ? 'Enabled' : 'Disabled'}
                    </Label>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current Configuration</CardTitle>
          <CardDescription>
            Overview of your meeting provider settings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">Enabled Providers</Label>
              <p className="text-2xl font-bold">{config.supportedMeetingProviders.length}</p>
            </div>
            <div>
              <Label className="text-sm font-medium">Default Provider</Label>
              <p className="text-lg font-medium">
                {MEETING_PROVIDERS.find(p => p.id === config.defaultMeetingProvider)?.name || 'None'}
              </p>
            </div>
          </div>
          </CardContent>
        </Card>
        </>
      ) : (
        <div className="text-center py-8">
          <p className="text-gray-600">Failed to load meeting provider settings</p>
          <Button onClick={fetchMeetingProviderConfig} className="mt-4">
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
