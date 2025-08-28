'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CalendarIcon, ClockIcon, UserIcon, MapPinIcon } from 'lucide-react';
import { toast } from 'sonner';

interface MeetingType {
  id: string;
  name: string;
  description: string;
  duration: number;
  price: number;
  locationType: 'ONLINE' | 'IN_PERSON' | 'PHONE';
  host: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
  };
}

interface TimeSlot {
  startTime: string;
  endTime: string;
  label: string;
}

interface BookingFormData {
  attendeeName: string;
  attendeeEmail: string;
  title: string;
  description: string;
  selectedDate: string;
  selectedSlot: TimeSlot | null;
  meetingProvider?: string;
}

interface MeetingProvider {
  id: string;
  name: string;
  description: string;
  icon: string;
}

interface MeetingProviderConfig {
  meetingTypeId: string;
  currentProvider: string;
  availableProviders: string[];
  defaultProvider: string;
}

export default function PublicBookingPage() {
  const params = useParams();
  const organizationSlug = params.organizationSlug as string;
  const meetingTypeId = params.meetingTypeId as string;

  const MEETING_PROVIDERS: MeetingProvider[] = [
    { id: 'GOOGLE_MEET', name: 'Google Meet', description: 'Google Meet video call', icon: '📹' },
    { id: 'MICROSOFT_TEAMS', name: 'Microsoft Teams', description: 'Microsoft Teams meeting', icon: '👥' },
    { id: 'ZOOM', name: 'Zoom', description: 'Zoom video conference', icon: '🎥' },
    { id: 'WEBEX', name: 'Webex', description: 'Cisco Webex meeting', icon: '💼' },
    { id: 'GOTOMEETING', name: 'GoToMeeting', description: 'GoToMeeting session', icon: '🚀' },
    { id: 'CUSTOM', name: 'Custom', description: 'Custom meeting location', icon: '⚙️' },
  ];

  const [meetingType, setMeetingType] = useState<MeetingType | null>(null);
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [meetingProviderConfig, setMeetingProviderConfig] = useState<MeetingProviderConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<'details' | 'time' | 'form' | 'success'>('details');
  
  const [formData, setFormData] = useState<BookingFormData>({
    attendeeName: '',
    attendeeEmail: '',
    title: '',
    description: '',
    selectedDate: '',
    selectedSlot: null,
    meetingProvider: '',
  });

  // Load meeting type details
  useEffect(() => {
    const fetchMeetingType = async () => {
      try {
        const response = await fetch(`/api/public/meeting-types/${organizationSlug}/${meetingTypeId}`);
        if (!response.ok) {
          throw new Error('Meeting type not found');
        }
        const data = await response.json();
        setMeetingType(data);
        setFormData(prev => ({
          ...prev,
          title: `Meeting with ${data.host.firstName} ${data.host.lastName}`,
        }));

        // Fetch meeting provider config
        try {
          const providerResponse = await fetch(`/api/public/bookings/meeting-type/${meetingTypeId}/providers`);
          if (providerResponse.ok) {
            const providerData = await providerResponse.json();
            setMeetingProviderConfig(providerData);
            setFormData(prev => ({
              ...prev,
              meetingProvider: providerData.defaultProvider || providerData.currentProvider,
            }));
          }
        } catch (providerError) {
          console.error('Error fetching meeting provider config:', providerError);
          // Continue without provider config - use default
        }
      } catch (error) {
        console.error('Error fetching meeting type:', error);
        toast.error('Failed to load meeting details');
      } finally {
        setLoading(false);
      }
    };

    fetchMeetingType();
  }, [organizationSlug, meetingTypeId]);

  // Load available slots when date is selected
  useEffect(() => {
    const fetchAvailableSlots = async () => {
      if (!formData.selectedDate || !meetingType) return;

      try {
        const response = await fetch(
          `/api/public/bookings/available-slots?meetingTypeId=${meetingType.id}&date=${formData.selectedDate}`
        );
        if (!response.ok) {
          throw new Error('Failed to fetch available slots');
        }
        const data = await response.json();
        setAvailableSlots(data.availableSlots || []);
        
        // Show helpful message if no slots are available
        if (data.message && (!data.availableSlots || data.availableSlots.length === 0)) {
          toast.info(data.message);
        }
      } catch (error) {
        console.error('Error fetching available slots:', error);
        toast.error('Failed to load available time slots');
      }
    };

    fetchAvailableSlots();
  }, [formData.selectedDate, meetingType]);

  const handleDateChange = (date: string) => {
    setFormData(prev => ({
      ...prev,
      selectedDate: date,
      selectedSlot: null,
    }));
  };

  const handleSlotSelect = (slot: TimeSlot) => {
    setFormData(prev => ({
      ...prev,
      selectedSlot: slot,
    }));
    setStep('form');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.selectedSlot || !meetingType) return;

    setSubmitting(true);
    try {
      const bookingData = {
        meetingTypeId: meetingType.id,
        startTime: formData.selectedSlot.startTime,
        endTime: formData.selectedSlot.endTime,
        title: formData.title,
        description: formData.description,
        locationType: meetingType.locationType,
        meetingProvider: formData.meetingProvider,
        attendees: [
          {
            name: formData.attendeeName,
            email: formData.attendeeEmail,
          },
        ],
      };

      const response = await fetch('/api/public/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bookingData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create booking');
      }

      const booking = await response.json();
      console.log('Booking created:', booking);
      setStep('success');
      toast.success('Booking created successfully!');
    } catch (error) {
      console.error('Error creating booking:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create booking');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading meeting details...</p>
        </div>
      </div>
    );
  }

  if (!meetingType) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="text-center py-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Meeting Not Found</h2>
            <p className="text-gray-600">The requested meeting type could not be found.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Book a meeting with {meetingType.host.firstName}
          </h1>
          <p className="text-gray-600">{meetingType.organization.name}</p>
        </div>

        {/* Meeting Details */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              {meetingType.name}
            </CardTitle>
            <CardDescription>{meetingType.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <ClockIcon className="h-4 w-4 text-gray-500" />
                <span>{meetingType.duration} minutes</span>
              </div>
              <div className="flex items-center gap-2">
                <UserIcon className="h-4 w-4 text-gray-500" />
                <span>{meetingType.host.firstName} {meetingType.host.lastName}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPinIcon className="h-4 w-4 text-gray-500" />
                <span>{meetingType.locationType}</span>
              </div>
            </div>
            {meetingType.price > 0 && (
              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <span className="text-blue-800 font-semibold">Price: ${meetingType.price}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Booking Steps */}
        {step === 'details' || step === 'time' ? (
          <Card>
            <CardHeader>
              <CardTitle>Select Date & Time</CardTitle>
              <CardDescription>Choose your preferred date and time for the meeting</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Date Selection */}
              <div>
                <Label htmlFor="date" className="text-base font-medium">Select Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.selectedDate}
                  onChange={(e) => handleDateChange(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="mt-2"
                />
              </div>

              {/* Time Slots */}
              {formData.selectedDate && (
                <div>
                  <Label className="text-base font-medium">Available Times</Label>
                  <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2">
                    {availableSlots.length > 0 ? (
                      availableSlots.map((slot, index) => (
                        <Button
                          key={index}
                          variant="outline"
                          className="text-left justify-start"
                          onClick={() => handleSlotSelect(slot)}
                        >
                          {slot.label}
                        </Button>
                      ))
                    ) : (
                      <p className="col-span-full text-gray-500 py-4 text-center">
                        No available time slots for this date
                      </p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : step === 'form' ? (
          <Card>
            <CardHeader>
              <CardTitle>Booking Details</CardTitle>
              <CardDescription>
                Selected: {new Date(formData.selectedDate).toDateString()} at {formData.selectedSlot?.label}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="attendeeName">Your Name *</Label>
                  <Input
                    id="attendeeName"
                    required
                    value={formData.attendeeName}
                    onChange={(e) => setFormData(prev => ({ ...prev, attendeeName: e.target.value }))}
                    placeholder="Enter your full name"
                  />
                </div>

                <div>
                  <Label htmlFor="attendeeEmail">Your Email *</Label>
                  <Input
                    id="attendeeEmail"
                    type="email"
                    required
                    value={formData.attendeeEmail}
                    onChange={(e) => setFormData(prev => ({ ...prev, attendeeEmail: e.target.value }))}
                    placeholder="Enter your email address"
                  />
                </div>

                <div>
                  <Label htmlFor="title">Meeting Title</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Enter meeting title"
                  />
                </div>

                {/* Meeting Provider Selection */}
                {meetingProviderConfig && meetingProviderConfig.availableProviders.length > 1 && (
                  <div>
                    <Label htmlFor="meetingProvider">Meeting Platform</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                      {meetingProviderConfig.availableProviders.map((providerId) => {
                        const provider = MEETING_PROVIDERS.find(p => p.id === providerId);
                        if (!provider) return null;
                        
                        return (
                          <label
                            key={provider.id}
                            className={`flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50 ${
                              formData.meetingProvider === provider.id 
                                ? 'border-blue-500 bg-blue-50' 
                                : 'border-gray-300'
                            }`}
                          >
                            <input
                              type="radio"
                              name="meetingProvider"
                              value={provider.id}
                              checked={formData.meetingProvider === provider.id}
                              onChange={(e) => setFormData(prev => ({ ...prev, meetingProvider: e.target.value }))}
                              className="sr-only"
                            />
                            <span className="text-xl mr-3">{provider.icon}</span>
                            <div>
                              <div className="font-medium text-sm">{provider.name}</div>
                              <div className="text-xs text-gray-600">{provider.description}</div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <Label htmlFor="description">Additional Notes</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Any additional information or requirements"
                    rows={3}
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep('time')}
                    className="flex-1"
                  >
                    Back
                  </Button>
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="flex-1"
                  >
                    {submitting ? 'Creating Booking...' : 'Confirm Booking'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Booking Confirmed!</h2>
              <p className="text-gray-600 mb-4">
                Your meeting has been scheduled for {new Date(formData.selectedDate).toDateString()} at {formData.selectedSlot?.label}
              </p>
              <p className="text-sm text-gray-500">
                You will receive a confirmation email at {formData.attendeeEmail}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
