'use client';

import { useEffect, useState } from 'react';
import { useCalendarStore } from '@/stores/useCalendarStore';
import { CalendarProvider, CreateCalendarIntegrationRequest, CalendarIntegration } from '@/types/calendar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Plus, Calendar, Trash2, RefreshCw, Edit, Loader2 } from 'lucide-react';

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
  const [isConnecting, setIsConnecting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterProvider, setFilterProvider] = useState<CalendarProvider | 'all'>('all');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [formData, setFormData] = useState<CreateCalendarIntegrationRequest & {
    serverUrl?: string;
    username?: string;
    password?: string;
  }>({
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
    
    // Check for OAuth callback parameters
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success');
    const oauthError = urlParams.get('error');
    const integrationId = urlParams.get('integration');
    
    if (success === 'true') {
      clearError();
      // Show success message and optionally scroll to the new integration
      const successMessage = integrationId 
        ? `Google Calendar integration created successfully!`
        : 'Calendar integration completed successfully!';
        
      // You could use a toast notification here instead
      setTimeout(() => {
        alert(successMessage);
      }, 100);
      
      // Clean up URL parameters
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (oauthError) {
      clearError();
      let errorMessage = 'Authentication failed. Please try again.';
      
      switch (oauthError) {
        case 'access_denied':
          errorMessage = 'Access denied. Please grant necessary permissions to connect your calendar.';
          break;
        case 'authentication_failed':
          errorMessage = 'Authentication failed. Please check your credentials and try again.';
          break;
        case 'missing_parameters':
          errorMessage = 'Invalid authentication response. Please try again.';
          break;
      }
      
      useCalendarStore.setState({ error: errorMessage });
      
      // Clean up URL parameters
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [fetchIntegrations]);

  // OAuth connection handler
  const handleOAuthConnect = async (provider: string) => {
    setIsConnecting(true);
    try {
      const integrationName = formData.name || `${provider.charAt(0).toUpperCase() + provider.slice(1)} Calendar`;
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      
      // Get the access token from localStorage
      const token = localStorage.getItem('access_token');
      if (!token) {
        throw new Error('Authentication token not found. Please log in again.');
      }
      
      // Make authenticated request to get OAuth URL
      const response = await fetch(`${apiUrl}/api/v1/calendar/oauth/${provider}/url?integrationName=${encodeURIComponent(integrationName)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to initiate OAuth' }));
        throw new Error(errorData.message || 'Failed to initiate OAuth');
      }
      
      const data = await response.json();
      if (data.authUrl) {
        // Redirect to the OAuth URL
        window.location.href = data.authUrl;
      } else {
        throw new Error('No OAuth URL received from server');
      }
    } catch (error) {
      console.error('OAuth connection failed:', error);
      clearError();
      useCalendarStore.setState({ error: error instanceof Error ? error.message : 'Failed to connect to calendar' });
      setIsConnecting(false);
    }
  };

  const handleCreateIntegration = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Form validation
    if (!formData.name.trim()) {
      clearError();
      useCalendarStore.setState({ error: 'Integration name is required' });
      return;
    }
    
    if (formData.provider === CalendarProvider.CALDAV) {
      if (!formData.serverUrl || !formData.username || !formData.password) {
        clearError();
        useCalendarStore.setState({ error: 'CalDAV requires server URL, username, and password' });
        return;
      }
    }
    
    if (formData.timezone && !isValidTimezone(formData.timezone)) {
      clearError();
      useCalendarStore.setState({ error: 'Invalid timezone format. Use IANA timezone format (e.g., America/New_York)' });
      return;
    }
    
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
    } catch (error) {
      console.error('Failed to create integration:', error);
    }
  };

  // Timezone validation helper
  const isValidTimezone = (timezone: string): boolean => {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      return true;
    } catch (e) {
      return false;
    }
  };

  const handleDeleteIntegration = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete the ${name} integration?`)) {
      try {
        await deleteIntegration(id);
      } catch (error) {
        console.error('Failed to delete calendar integration:', error);
      }
    }
  };

  const handleSyncIntegration = async (id: string) => {
    try {
      // This would typically call a sync endpoint
      console.log('Syncing integration:', id);
      // In a real implementation:
      // await apiClient.syncCalendarIntegration(id);
      await fetchIntegrations(); // Refresh the list
    } catch (error) {
      console.error('Failed to sync integration:', error);
    }
  };

  const handleEditIntegration = (integration: CalendarIntegration) => {
    // Open edit modal or form with pre-filled data
    setFormData({
      provider: integration.provider,
      name: integration.name,
      description: integration.description || '',
      accessToken: '', // Don't pre-fill sensitive data
      refreshToken: '',
      calendarId: integration.calendarId || '',
      timezone: integration.timezone || '',
      syncEnabled: integration.syncEnabled ?? true,
      conflictDetection: integration.conflictDetection ?? true,
    });
    setIsCreateFormOpen(true);
  };

  const handleToggleActive = async (integration: any) => {
    try {
      await updateIntegration(integration.id, {
        isActive: !integration.isActive,
      });
    } catch (error) {
      console.error('Failed to update integration status:', error);
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
      case CalendarProvider.ZOOM:
        return 'Zoom';
      default:
        return provider;
    }
  };

  // Filter integrations based on search and filters
  const filteredIntegrations = integrations.filter((integration) => {
    const matchesSearch = integration.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         integration.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesProvider = filterProvider === 'all' || integration.provider === filterProvider;
    const matchesActive = filterActive === 'all' || 
                         (filterActive === 'active' && integration.isActive) ||
                         (filterActive === 'inactive' && !integration.isActive);
    
    return matchesSearch && matchesProvider && matchesActive;
  });

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
        <div className="bg-destructive/15 text-destructive px-4 py-3 rounded-md flex items-center justify-between" role="alert">
          <span>{error}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearError}
            className="ml-2"
            aria-label="Dismiss error"
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
                  Calendar Provider *
                </label>
                <select
                  id="provider"
                  value={formData.provider}
                  onChange={(e) => setFormData({ ...formData, provider: e.target.value as CalendarProvider })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  required
                  aria-describedby="provider-description"
                >
                  <option value={CalendarProvider.GOOGLE}>Google Calendar</option>
                  <option value={CalendarProvider.OUTLOOK}>Microsoft Outlook</option>
                  <option value={CalendarProvider.CALDAV}>CalDAV</option>
                  <option value={CalendarProvider.ZOOM}>Zoom</option>
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
              
              {/* OAuth Integration Buttons */}
              <div className="grid gap-2">
                <label className="text-sm font-medium">
                  Connect Calendar
                </label>
                <div className="space-y-2">
                  {formData.provider === CalendarProvider.GOOGLE && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => handleOAuthConnect('google')}
                      disabled={isConnecting}
                    >
                      <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                      {isConnecting ? 'Connecting...' : 'Connect Google Calendar'}
                    </Button>
                  )}
                  {formData.provider === CalendarProvider.OUTLOOK && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => handleOAuthConnect('outlook')}
                      disabled={isConnecting}
                    >
                      <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M24 12.013C24 5.4 18.627.027 12.014.027S.027 5.4.027 12.013 5.4 24 12.013 24C18.627 24 24 18.627 24 12.013zM12.013 22.5a10.487 10.487 0 110-20.973 10.487 10.487 0 010 20.973z"/>
                        <path fill="currentColor" d="M7.507 11.013h9v2h-9zm0-3h9v2h-9zm0 6h9v2h-9z"/>
                      </svg>
                      {isConnecting ? 'Connecting...' : 'Connect Microsoft Outlook'}
                    </Button>
                  )}
                  {formData.provider === CalendarProvider.ZOOM && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => handleOAuthConnect('zoom')}
                      disabled={isConnecting}
                    >
                      <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M1.5 5.667A1.667 1.667 0 0 1 3.167 4h17.666A1.667 1.667 0 0 1 22.5 5.667v12.666A1.667 1.667 0 0 1 20.833 20H3.167A1.667 1.667 0 0 1 1.5 18.333V5.667zM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"/>
                      </svg>
                      {isConnecting ? 'Connecting...' : 'Connect Zoom'}
                    </Button>
                  )}
                  {formData.provider === CalendarProvider.CALDAV && (
                    <div className="space-y-2">
                      <Input
                        placeholder="CalDAV Server URL"
                        value={formData.serverUrl || ''}
                        onChange={(e) => setFormData({ ...formData, serverUrl: e.target.value })}
                        required
                      />
                      <Input
                        placeholder="Username"
                        value={formData.username || ''}
                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                        required
                      />
                      <Input
                        type="password"
                        placeholder="Password"
                        value={formData.password || ''}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        required
                      />
                    </div>
                  )}
                </div>
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
                <Button 
                  type="submit" 
                  disabled={!formData.name || isLoading || (formData.provider === CalendarProvider.CALDAV && (!formData.serverUrl || !formData.username || !formData.password))}
                  className="min-w-[120px]"
                >
                  {isLoading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Creating...
                    </>
                  ) : (
                    'Create Integration'
                  )}
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

      {/* Search and Filters */}
      {integrations.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <Input
                  placeholder="Search integrations..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="flex gap-2">
                <select
                  value={filterProvider}
                  onChange={(e) => setFilterProvider(e.target.value as CalendarProvider | 'all')}
                  className="px-3 py-2 border rounded-md text-sm bg-background"
                  aria-label="Filter by provider"
                >
                  <option value="all">All Providers</option>
                  <option value={CalendarProvider.GOOGLE}>Google</option>
                  <option value={CalendarProvider.OUTLOOK}>Outlook</option>
                  <option value={CalendarProvider.CALDAV}>CalDAV</option>
                  <option value={CalendarProvider.ZOOM}>Zoom</option>
                </select>
                <select
                  value={filterActive}
                  onChange={(e) => setFilterActive(e.target.value as 'all' | 'active' | 'inactive')}
                  className="px-3 py-2 border rounded-md text-sm bg-background"
                  aria-label="Filter by status"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Integrations List */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredIntegrations.map((integration) => (
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
                    onClick={() => handleSyncIntegration(integration.id)}
                    disabled={!integration.isActive || isLoading}
                    className="text-xs"
                  >
                    <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEditIntegration(integration)}
                    className="text-xs"
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteIntegration(integration.id, integration.name)}
                    className="text-xs text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredIntegrations.length === 0 && integrations.length > 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No matching integrations</h3>
            <p className="text-muted-foreground text-center mb-4">
              Try adjusting your search or filter criteria.
            </p>
            <Button onClick={() => {
              setSearchTerm('');
              setFilterProvider('all');
              setFilterActive('all');
            }}>
              Clear Filters
            </Button>
          </CardContent>
        </Card>
      )}

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
