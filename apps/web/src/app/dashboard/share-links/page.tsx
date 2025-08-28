'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Copy, ExternalLink, Share, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import DashboardPageHeader from '@/components/DashboardPageHeader';
import DashboardPageContainer from '@/components/DashboardPageContainer';
import { useAuthStore } from '@/stores/auth-store';

interface MeetingType {
  id: string;
  name: string;
  description: string;
  duration: number;
  price: number;
  locationType: 'ONLINE' | 'IN_PERSON' | 'PHONE';
  isActive: boolean;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
}

export default function ShareLinksPage() {
  const [meetingTypes, setMeetingTypes] = useState<MeetingType[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, token } = useAuthStore();
  
  // Get organization from user data in auth store
  const organization = user?.organizations?.[0] ? {
    id: user.organizations[0].id,
    name: user.organizations[0].name,
    slug: user.organizations[0].slug,
  } : null;

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch meeting types
        const meetingTypesResponse = await fetch('http://localhost:3001/api/v1/meeting-types', {
          headers: {
            'Authorization': `Bearer ${token || localStorage.getItem('access_token')}`,
          },
        });

        if (meetingTypesResponse.ok) {
          const meetingTypesData = await meetingTypesResponse.json();
          setMeetingTypes(Array.isArray(meetingTypesData) ? meetingTypesData : meetingTypesData.meetingTypes || []);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        toast.error('Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token]);

  const generateUnifiedBookingLink = () => {
    if (!organization) return '';
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    return `${baseUrl}/book/${organization.slug}`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success('Link copied to clipboard!');
    }).catch(() => {
      toast.error('Failed to copy link');
    });
  };

  const shareLink = () => {
    const link = generateUnifiedBookingLink();
    if (navigator.share) {
      navigator.share({
        title: `Book a meeting with ${organization?.name}`,
        text: `Schedule a meeting with me - choose from multiple meeting types`,
        url: link,
      }).catch(() => {
        copyToClipboard(link);
      });
    } else {
      copyToClipboard(link);
    }
  };

  const activeMeetingTypes = meetingTypes.filter(type => type.isActive);
  const unifiedBookingLink = generateUnifiedBookingLink();

  if (loading) {
    return (
      <DashboardPageContainer>
        <DashboardPageHeader
          title="Share Links"
          description="Share your unified booking link with clients"
        />
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-500">Loading...</div>
        </div>
      </DashboardPageContainer>
    );
  }

  return (
    <DashboardPageContainer>
      <DashboardPageHeader
        title="Share Links"
        description="Share your unified booking link with clients"
      />

      <div className="space-y-6">
        {!organization && (
          <Card className="border-yellow-200 bg-yellow-50">
            <CardContent className="pt-6">
              <p className="text-yellow-800">
                ⚠️ Organization information not found. Please ensure you're part of an organization to generate booking links.
              </p>
            </CardContent>
          </Card>
        )}

        {organization && (
          <>
            {/* Unified Booking Link */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5" />
                  Unified Booking Link
                </CardTitle>
                <CardDescription>
                  One link for all your meeting types. Clients can select their preferred meeting type during booking.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Public Booking Link
                  </label>
                  <div className="flex items-center space-x-2">
                    <Input
                      value={unifiedBookingLink}
                      readOnly
                      className="flex-1 font-mono text-sm"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(unifiedBookingLink)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(unifiedBookingLink, '_blank')}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={shareLink}
                    >
                      <Share className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Embed Code */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Embed Code (for websites)
                  </label>
                  <div className="flex gap-2">
                    <Input
                      value={`<iframe src="${unifiedBookingLink}" width="100%" height="600" frameborder="0"></iframe>`}
                      readOnly
                      className="flex-1 font-mono text-xs"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(`<iframe src="${unifiedBookingLink}" width="100%" height="600" frameborder="0"></iframe>`)}
                      className="shrink-0"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                {/* Active Meeting Types Preview */}
                <div className="mt-4">
                  <h4 className="text-sm font-medium mb-2">Available Meeting Types:</h4>
                  <div className="flex flex-wrap gap-2">
                    {activeMeetingTypes.map((type) => (
                      <Badge key={type.id} variant="secondary" className="text-xs">
                        {type.name} ({type.duration}min)
                        {type.price > 0 && ` - $${type.price}`}
                      </Badge>
                    ))}
                  </div>
                  {activeMeetingTypes.length === 0 && (
                    <p className="text-sm text-yellow-600">
                      ⚠️ No active meeting types found. Activate meeting types to allow bookings.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* How it Works */}
            <Card>
              <CardHeader>
                <CardTitle>How It Works</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-medium">
                      1
                    </div>
                    <div>
                      <p className="font-medium">Share the unified link</p>
                      <p className="text-gray-600">Send the single booking link to your clients</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-medium">
                      2
                    </div>
                    <div>
                      <p className="font-medium">Client selects meeting type</p>
                      <p className="text-gray-600">They choose from your available meeting types</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-medium">
                      3
                    </div>
                    <div>
                      <p className="font-medium">Booking completed</p>
                      <p className="text-gray-600">They schedule their preferred time slot</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Usage Instructions */}
            <Card>
              <CardHeader>
                <CardTitle>How to use your booking link</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-gray-600">
                <div>
                  <h4 className="font-medium text-gray-900 mb-1">📧 Email Signature</h4>
                  <p>Add your booking link to your email signature for easy scheduling.</p>
                </div>
                <div>
                  <h4 className="font-medium text-gray-900 mb-1">🌐 Website Integration</h4>
                  <p>Use the embed code to add a booking widget directly to your website.</p>
                </div>
                <div>
                  <h4 className="font-medium text-gray-900 mb-1">📱 Social Media</h4>
                  <p>Share your booking link on social media platforms and messaging apps.</p>
                </div>
                <div>
                  <h4 className="font-medium text-gray-900 mb-1">📋 Business Cards</h4>
                  <p>Add a QR code linking to your booking page on business cards and marketing materials.</p>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {meetingTypes.length === 0 && (
          <Card>
            <CardContent className="text-center py-12">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Meeting Types Found</h3>
              <p className="text-gray-600 mb-4">
                Create meeting types first to generate booking links.
              </p>
              <Button asChild>
                <a href="/dashboard/meeting-types">Create Meeting Type</a>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardPageContainer>
  );
}
