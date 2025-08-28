'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CalendarIcon, ClockIcon, UserIcon, MapPinIcon, ArrowLeft, Globe } from 'lucide-react';
import { toast } from 'sonner';
import TimezoneSelect from '@/components/TimezoneSelect';
import { getSystemTimezone, convertToTimezone } from '@/lib/timezone';

interface MeetingType {
  id: string;
  name: string;
  description: string;
  duration: number;
  price?: number;
  locationType?: 'ONLINE' | 'IN_PERSON' | 'PHONE';
  isActive: boolean;
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
  timezone: string;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

export default function UnifiedBookingPage() {
  const params = useParams();
  const organizationSlug = params.organizationSlug as string;

  const [step, setStep] = useState<'select-meeting-type' | 'book-meeting'>('select-meeting-type');
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [meetingTypes, setMeetingTypes] = useState<MeetingType[]>([]);
  const [selectedMeetingType, setSelectedMeetingType] = useState<MeetingType | null>(null);
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<BookingFormData>({
    attendeeName: '',
    attendeeEmail: '',
    title: '',
    description: '',
    selectedDate: '',
    selectedSlot: null,
    timezone: getSystemTimezone(),
  });

  useEffect(() => {
    fetchOrganizationAndMeetingTypes();
  }, [organizationSlug]);

  const fetchOrganizationAndMeetingTypes = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch organization and meeting types
      const response = await fetch(`http://localhost:3001/api/v1/public/organizations/${organizationSlug}/meeting-types`);
      
      if (!response.ok) {
        throw new Error('Organization not found');
      }

      const data = await response.json();
      setOrganization(data.organization);
      setMeetingTypes(data.meetingTypes.filter((mt: MeetingType) => mt.isActive));
    } catch (error) {
      console.error('Failed to fetch organization data:', error);
      setError('Failed to load booking page. Please check the URL and try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableSlots = async (meetingTypeId: string, date: string, timezone?: string) => {
    try {
      const selectedTimezone = timezone || formData.timezone || getSystemTimezone();
      const url = `http://localhost:3001/api/v1/public/bookings/available-slots?meetingTypeId=${meetingTypeId}&date=${date}&timezone=${encodeURIComponent(selectedTimezone)}`;
      console.log('🕐 PublicBooking: Fetching slots from:', url);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Failed to fetch availability');
      }

      const data = await response.json();
      console.log('🕐 PublicBooking: Received slots:', data.availableSlots);
      setAvailableSlots(data.availableSlots || []);
      
      // Show helpful message if no slots are available
      if (data.message && (!data.availableSlots || data.availableSlots.length === 0)) {
        toast.info(data.message);
      }
    } catch (error) {
      console.error('🕐 PublicBooking: Failed to fetch available slots:', error);
      toast.error('Failed to load available time slots');
    }
  };

  const handleMeetingTypeSelect = (meetingType: MeetingType) => {
    setSelectedMeetingType(meetingType);
    setFormData(prev => ({
      ...prev,
      title: `${meetingType.name} with ${meetingType.host.firstName} ${meetingType.host.lastName}`,
    }));
    setStep('book-meeting');
  };

  const handleDateChange = (date: string) => {
    setFormData(prev => ({ ...prev, selectedDate: date, selectedSlot: null }));
    if (selectedMeetingType) {
      fetchAvailableSlots(selectedMeetingType.id, date);
    }
  };

  const handleSlotSelect = (slot: TimeSlot) => {
    setFormData(prev => ({ ...prev, selectedSlot: slot }));
  };

  const handleTimezoneChange = (timezone: string) => {
    console.log('🕐 PublicBooking: Timezone changing from', formData.timezone, 'to', timezone);
    setFormData(prev => ({ ...prev, timezone, selectedSlot: null }));
    // Re-fetch available slots if a date is selected to show times in the new timezone
    if (selectedMeetingType && formData.selectedDate) {
      console.log('🕐 PublicBooking: Re-fetching slots with new timezone:', timezone);
      fetchAvailableSlots(selectedMeetingType.id, formData.selectedDate, timezone);
    }
  };

