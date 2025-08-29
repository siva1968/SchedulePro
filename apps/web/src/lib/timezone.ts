// Timezone utility functions
export const getSystemTimezone = (): string => {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
};

export const isValidTimezone = (timezone: string): boolean => {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
};

export const getPopularTimezones = (): Array<{ value: string; label: string }> => {
  return [
    { value: 'America/New_York', label: 'Eastern Time (ET)' },
    { value: 'America/Chicago', label: 'Central Time (CT)' },
    { value: 'America/Denver', label: 'Mountain Time (MT)' },
    { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
    { value: 'America/Anchorage', label: 'Alaska Time (AKST)' },
    { value: 'Pacific/Honolulu', label: 'Hawaii Time (HST)' },
    { value: 'Europe/London', label: 'Greenwich Mean Time (GMT)' },
    { value: 'Europe/Paris', label: 'Central European Time (CET)' },
    { value: 'Europe/Berlin', label: 'Central European Time (CET)' },
    { value: 'Asia/Tokyo', label: 'Japan Standard Time (JST)' },
    { value: 'Asia/Shanghai', label: 'China Standard Time (CST)' },
    { value: 'Asia/Kolkata', label: 'India Standard Time (IST)' },
    { value: 'Australia/Sydney', label: 'Australian Eastern Time (AET)' },
    { value: 'UTC', label: 'Coordinated Universal Time (UTC)' },
  ];
};

export const formatTimeInTimezone = (date: Date, timezone: string): string => {
  return date.toLocaleString('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

export const convertToTimezone = (date: Date, timezone: string): Date => {
  // Get the time in the target timezone as a string
  const timeString = date.toLocaleString('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  
  // Create a new date from the string (this will be in local timezone)
  return new Date(timeString);
};

export const getTimezoneOffset = (timezone: string): string => {
  const date = new Date();
  const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
  const targetTime = new Date(utc + (0)); // Start with UTC
  
  const formatter = new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    timeZoneName: 'short'
  });
  
  const parts = formatter.formatToParts(date);
  const timeZoneName = parts.find(part => part.type === 'timeZoneName')?.value || '';
  
  return timeZoneName;
};

// Enhanced timezone-aware formatting functions
export const formatDateTimeInUserTimezone = (
  dateString: string | Date, 
  userTimezone?: string,
  options?: {
    includeTimezone?: boolean;
    dateStyle?: 'full' | 'long' | 'medium' | 'short';
    timeStyle?: 'full' | 'long' | 'medium' | 'short';
    hourCycle?: 'h12' | 'h23';
  }
): string => {
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
  const timezone = userTimezone || getSystemTimezone();
  
  // Create base format options
  let formatOptions: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
  };

  // If dateStyle or timeStyle are provided, use them (they can't be combined with other date/time properties)
  if (options?.dateStyle || options?.timeStyle) {
    if (options.dateStyle) {
      formatOptions.dateStyle = options.dateStyle;
    }
    if (options.timeStyle) {
      formatOptions.timeStyle = options.timeStyle;
    }
    if (options.hourCycle) {
      formatOptions.hourCycle = options.hourCycle;
    }
  } else {
    // Use detailed format options when dateStyle/timeStyle are not provided
    formatOptions = {
      ...formatOptions,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: options?.hourCycle !== 'h23',
    };
  }

  const formattedDate = date.toLocaleString('en-US', formatOptions);
  
  if (options?.includeTimezone) {
    const timezoneAbbr = getTimezoneOffset(timezone);
    return `${formattedDate} ${timezoneAbbr}`;
  }
  
  return formattedDate;
};

export const formatDateInUserTimezone = (
  dateString: string | Date,
  userTimezone?: string,
  style: 'full' | 'long' | 'medium' | 'short' = 'medium'
): string => {
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
  const timezone = userTimezone || getSystemTimezone();
  
  return date.toLocaleDateString('en-US', {
    timeZone: timezone,
    dateStyle: style,
  });
};

export const formatTimeInUserTimezone = (
  dateString: string | Date,
  userTimezone?: string,
  options?: {
    includeTimezone?: boolean;
    style?: 'full' | 'long' | 'medium' | 'short';
    hourCycle?: 'h12' | 'h23';
  }
): string => {
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
  const timezone = userTimezone || getSystemTimezone();
  
  const formatOptions: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: options?.hourCycle !== 'h23',
  };

  if (options?.style) {
    formatOptions.timeStyle = options.style;
  }

  const formattedTime = date.toLocaleTimeString('en-US', formatOptions);
  
  if (options?.includeTimezone) {
    const timezoneAbbr = getTimezoneOffset(timezone);
    return `${formattedTime} ${timezoneAbbr}`;
  }
  
  return formattedTime;
};

export const formatRelativeTimeInUserTimezone = (
  dateString: string | Date,
  userTimezone?: string
): string => {
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
  const timezone = userTimezone || getSystemTimezone();
  const now = new Date();
  
  // Convert both dates to the user's timezone for comparison
  const userDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
  const userNow = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  
  const diffInMinutes = Math.floor((userDate.getTime() - userNow.getTime()) / (1000 * 60));
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);
  
  if (Math.abs(diffInMinutes) < 60) {
    if (diffInMinutes > 0) {
      return `in ${diffInMinutes} minute${diffInMinutes !== 1 ? 's' : ''}`;
    } else {
      return `${Math.abs(diffInMinutes)} minute${Math.abs(diffInMinutes) !== 1 ? 's' : ''} ago`;
    }
  } else if (Math.abs(diffInHours) < 24) {
    if (diffInHours > 0) {
      return `in ${diffInHours} hour${diffInHours !== 1 ? 's' : ''}`;
    } else {
      return `${Math.abs(diffInHours)} hour${Math.abs(diffInHours) !== 1 ? 's' : ''} ago`;
    }
  } else {
    if (diffInDays > 0) {
      return `in ${diffInDays} day${diffInDays !== 1 ? 's' : ''}`;
    } else {
      return `${Math.abs(diffInDays)} day${Math.abs(diffInDays) !== 1 ? 's' : ''} ago`;
    }
  }
};

export const getTimeRangeInUserTimezone = (
  startDate: string | Date,
  endDate: string | Date,
  userTimezone?: string,
  options?: {
    includeTimezone?: boolean;
    sameDay?: boolean;
  }
): string => {
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate;
  const timezone = userTimezone || getSystemTimezone();
  
  const startFormatted = formatDateTimeInUserTimezone(start, timezone, {
    includeTimezone: options?.includeTimezone,
  });
  
  // Check if both dates are on the same day
  const sameDay = options?.sameDay || 
    start.toLocaleDateString('en-US', { timeZone: timezone }) === 
    end.toLocaleDateString('en-US', { timeZone: timezone });
  
  if (sameDay) {
    const endTimeFormatted = formatTimeInUserTimezone(end, timezone, {
      includeTimezone: options?.includeTimezone,
    });
    return `${startFormatted} - ${endTimeFormatted}`;
  } else {
    const endFormatted = formatDateTimeInUserTimezone(end, timezone, {
      includeTimezone: options?.includeTimezone,
    });
    return `${startFormatted} - ${endFormatted}`;
  }
};
