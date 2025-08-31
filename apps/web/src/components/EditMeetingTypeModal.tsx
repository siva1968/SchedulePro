'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';

interface EditMeetingTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  meetingTypeId: string | null;
}

interface EditMeetingTypeData {
  name: string;
  description: string;
  duration: number;
  isActive: boolean;
  meetingProvider: string;
  meetingProviderConfig: {
    zoomApiKey?: string;
    zoomApiSecret?: string;
    teamsAppId?: string;
    teamsClientSecret?: string;
    googleClientId?: string;
    googleClientSecret?: string;
    customMeetingUrl?: string;
  };
}

interface MeetingType {
  id: string;
  name: string;
  description: string | null;
  duration: number;
  isActive: boolean;
  slug: string;
  createdAt: string;
  meetingProvider?: string;
}

export default function EditMeetingTypeModal({ isOpen, onClose, onSuccess, meetingTypeId }: EditMeetingTypeModalProps) {
  const { user } = useAuthStore();
  const [formData, setFormData] = useState<EditMeetingTypeData>({
    name: '',
    description: '',
    duration: 30,
    isActive: true,
    meetingProvider: 'GOOGLE_MEET',
    meetingProviderConfig: {},
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [availableProviders, setAvailableProviders] = useState<string[]>(['GOOGLE_MEET']);
  const [defaultProvider, setDefaultProvider] = useState<string>('GOOGLE_MEET');

  // Meeting provider display information
  const getProviderInfo = (providerId: string) => {
    const providers: Record<string, { label: string; name: string }> = {
      'GOOGLE_MEET': { label: '🎥 Google Meet', name: 'Google Meet' },
      'MICROSOFT_TEAMS': { label: '💼 Microsoft Teams', name: 'Microsoft Teams' },
      'ZOOM': { label: '📹 Zoom', name: 'Zoom' },
      'WEBEX': { label: '🌐 Cisco Webex', name: 'Cisco Webex' },
      'GOTOMEETING': { label: '📞 GoToMeeting', name: 'GoToMeeting' },
      'CUSTOM': { label: '⚙️ Custom', name: 'Custom' },
    };
    return providers[providerId] || { label: providerId, name: providerId };
  };

  // Load meeting type data when modal opens
  useEffect(() => {
    if (isOpen && meetingTypeId) {
      loadMeetingTypeData();
      fetchProviderConfig();
    }
  }, [isOpen, meetingTypeId]);

  // Fetch organization meeting provider configuration
  const fetchProviderConfig = async () => {
    try {
      const orgId = user?.organizations?.[0]?.id;
      if (!orgId) return;

      const response = await fetch(`http://localhost:3001/api/v1/organizations/${orgId}/meeting-providers`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
      });

      if (response.ok) {
        const config = await response.json();
        setAvailableProviders(config.supportedMeetingProviders || ['GOOGLE_MEET']);
        setDefaultProvider(config.defaultMeetingProvider || 'GOOGLE_MEET');
      }
    } catch (error) {
      console.error('Error fetching provider config:', error);
    }
  };

  const loadMeetingTypeData = async () => {
    if (!meetingTypeId) return;
    
    setIsLoadingData(true);
    try {
      const meetingTypes = await apiClient.getMeetingTypes() as MeetingType[];
      const meetingType = meetingTypes.find(mt => mt.id === meetingTypeId);
      
      if (meetingType) {
        setFormData({
          name: meetingType.name,
          description: meetingType.description || '',
          duration: meetingType.duration,
          isActive: meetingType.isActive,
          meetingProvider: meetingType.meetingProvider || 'GOOGLE_MEET',
          meetingProviderConfig: {},
        });
      }
    } catch (error) {
      console.error('Failed to load meeting type:', error);
      setErrors({ general: 'Failed to load meeting type data' });
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meetingTypeId) return;
    
    setIsLoading(true);
    setErrors({});

    try {
      // Validate form
      const newErrors: Record<string, string> = {};
      if (!formData.name.trim()) {
        newErrors.name = 'Name is required';
      }
      if (formData.duration < 5) {
        newErrors.duration = 'Duration must be at least 5 minutes';
      }
      if (formData.duration > 480) {
        newErrors.duration = 'Duration cannot exceed 8 hours (480 minutes)';
      }

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        setIsLoading(false);
        return;
      }

      // Update meeting type
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        duration: formData.duration,
        isActive: formData.isActive,
        meetingProvider: formData.meetingProvider,
      };
      
      console.log('Updating meeting type with payload:', payload);
      await apiClient.updateMeetingType(meetingTypeId, payload);

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Failed to update meeting type:', error);
      setErrors({ general: 'Failed to update meeting type. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: keyof EditMeetingTypeData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Edit Meeting Type</h2>
        </div>

        {isLoadingData ? (
          <div className="px-6 py-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading meeting type...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 py-4">
            {errors.general && (
              <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                {errors.general}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  Meeting Type Name *
                </label>
                <input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.name ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="e.g., 30-minute consultation"
                />
                {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Brief description of this meeting type"
                />
              </div>

              <div>
                <label htmlFor="duration" className="block text-sm font-medium text-gray-700 mb-1">
                  Duration (minutes) *
                </label>
                <input
                  id="duration"
                  type="number"
                  min="5"
                  max="480"
                  value={formData.duration}
                  onChange={(e) => handleInputChange('duration', parseInt(e.target.value))}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.duration ? 'border-red-300' : 'border-gray-300'
                  }`}
                />
                {errors.duration && <p className="mt-1 text-sm text-red-600">{errors.duration}</p>}
              </div>

              {/* Meeting Provider */}
              <div>
                <label htmlFor="meetingProvider" className="block text-sm font-medium text-gray-700 mb-1">
                  Meeting Provider *
                </label>
                <select
                  id="meetingProvider"
                  value={formData.meetingProvider}
                  onChange={(e) => handleInputChange('meetingProvider', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                >
                  {availableProviders.map(providerId => {
                    const providerInfo = getProviderInfo(providerId);
                    return (
                      <option key={providerId} value={providerId}>
                        {providerInfo.label}
                      </option>
                    );
                  })}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  {availableProviders.length > 1 
                    ? 'Choose your preferred video conferencing platform for this meeting type'
                    : 'Meeting provider configured by your organization admin'
                  }
                </p>
              </div>

              <div className="flex items-center">
                <input
                  id="isActive"
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => handleInputChange('isActive', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="isActive" className="ml-2 block text-sm text-gray-700">
                  Active (available for booking)
                </label>
              </div>
            </div>
          </form>
        )}

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={isLoading || isLoadingData}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Updating...' : 'Update Meeting Type'}
          </button>
        </div>
      </div>
    </div>
  );
}
