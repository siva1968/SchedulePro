'use client';

import { useEffect, useState } from 'react';
import { useCalendarStore } from '@/stores/useCalendarStore';
import { CalendarProvider, CreateCalendarIntegrationRequest } from '@/types/calendar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2, Plus, Calendar, Trash2 } from 'lucide-react';

export default function CalendarIntegrationsPage() {
  const {
    integrations,
    isLoading,
    error,
    fetchIntegrations,
    createIntegration,
    updateIntegration,
    deleteIntegration,
    clearError,
  } = useCalendarStore();

  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [formData, setFormData] = useState<CreateCalendarIntegrationRequest>({
    provider: CalendarProvider.GOOGLE,
    name: '',
    description: '',
    accessToken: '',
    refreshToken: '',
    calendarId: '',
    syncEnabled: true,
    conflictDetection: true,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  const handleCreateIntegration = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createIntegration(formData);
      setIsCreateFormOpen(false);
      setFormData({
        provider: CalendarProvider.GOOGLE,
        name: '',
        description: '',
        accessToken: '',
        refreshToken: '',
        calendarId: '',
        syncEnabled: true,
        conflictDetection: true,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      alert('Calendar integration created successfully');
    } catch (error) {
      alert('Failed to create calendar integration');
    }
  };

  const handleDeleteIntegration = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete the ${name} integration?`)) {
      try {
        await deleteIntegration(id);
        alert('Calendar integration deleted successfully');
      } catch (error) {
        alert('Failed to delete calendar integration');
      }
    }
  };

  const handleToggleActive = async (integration: any) => {
    try {
      await updateIntegration(integration.id, {
        isActive: !integration.isActive,
      });
      alert(`Integration ${integration.isActive ? 'disabled' : 'enabled'} successfully`);
    } catch (error) {
      alert('Failed to update integration status');
    }
  };

  const getProviderName = (provider: CalendarProvider) => {
    switch (provider) {
      case CalendarProvider.GOOGLE:
        return 'Google Calendar';
      case CalendarProvider.OUTLOOK:
        return 'Microsoft Outlook';
      case CalendarProvider.CALDAV:
        return 'CalDAV';
      default:
        return provider;
    }
  };

  if (isLoading && integrations.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Calendar Integrations</h1>
          <p className="text-muted-foreground">
            Connect your external calendars to sync appointments and check for conflicts.
          </p>
        </div>
        <Button onClick={() => setIsCreateFormOpen(!isCreateFormOpen)}>
          <Plus className="mr-2 h-4 w-4" />
          {isCreateFormOpen ? 'Cancel' : 'Add Integration'}
        </Button>
      </div>

      {error && (
        <div className="bg-destructive/15 text-destructive px-4 py-3 rounded-md">
          {error}
          <Button
            variant="ghost"
            size="sm"
            onClick={clearError}
            className="ml-2"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Create Form */}
      {isCreateFormOpen && (
        <Card>
          <CardHeader>
            <CardTitle>Add Calendar Integration</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateIntegration} className="space-y-4">
              <div className="grid gap-2">
                <label htmlFor="provider" className="text-sm font-medium">
                  Calendar Provider
                </label>
                <select
                  id="provider"
                  value={formData.provider}
                  onChange={(e) => setFormData({ ...formData, provider: e.target.value as CalendarProvider })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value={CalendarProvider.GOOGLE}>Google Calendar</option>
                  <option value={CalendarProvider.OUTLOOK}>Microsoft Outlook</option>
                  <option value={CalendarProvider.CALDAV}>CalDAV</option>
                </select>
              </div>
              
              <div className="grid gap-2">
                <label htmlFor="name" className="text-sm font-medium">
                  Integration Name
                </label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="My Work Calendar"
                  required
                />
              </div>
              
              <div className="grid gap-2">
                <label htmlFor="description" className="text-sm font-medium">
                  Description (Optional)
                </label>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Description of this calendar integration"
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              
              <div className="grid gap-2">
                <label htmlFor="accessToken" className="text-sm font-medium">
                  Access Token
                </label>
                <Input
                  id="accessToken"
                  type="password"
                  value={formData.accessToken}
                  onChange={(e) => setFormData({ ...formData, accessToken: e.target.value })}
                  placeholder="Calendar service access token"
                  required
                />
              </div>
              
              <div className="grid gap-2">
                <label htmlFor="calendarId" className="text-sm font-medium">
                  Calendar ID (Optional)
                </label>
                <Input
                  id="calendarId"
                  value={formData.calendarId}
                  onChange={(e) => setFormData({ ...formData, calendarId: e.target.value })}
                  placeholder="Specific calendar ID (leave empty for primary)"
                />
              </div>
              
              <div className="grid gap-2">
                <label htmlFor="timezone" className="text-sm font-medium">
                  Timezone
                </label>
                <Input
                  id="timezone"
                  value={formData.timezone}
                  onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                  placeholder="America/New_York"
                />
              </div>
              
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="syncEnabled"
                  checked={formData.syncEnabled}
                  onChange={(e) => setFormData({ ...formData, syncEnabled: e.target.checked })}
                  className="h-4 w-4"
                />
                <label htmlFor="syncEnabled" className="text-sm">Enable sync</label>
              </div>
              
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="conflictDetection"
                  checked={formData.conflictDetection}
                  onChange={(e) => setFormData({ ...formData, conflictDetection: e.target.checked })}
                  className="h-4 w-4"
                />
                <label htmlFor="conflictDetection" className="text-sm">Enable conflict detection</label>
              </div>
              
              <div className="flex gap-2">
                <Button type="submit" disabled={!formData.name || !formData.accessToken}>
                  Create Integration
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateFormOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Integrations List */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {integrations.map((integration) => (
          <Card key={integration.id} className={!integration.isActive ? 'opacity-60' : ''}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                {integration.name}
              </CardTitle>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-1 rounded-full ${
                  integration.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                }`}>
                  {integration.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground mb-2">
                {getProviderName(integration.provider)}
              </div>
              {integration.description && (
                <p className="text-sm text-muted-foreground mb-2">
                  {integration.description}
                </p>
              )}
              <div className="space-y-1 text-xs">
                {integration.syncEnabled && (
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                    <span>Sync enabled</span>
                  </div>
                )}
                {integration.conflictDetection && (
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                    <span>Conflict detection</span>
                  </div>
                )}
                {integration.timezone && (
                  <div className="text-muted-foreground">
                    Timezone: {integration.timezone}
                  </div>
                )}
                {integration.lastSyncAt && (
                  <div className="text-muted-foreground">
                    Last sync: {new Date(integration.lastSyncAt).toLocaleString()}
                  </div>
                )}
              </div>
              <div className="flex justify-between items-center mt-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={integration.isActive}
                    onChange={() => handleToggleActive(integration)}
                    className="h-4 w-4"
                    aria-label={`Toggle ${integration.name} integration`}
                  />
                  <span className="text-xs text-muted-foreground">
                    {integration.isActive ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteIntegration(integration.id, integration.name)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {integrations.length === 0 && !isCreateFormOpen && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No calendar integrations</h3>
            <p className="text-muted-foreground text-center mb-4">
              Connect your external calendars to sync appointments and avoid conflicts.
            </p>
            <Button onClick={() => setIsCreateFormOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Your First Integration
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
