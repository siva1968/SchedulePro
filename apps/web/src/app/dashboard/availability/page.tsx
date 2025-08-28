'use client';

import { useEffect, useState } from 'react';
import { useAvailabilityStore } from '@/stores/availability-store';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { formatDateInUserTimezone } from '@/lib/timezone';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import DashboardPageHeader from '@/components/DashboardPageHeader';
import DashboardPageContainer from '@/components/DashboardPageContainer';

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function AvailabilityPage() {
  const userTimezone = useUserTimezone();
  const {
    availability,
    isLoading,
    error,
    fetchAvailability,
    createAvailability,
    updateAvailability,
    deleteAvailability,
    createWeeklyAvailability,
  } = useAvailabilityStore();

  const [showWeeklyForm, setShowWeeklyForm] = useState(false);
  const [weeklySchedule, setWeeklySchedule] = useState(
    dayNames.map((_, index) => ({
      dayOfWeek: index,
      startTime: '09:00',
      endTime: '17:00',
      enabled: index >= 1 && index <= 5, // Monday to Friday by default
    }))
  );

  const [newAvailability, setNewAvailability] = useState({
    type: 'RECURRING',
    dayOfWeek: 1,
    startTime: '09:00',
    endTime: '17:00',
    specificDate: '',
    isBlocked: false,
    blockReason: '',
  });

  useEffect(() => {
    fetchAvailability();
  }, [fetchAvailability]);

  const handleCreateWeeklySchedule = async () => {
    try {
      const schedule = weeklySchedule
        .filter(day => day.enabled)
        .map(day => ({
          dayOfWeek: day.dayOfWeek,
          startTime: day.startTime,
          endTime: day.endTime,
        }));
      
      await createWeeklyAvailability(schedule);
      setShowWeeklyForm(false);
      fetchAvailability();
    } catch (error) {
      console.error('Failed to create weekly schedule:', error);
    }
  };

  const handleCreateAvailability = async () => {
    try {
      await createAvailability(newAvailability);
      setNewAvailability({
        type: 'RECURRING',
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '17:00',
        specificDate: '',
        isBlocked: false,
        blockReason: '',
      });
      fetchAvailability();
    } catch (error) {
      console.error('Failed to create availability:', error);
    }
  };

  const handleDeleteAvailability = async (id: string) => {
    try {
      await deleteAvailability(id);
    } catch (error) {
      console.error('Failed to delete availability:', error);
    }
  };

  const formatTime = (time: string) => {
    return new Date(`2000-01-01T${time}`).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const recurringAvailability = availability.filter(a => a.type === 'RECURRING');
  const dateSpecificAvailability = availability.filter(a => a.type === 'DATE_SPECIFIC');
  const blockedSlots = availability.filter(a => a.isBlocked);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <DashboardPageHeader 
        title="Availability Management" 
        description="Set your available hours and time slots"
      >
        <Button onClick={() => setShowWeeklyForm(true)}>
          Set Weekly Hours
        </Button>
      </DashboardPageHeader>
      <DashboardPageContainer>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      {/* Weekly Schedule Form */}
      {showWeeklyForm && (
        <Card className="p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Set Weekly Schedule</h3>
          <div className="space-y-4">
            {weeklySchedule.map((day, index) => (
              <div key={index} className="flex items-center space-x-4">
                <div className="w-24">
                  <input
                    type="checkbox"
                    id={`day-${index}`}
                    checked={day.enabled}
                    onChange={(e) => {
                      const newSchedule = [...weeklySchedule];
                      newSchedule[index].enabled = e.target.checked;
                      setWeeklySchedule(newSchedule);
                    }}
                    className="mr-2"
                  />
                  <label htmlFor={`day-${index}`} className="text-sm font-medium">
                    {dayNames[index]}
                  </label>
                </div>
                {day.enabled && (
                  <>
                    <Input
                      type="time"
                      value={day.startTime}
                      onChange={(e) => {
                        const newSchedule = [...weeklySchedule];
                        newSchedule[index].startTime = e.target.value;
                        setWeeklySchedule(newSchedule);
                      }}
                      className="w-32"
                    />
                    <span>to</span>
                    <Input
                      type="time"
                      value={day.endTime}
                      onChange={(e) => {
                        const newSchedule = [...weeklySchedule];
                        newSchedule[index].endTime = e.target.value;
                        setWeeklySchedule(newSchedule);
                      }}
                      className="w-32"
                    />
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="flex space-x-2 mt-6">
            <Button onClick={handleCreateWeeklySchedule}>
              Save Weekly Schedule
            </Button>
            <Button variant="outline" onClick={() => setShowWeeklyForm(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {/* Create New Availability */}
      <Card className="p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">Add Availability</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Type</label>
            <select
              className="w-full p-2 border rounded-md"
              value={newAvailability.type}
              onChange={(e) => setNewAvailability({ ...newAvailability, type: e.target.value })}
            >
              <option value="RECURRING">Recurring</option>
              <option value="DATE_SPECIFIC">Date Specific</option>
              <option value="BLOCKED">Blocked Time</option>
            </select>
          </div>
          {newAvailability.type === 'RECURRING' && (
            <div>
              <label className="block text-sm font-medium mb-2">Day of Week</label>
              <select
                className="w-full p-2 border rounded-md"
                value={newAvailability.dayOfWeek}
                onChange={(e) => setNewAvailability({ ...newAvailability, dayOfWeek: parseInt(e.target.value) })}
              >
                {dayNames.map((day, index) => (
                  <option key={index} value={index}>{day}</option>
                ))}
              </select>
            </div>
          )}
          {newAvailability.type === 'DATE_SPECIFIC' && (
            <div>
              <label className="block text-sm font-medium mb-2">Specific Date</label>
              <Input
                type="date"
                value={newAvailability.specificDate}
                onChange={(e) => setNewAvailability({ ...newAvailability, specificDate: e.target.value })}
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-2">Start Time</label>
            <Input
              type="time"
              value={newAvailability.startTime}
              onChange={(e) => setNewAvailability({ ...newAvailability, startTime: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">End Time</label>
            <Input
              type="time"
              value={newAvailability.endTime}
              onChange={(e) => setNewAvailability({ ...newAvailability, endTime: e.target.value })}
            />
          </div>
          {newAvailability.type === 'BLOCKED' && (
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-2">Block Reason</label>
              <Input
                type="text"
                placeholder="Enter reason for blocking this time"
                value={newAvailability.blockReason}
                onChange={(e) => setNewAvailability({ ...newAvailability, blockReason: e.target.value })}
              />
            </div>
          )}
        </div>
        <Button 
          onClick={handleCreateAvailability} 
          className="mt-4"
          disabled={newAvailability.type === 'BLOCKED' && !newAvailability.blockReason}
        >
          Add Availability
        </Button>
      </Card>

      {/* Current Availability */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recurring Availability */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Weekly Schedule</h3>
          {recurringAvailability.length === 0 ? (
            <p className="text-gray-500">No weekly schedule set</p>
          ) : (
            <div className="space-y-2">
              {dayNames.map((day, index) => {
                const dayAvailability = recurringAvailability.filter(a => a.dayOfWeek === index);
                return (
                  <div key={index} className="flex justify-between items-center py-2 border-b">
                    <span className="font-medium">{day}</span>
                    <div className="space-x-2">
                      {dayAvailability.length === 0 ? (
                        <span className="text-gray-400">Not available</span>
                      ) : (
                        dayAvailability.map((slot) => (
                          <div key={slot.id} className="inline-flex items-center space-x-2">
                            <span className="text-sm">
                              {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
                            </span>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleDeleteAvailability(slot.id)}
                              className="text-red-600 hover:text-red-700"
                            >
                              Remove
                            </Button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Date Specific & Blocked */}
        <div className="space-y-6">
          {/* Date Specific Availability */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Date-Specific Availability</h3>
            {dateSpecificAvailability.length === 0 ? (
              <p className="text-gray-500">No date-specific availability set</p>
            ) : (
              <div className="space-y-2">
                {dateSpecificAvailability.map((slot) => (
                  <div key={slot.id} className="flex justify-between items-center py-2 border-b">
                    <div>
                      <div className="font-medium">
                        {formatDateInUserTimezone(slot.specificDate!, userTimezone)}
                      </div>
                      <div className="text-sm text-gray-600">
                        {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
                      </div>
                    </div>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleDeleteAvailability(slot.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Blocked Times */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Blocked Times</h3>
            {blockedSlots.length === 0 ? (
              <p className="text-gray-500">No blocked times</p>
            ) : (
              <div className="space-y-2">
                {blockedSlots.map((slot) => (
                  <div key={slot.id} className="flex justify-between items-center py-2 border-b">
                    <div>
                      <div className="font-medium">
                        {slot.type === 'RECURRING' 
                          ? dayNames[slot.dayOfWeek!] 
                          : formatDateInUserTimezone(slot.specificDate!, userTimezone)
                        }
                      </div>
                      <div className="text-sm text-gray-600">
                        {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
                      </div>
                      {slot.blockReason && (
                        <div className="text-sm text-red-600">{slot.blockReason}</div>
                      )}
                    </div>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleDeleteAvailability(slot.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
      </DashboardPageContainer>
    </>
  );
}