  const handleBooking = async () => {
    if (!selectedMeetingType || !formData.selectedSlot || !formData.attendeeName || !formData.attendeeEmail) {
      toast.error('Please fill in all required fields');
      return;
    }

    setBookingLoading(true);
    try {
      // Convert slot times to the selected timezone for API submission
      const startTime = new Date(formData.selectedSlot.startTime);
      const endTime = new Date(formData.selectedSlot.endTime);
      const startTimeInSelectedTZ = convertToTimezone(startTime, formData.timezone);
      const endTimeInSelectedTZ = convertToTimezone(endTime, formData.timezone);

      const response = await fetch('http://localhost:3001/api/v1/public/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          meetingTypeId: selectedMeetingType.id,
          startTime: startTimeInSelectedTZ.toISOString(),
          endTime: endTimeInSelectedTZ.toISOString(),
          title: formData.title,
          description: formData.description,
          attendees: [
            {
              name: formData.attendeeName,
              email: formData.attendeeEmail,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create booking');
      }

      const booking = await response.json();
      toast.success('Booking confirmed! You will receive a confirmation email shortly.');
      
      // Reset form
      setFormData({
        attendeeName: '',
        attendeeEmail: '',
        title: '',
        description: '',
        selectedDate: '',
        selectedSlot: null,
        timezone: getSystemTimezone(),
      });
      setStep('select-meeting-type');
      setSelectedMeetingType(null);
    } catch (error) {
      console.error('Booking failed:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create booking');
    } finally {
      setBookingLoading(false);
    }
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}min`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 text-lg mb-4">{error}</p>
          <Button onClick={() => window.location.reload()}>Try Again</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">{organization?.name}</h1>
          {organization?.description && (
            <p className="text-gray-600 mt-2">{organization.description}</p>
          )}
        </div>

        {step === 'select-meeting-type' && (
          <div>
            <h2 className="text-2xl font-semibold text-gray-900 mb-6">Choose a Meeting Type</h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {meetingTypes.map((meetingType) => (
                <Card key={meetingType.id} className="cursor-pointer hover:shadow-md transition-shadow">
                  <CardContent className="p-6" onClick={() => handleMeetingTypeSelect(meetingType)}>
                    <div className="flex items-start justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-900">{meetingType.name}</h3>
                      <div className="flex items-center text-sm text-gray-500">
                        <ClockIcon className="w-4 h-4 mr-1" />
                        {formatDuration(meetingType.duration)}
                      </div>
                    </div>
                    
                    {meetingType.description && (
                      <p className="text-gray-600 text-sm mb-4">{meetingType.description}</p>
                    )}
                    
                    <div className="flex items-center text-sm text-gray-500 mb-4">
                      <UserIcon className="w-4 h-4 mr-2" />
                      {meetingType.host.firstName} {meetingType.host.lastName}
                    </div>

                    {meetingType.price && meetingType.price > 0 && (
                      <div className="text-lg font-semibold text-green-600 mb-4">
                        ${meetingType.price}
                      </div>
                    )}

                    <Button className="w-full" variant="outline">
                      Select This Meeting Type
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            {meetingTypes.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500 text-lg">No meeting types are currently available.</p>
              </div>
            )}
          </div>
        )}

        {step === 'book-meeting' && selectedMeetingType && (
          <div>
            <div className="flex items-center mb-6">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setStep('select-meeting-type')}
                className="mr-4"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <div>
                <h2 className="text-2xl font-semibold text-gray-900">{selectedMeetingType.name}</h2>
                <p className="text-gray-600">with {selectedMeetingType.host.firstName} {selectedMeetingType.host.lastName}</p>
              </div>
            </div>

            <div className="grid gap-8 lg:grid-cols-2">
              {/* Meeting Details */}
              <Card>
                <CardHeader>
                  <CardTitle>Meeting Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center">
                    <ClockIcon className="w-5 h-5 text-gray-400 mr-3" />
                    <span>{formatDuration(selectedMeetingType.duration)}</span>
                  </div>
                  
                  <div className="flex items-center">
                    <UserIcon className="w-5 h-5 text-gray-400 mr-3" />
                    <span>{selectedMeetingType.host.firstName} {selectedMeetingType.host.lastName}</span>
                  </div>

                  {selectedMeetingType.locationType && (
                    <div className="flex items-center">
                      <MapPinIcon className="w-5 h-5 text-gray-400 mr-3" />
                      <span>{selectedMeetingType.locationType}</span>
                    </div>
                  )}

                  {selectedMeetingType.description && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Description</h4>
                      <p className="text-gray-600 text-sm">{selectedMeetingType.description}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Booking Form */}
              <Card>
                <CardHeader>
                  <CardTitle>Book Your Meeting</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4">
                    <div>
                      <Label htmlFor="attendeeName">Your Name *</Label>
                      <Input
                        id="attendeeName"
                        value={formData.attendeeName}
                        onChange={(e) => setFormData(prev => ({ ...prev, attendeeName: e.target.value }))}
                        placeholder="Enter your full name"
                      />
                    </div>

                    <div>
                      <Label htmlFor="attendeeEmail">Email Address *</Label>
                      <Input
                        id="attendeeEmail"
                        type="email"
                        value={formData.attendeeEmail}
                        onChange={(e) => setFormData(prev => ({ ...prev, attendeeEmail: e.target.value }))}
                        placeholder="Enter your email address"
                      />
                    </div>

                    <div>
                      <Label>
                        <Globe className="inline w-4 h-4 mr-1" />
                        Timezone *
                      </Label>
                      <div className="mt-1">
                        <TimezoneSelect
                          value={formData.timezone}
                          onChange={handleTimezoneChange}
                        />
                      </div>
                    </div>

                    {formData.timezone && (
                      <div>
                        <Label htmlFor="selectedDate">Select Date *</Label>
                        <Input
                          id="selectedDate"
                          type="date"
                          value={formData.selectedDate}
                          onChange={(e) => handleDateChange(e.target.value)}
                          min={new Date().toISOString().split('T')[0]}
                        />
                      </div>
                    )}

                    {formData.selectedDate && formData.timezone && (
                      <div>
                        <Label>Available Time Slots *</Label>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                          {availableSlots.length > 0 ? (
                            availableSlots.map((slot, index) => (
                              <Button
                                key={index}
                                variant={formData.selectedSlot?.startTime === slot.startTime ? "default" : "outline"}
                                className="justify-center text-sm px-3 py-2"
                                onClick={() => handleSlotSelect(slot)}
                              >
                                {slot.label}
                              </Button>
                            ))
                          ) : (
                            <div className="col-span-full text-center py-4 text-gray-500">
                              No available time slots for this date.
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div>
                      <Label htmlFor="description">Additional Notes</Label>
                      <Textarea
                        id="description"
                        value={formData.description}
                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Any additional information or special requests..."
                        rows={3}
                      />
                    </div>

                    <Button 
                      onClick={handleBooking} 
                      disabled={!formData.selectedSlot || !formData.attendeeName || !formData.attendeeEmail || bookingLoading}
                      className="w-full"
                    >
                      {bookingLoading ? 'Booking...' : 'Confirm Booking'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
