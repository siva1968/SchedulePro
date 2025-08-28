'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { formatDateInUserTimezone } from '@/lib/timezone';
import { apiClient } from '@/lib/api-client';
import CreateMeetingTypeModal from '@/components/CreateMeetingTypeModal';
import EditMeetingTypeModal from '@/components/EditMeetingTypeModal';
import DashboardPageHeader from '@/components/DashboardPageHeader';
import DashboardPageContainer from '@/components/DashboardPageContainer';

interface MeetingType {
  id: string;
  name: string;
  description: string | null;
  duration: number;
  isActive: boolean;
  slug: string;
  createdAt: string;
}

export default function MeetingTypesPage() {
  const [meetingTypes, setMeetingTypes] = useState<MeetingType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingMeetingTypeId, setEditingMeetingTypeId] = useState<string | null>(null);
  const router = useRouter();
  const { logout } = useAuthStore();
  const userTimezone = useUserTimezone();

  const loadMeetingTypes = async () => {
    try {
      // Check if user is authenticated
      const token = localStorage.getItem('access_token');
      if (!token) {
        router.push('/auth/login');
        return;
      }

      // Fetch meeting types from API
      const data = await apiClient.getMeetingTypes() as MeetingType[];
      setMeetingTypes(data);
    } catch (error) {
      console.error('Failed to load meeting types:', error);
      setError('Failed to load meeting types');
      // If unauthorized, logout and redirect
      if (error instanceof Error && error.message.includes('Unauthorized')) {
        logout();
        router.push('/auth/login');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMeetingTypes();
  }, [router, logout]);

  const handleCreateMeetingType = async (data: { name: string; description?: string; duration: number; isActive: boolean }) => {
    try {
      await apiClient.createMeetingType(data);
      setIsCreateModalOpen(false);
      // Refresh the meeting types list
      await loadMeetingTypes();
    } catch (error) {
      console.error('Error creating meeting type:', error);
      // You can add toast notification here if needed
    }
  };

  const handleOpenCreateModal = () => {
    setIsCreateModalOpen(true);
  };

  const handleEditMeetingType = (id: string) => {
    setEditingMeetingTypeId(id);
    setIsEditModalOpen(true);
  };

  const handleDeleteMeetingType = async (id: string) => {
    if (!confirm('Are you sure you want to delete this meeting type?')) {
      return;
    }
    
    try {
      await apiClient.deleteMeetingType(id);
      // Reload meeting types
      const data = await apiClient.getMeetingTypes() as MeetingType[];
      setMeetingTypes(data);
    } catch (error) {
      console.error('Failed to delete meeting type:', error);
      alert('Failed to delete meeting type');
    }
  };

  if (isLoading) {
    return (
      <DashboardPageContainer>
        <DashboardPageHeader title="Meeting Types" description="Create and manage your meeting types" />
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading meeting types...</p>
          </div>
        </div>
      </DashboardPageContainer>
    );
  }

  if (error) {
    return (
      <DashboardPageContainer>
        <DashboardPageHeader title="Meeting Types" description="Create and manage your meeting types" />
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <p className="text-red-600 mb-4">{error}</p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        </div>
      </DashboardPageContainer>
    );
  }

  return (
    <>
      <DashboardPageHeader 
        title="Meeting Types" 
        description="Create and manage your meeting types"
      >
        <button
          onClick={handleOpenCreateModal}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Create Meeting Type
        </button>
      </DashboardPageHeader>
      <DashboardPageContainer>
        {/* Main Content */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Your Meeting Types</h2>
            <p className="mt-1 text-sm text-gray-500">
              Manage your meeting types and their configurations.
            </p>
          </div>

          {meetingTypes.length === 0 ? (
            <div className="p-6 text-center">
              <div className="mx-auto w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No meeting types yet</h3>
              <p className="text-gray-500 mb-6">Get started by creating your first meeting type.</p>
              <button
                onClick={handleOpenCreateModal}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Create Meeting Type
              </button>
            </div>
          ) : (
            <div className="overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Duration
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {meetingTypes.map((meetingType) => (
                    <tr key={meetingType.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{meetingType.name}</div>
                          {meetingType.description && (
                            <div className="text-sm text-gray-500">{meetingType.description}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{meetingType.duration} minutes</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          meetingType.isActive 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {meetingType.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDateInUserTimezone(meetingType.createdAt, userTimezone)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={() => handleEditMeetingType(meetingType.id)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteMeetingType(meetingType.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <CreateMeetingTypeModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={() => {
            setIsCreateModalOpen(false);
            loadMeetingTypes();
          }}
        />

        <EditMeetingTypeModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setEditingMeetingTypeId(null);
          }}
          onSuccess={() => {
            setIsEditModalOpen(false);
            setEditingMeetingTypeId(null);
            loadMeetingTypes();
          }}
          meetingTypeId={editingMeetingTypeId}
        />
      </DashboardPageContainer>
    </>
  );
}
