'use client';

import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { getSystemTimezone, getPopularTimezones, isValidTimezone, getTimezoneOffset } from '@/lib/timezone';

interface TimezoneSelectProps {
  value: string;
  onChange: (timezone: string) => void;
  className?: string;
  disabled?: boolean;
  label?: string;
  showCurrentTime?: boolean;
}

export default function TimezoneSelect({ 
  value, 
  onChange, 
  className = '', 
  disabled = false, 
  label = 'Timezone',
  showCurrentTime = true 
}: TimezoneSelectProps) {
  const [currentTime, setCurrentTime] = useState<string>('');
  const popularTimezones = getPopularTimezones();

  useEffect(() => {
    if (showCurrentTime && value) {
      const updateTime = () => {
        const now = new Date();
        const timeString = now.toLocaleString('en-US', {
          timeZone: value,
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });
        const offset = getTimezoneOffset(value);
        setCurrentTime(`${timeString} ${offset}`);
      };

      updateTime();
      const interval = setInterval(updateTime, 60000); // Update every minute

      return () => clearInterval(interval);
    }
  }, [value, showCurrentTime]);

  useEffect(() => {
    // Set system timezone as default if no value is provided
    if (!value) {
      onChange(getSystemTimezone());
    }
  }, [value, onChange]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedTimezone = e.target.value;
    if (isValidTimezone(selectedTimezone)) {
      onChange(selectedTimezone);
    }
  };

  return (
    <div className="space-y-2">
      <label htmlFor="timezone" className="block text-sm font-medium text-gray-700">
        <Clock className="inline h-4 w-4 mr-1" />
        {label}
      </label>
      
      <select
        id="timezone"
        value={value}
        onChange={handleChange}
        disabled={disabled}
        className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${className}`}
      >
        <option value="">Select timezone...</option>
        
        {/* System timezone option */}
        <option value={getSystemTimezone()}>
          🏠 System ({getSystemTimezone()})
        </option>
        
        <optgroup label="Popular Timezones">
          {popularTimezones.map((tz) => (
            <option key={tz.value} value={tz.value}>
              {tz.label}
            </option>
          ))}
        </optgroup>
      </select>
      
      {showCurrentTime && currentTime && (
        <div className="text-xs text-gray-600 flex items-center">
          <Clock className="h-3 w-3 mr-1" />
          Current time: {currentTime}
        </div>
      )}
    </div>
  );
}
