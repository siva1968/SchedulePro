'use client';

import { useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';

interface CreateMeetingTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface CreateMeetingTypeData {
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

export default function CreateMeetingTypeModal({ isOpen, onClose, onSuccess }: CreateMeetingTypeModalProps) {
  const { user } = useAuthStore();
  const [formData, setFormData] = useState<CreateMeetingTypeData>({
    name: '',
    description: '',
    duration: 30,
    isActive: true,
    meetingProvider: 'GOOGLE_MEET',
    meetingProviderConfig: {},
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

      // Create meeting type
      const organizationId = user?.organizations?.[0]?.id;
      if (!organizationId) {
        console.log('DEBUG - No organization found. User:', user);
        console.log('DEBUG - User organizations:', user?.organizations);
        setErrors({ general: 'No organization found. Please contact support.' });
        setIsLoading(false);
        return;
      }

      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        duration: formData.duration,
        isActive: formData.isActive,
        organizationId: organizationId,
      };
      console.log('Creating meeting type with payload:', payload);
      await apiClient.createMeetingType(payload);

      // Reset form and close modal
      setFormData({
        name: '',
        description: '',
        duration: 30,
        isActive: true,
        meetingProvider: 'GOOGLE_MEET',
        meetingProviderConfig: {},
      });
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Failed to create meeting type:', error);
      setErrors({ general: 'Failed to create meeting type. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setFormData({
        name: '',
        description: '',
        duration: 30,
        isActive: true,
        meetingProvider: 'GOOGLE_MEET',
        meetingProviderConfig: {},
      });
      setErrors({});
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Create Meeting Type</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errors.general && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-sm text-red-600">{errors.general}</p>
            </div>
          )}

          {/* Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Name *
            </label>
            <input
              type="text"
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${
                errors.name ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="e.g., 30-Minute Consultation"
              disabled={isLoading}
            />
            {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Brief description of this meeting type..."
              disabled={isLoading}
            />
          </div>

          {/* Duration */}
          <div>
            <label htmlFor="duration" className="block text-sm font-medium text-gray-700 mb-1">
              Duration (minutes) *
            </label>
            <select
              id="duration"
              value={formData.duration}
              onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
              className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${
                errors.duration ? 'border-red-300' : 'border-gray-300'
              }`}
              disabled={isLoading}
            >
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={45}>45 minutes</option>
              <option value={60}>1 hour</option>
              <option value={90}>1.5 hours</option>
              <option value={120}>2 hours</option>
              <option value={180}>3 hours</option>
              <option value={240}>4 hours</option>
            </select>
            {errors.duration && <p className="mt-1 text-sm text-red-600">{errors.duration}</p>}
          </div>

          {/* Active Status */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              disabled={isLoading}
            />
            <label htmlFor="isActive" className="ml-2 block text-sm text-gray-700">
              Active (available for booking)
            </label>
          </div>

          {/* Buttons */}
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Creating...
                </>
              ) : (
                'Create Meeting Type'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
