import { Injectable } from '@nestjs/common';

export interface NotificationConfig {
  defaultTemplates: NotificationTemplateConfig[];
  defaultRules: NotificationRuleConfig[];
  emailSettings: EmailSettings;
  timingSettings: TimingSettings;
}

export interface NotificationTemplateConfig {
  type: string;
  subject: string;
  body: string;
  variables: string[];
  isActive: boolean;
}

export interface NotificationRuleConfig {
  id: string;
  type: string;
  trigger: string;
  timing: number;
  isActive: boolean;
  recipients: string[];
  priority: 'high' | 'medium' | 'low';
}

export interface EmailSettings {
  fromName: string;
  fromEmail: string;
  replyToEmail?: string;
  maxRetries: number;
  retryDelayMinutes: number;
}

export interface TimingSettings {
  defaultReminders: number[]; // Hours before event
  minAdvanceNotice: number; // Minutes
  maxAdvanceBooking: number; // Days
  businessHours: {
    start: string;
    end: string;
    timezone: string;
  };
}

@Injectable()
export class NotificationConfigService {
  private readonly config: NotificationConfig = {
    defaultTemplates: [
      {
        type: 'BOOKING_CONFIRMATION',
        subject: 'Booking Confirmed: {{meetingType}} with {{hostName}}',
        body: `
          Hi {{recipientName}},
          
          Your booking has been confirmed!
          
          📅 Meeting: {{meetingType}}
          🕐 Date & Time: {{startTime}} ({{timezone}})
          ⏱️ Duration: {{duration}} minutes
          👤 Host: {{hostName}}
          
          {{#if meetingUrl}}
          🔗 Join the meeting: {{meetingUrl}}
          {{/if}}
          
          {{#if description}}
          📝 Description: {{description}}
          {{/if}}
          
          {{#if location}}
          📍 Location: {{location}}
          {{/if}}
          
          Looking forward to meeting with you!
          
          Best regards,
          {{hostName}}
          
          ---
          Need to reschedule or cancel? Use this link: {{rescheduleUrl}}
        `,
        variables: [
          'meetingType', 'hostName', 'recipientName', 'startTime', 'timezone', 
          'duration', 'meetingUrl', 'description', 'location', 'rescheduleUrl'
        ],
        isActive: true,
      },
      {
        type: 'BOOKING_REMINDER_24H',
        subject: 'Reminder: {{meetingType}} tomorrow at {{startTime}}',
        body: `
          Hi {{recipientName}},
          
          This is a friendly reminder about your upcoming meeting tomorrow:
          
          📅 Meeting: {{meetingType}}
          🕐 Date & Time: {{startTime}} ({{timezone}})
          👤 Host: {{hostName}}
          
          {{#if meetingUrl}}
          🔗 Join the meeting: {{meetingUrl}}
          {{/if}}
          
          {{#if preparationNotes}}
          📋 Preparation notes: {{preparationNotes}}
          {{/if}}
          
          See you tomorrow!
          
          Best regards,
          {{hostName}}
          
          ---
          Need to reschedule? Reply to this email or use: {{rescheduleUrl}}
        `,
        variables: [
          'meetingType', 'hostName', 'recipientName', 'startTime', 'timezone',
          'meetingUrl', 'preparationNotes', 'rescheduleUrl'
        ],
        isActive: true,
      },
      {
        type: 'BOOKING_REMINDER_1H',
        subject: 'Starting soon: {{meetingType}} in 1 hour',
        body: `
          Hi {{recipientName}},
          
          Your meeting is starting in 1 hour:
          
          📅 {{meetingType}}
          🕐 {{startTime}} ({{timezone}})
          👤 {{hostName}}
          
          {{#if meetingUrl}}
          🔗 Join now: {{meetingUrl}}
          {{/if}}
          
          {{#if dialInNumber}}
          📞 Dial-in: {{dialInNumber}}
          {{/if}}
          
          We're looking forward to speaking with you!
          
          Best regards,
          {{hostName}}
        `,
        variables: [
          'meetingType', 'hostName', 'recipientName', 'startTime', 'timezone',
          'meetingUrl', 'dialInNumber'
        ],
        isActive: true,
      },
      {
        type: 'BOOKING_CANCELLED',
        subject: 'Booking Cancelled: {{meetingType}}',
        body: `
          Hi {{recipientName}},
          
          Your booking has been cancelled:
          
          📅 Meeting: {{meetingType}}
          🕐 Original Date & Time: {{startTime}} ({{timezone}})
          👤 Host: {{hostName}}
          
          {{#if cancellationReason}}
          📝 Reason: {{cancellationReason}}
          {{/if}}
          
          {{#if rescheduleOffered}}
          We'd be happy to reschedule when convenient for you. Please use this link to book a new time: {{bookingUrl}}
          {{/if}}
          
          We apologize for any inconvenience.
          
          Best regards,
          {{hostName}}
        `,
        variables: [
          'meetingType', 'hostName', 'recipientName', 'startTime', 'timezone',
          'cancellationReason', 'rescheduleOffered', 'bookingUrl'
        ],
        isActive: true,
      },
      {
        type: 'BOOKING_RESCHEDULED',
        subject: 'Booking Rescheduled: {{meetingType}}',
        body: `
          Hi {{recipientName}},
          
          Your booking has been rescheduled:
          
          📅 Meeting: {{meetingType}}
          🕐 New Date & Time: {{startTime}} ({{timezone}})
          👤 Host: {{hostName}}
          
          {{#if meetingUrl}}
          🔗 Join the meeting: {{meetingUrl}}
          {{/if}}
          
          {{#if rescheduleReason}}
          📝 Reason for reschedule: {{rescheduleReason}}
          {{/if}}
          
          Thank you for your flexibility!
          
          Best regards,
          {{hostName}}
          
          ---
          Need to make changes? Use this link: {{rescheduleUrl}}
        `,
        variables: [
          'meetingType', 'hostName', 'recipientName', 'startTime', 'timezone',
          'meetingUrl', 'rescheduleReason', 'rescheduleUrl'
        ],
        isActive: true,
      },
      {
        type: 'HOST_NOTIFICATION',
        subject: 'Upcoming Meeting: {{meetingType}} with {{attendeeName}}',
        body: `
          Hi {{hostName}},
          
          You have an upcoming meeting:
          
          📅 Meeting: {{meetingType}}
          🕐 Date & Time: {{startTime}} ({{timezone}})
          👤 Attendee: {{attendeeName}} ({{attendeeEmail}})
          
          {{#if meetingUrl}}
          🔗 Meeting URL: {{meetingUrl}}
          {{/if}}
          
          {{#if attendeeNotes}}
          📝 Attendee notes: {{attendeeNotes}}
          {{/if}}
          
          {{#if formResponses}}
          📋 Form responses: {{formResponses}}
          {{/if}}
          
          Have a great meeting!
          
          ---
          Manage this booking: {{manageUrl}}
        `,
        variables: [
          'meetingType', 'hostName', 'startTime', 'timezone', 'attendeeName',
          'attendeeEmail', 'meetingUrl', 'attendeeNotes', 'formResponses', 'manageUrl'
        ],
        isActive: true,
      },
      {
        type: 'FOLLOW_UP',
        subject: 'Thank you for the meeting: {{meetingType}}',
        body: `
          Hi {{recipientName}},
          
          Thank you for taking the time to meet with me today!
          
          📅 Meeting: {{meetingType}}
          🕐 Date: {{startTime}}
          
          {{#if followUpMessage}}
          {{followUpMessage}}
          {{/if}}
          
          {{#if nextSteps}}
          📝 Next steps:
          {{nextSteps}}
          {{/if}}
          
          {{#if attachments}}
          📎 Attached documents: {{attachments}}
          {{/if}}
          
          Feel free to reach out if you have any questions.
          
          Best regards,
          {{hostName}}
          
          ---
          Book another meeting: {{bookingUrl}}
        `,
        variables: [
          'meetingType', 'hostName', 'recipientName', 'startTime',
          'followUpMessage', 'nextSteps', 'attachments', 'bookingUrl'
        ],
        isActive: false, // Disabled by default
      },
      {
        type: 'NO_SHOW_REMINDER',
        subject: 'We missed you: {{meetingType}}',
        body: `
          Hi {{recipientName}},
          
          We noticed you weren't able to make it to your scheduled meeting:
          
          📅 Meeting: {{meetingType}}
          🕐 Date & Time: {{startTime}} ({{timezone}})
          
          No worries - life happens! 
          
          Would you like to reschedule? You can book a new time here: {{bookingUrl}}
          
          We look forward to connecting with you soon.
          
          Best regards,
          {{hostName}}
        `,
        variables: [
          'meetingType', 'hostName', 'recipientName', 'startTime', 'timezone', 'bookingUrl'
        ],
        isActive: true,
      },
    ],
    defaultRules: [
      {
        id: 'confirmation',
        type: 'BOOKING_CONFIRMATION',
        trigger: 'IMMEDIATELY',
        timing: 0,
        isActive: true,
        recipients: ['ATTENDEE', 'HOST'],
        priority: 'high',
      },
      {
        id: 'reminder-24h',
        type: 'BOOKING_REMINDER_24H',
        trigger: 'HOURS_BEFORE',
        timing: 24,
        isActive: true,
        recipients: ['ATTENDEE'],
        priority: 'medium',
      },
      {
        id: 'reminder-1h',
        type: 'BOOKING_REMINDER_1H',
        trigger: 'HOURS_BEFORE',
        timing: 1,
        isActive: true,
        recipients: ['ATTENDEE'],
        priority: 'high',
      },
      {
        id: 'host-reminder',
        type: 'HOST_NOTIFICATION',
        trigger: 'HOURS_BEFORE',
        timing: 2,
        isActive: true,
        recipients: ['HOST'],
        priority: 'medium',
      },
      {
        id: 'cancellation',
        type: 'BOOKING_CANCELLED',
        trigger: 'IMMEDIATELY',
        timing: 0,
        isActive: true,
        recipients: ['ATTENDEE', 'HOST'],
        priority: 'high',
      },
      {
        id: 'reschedule',
        type: 'BOOKING_RESCHEDULED',
        trigger: 'IMMEDIATELY',
        timing: 0,
        isActive: true,
        recipients: ['ATTENDEE', 'HOST'],
        priority: 'high',
      },
      {
        id: 'follow-up',
        type: 'FOLLOW_UP',
        trigger: 'HOURS_AFTER',
        timing: 24,
        isActive: false,
        recipients: ['ATTENDEE'],
        priority: 'low',
      },
      {
        id: 'no-show',
        type: 'NO_SHOW_REMINDER',
        trigger: 'HOURS_AFTER',
        timing: 2,
        isActive: true,
        recipients: ['ATTENDEE'],
        priority: 'low',
      },
    ],
    emailSettings: {
      fromName: 'SchedulePro',
      fromEmail: 'noreply@schedulepro.com',
      replyToEmail: 'support@schedulepro.com',
      maxRetries: 3,
      retryDelayMinutes: 5,
    },
    timingSettings: {
      defaultReminders: [24, 1], // 24 hours and 1 hour before
      minAdvanceNotice: 30, // 30 minutes minimum
      maxAdvanceBooking: 60, // 60 days maximum
      businessHours: {
        start: '09:00',
        end: '17:00',
        timezone: 'UTC',
      },
    },
  };

  /**
   * Get all notification templates
   */
  getTemplates(): NotificationTemplateConfig[] {
    return this.config.defaultTemplates;
  }

  /**
   * Get template by type
   */
  getTemplate(type: string): NotificationTemplateConfig | undefined {
    return this.config.defaultTemplates.find(template => template.type === type);
  }

  /**
   * Get all notification rules
   */
  getRules(): NotificationRuleConfig[] {
    return this.config.defaultRules;
  }

  /**
   * Get active notification rules
   */
  getActiveRules(): NotificationRuleConfig[] {
    return this.config.defaultRules.filter(rule => rule.isActive);
  }

  /**
   * Get rule by ID
   */
  getRule(id: string): NotificationRuleConfig | undefined {
    return this.config.defaultRules.find(rule => rule.id === id);
  }

  /**
   * Get email settings
   */
  getEmailSettings(): EmailSettings {
    return this.config.emailSettings;
  }

  /**
   * Get timing settings
   */
  getTimingSettings(): TimingSettings {
    return this.config.timingSettings;
  }

  /**
   * Get notification settings for a specific meeting type
   */
  getNotificationSettingsForMeetingType(
    meetingTypeId: string,
    customSettings?: any
  ): {
    templates: NotificationTemplateConfig[];
    rules: NotificationRuleConfig[];
    emailSettings: EmailSettings;
  } {
    // In a real implementation, this would merge custom settings with defaults
    return {
      templates: this.getTemplates(),
      rules: this.getActiveRules(),
      emailSettings: this.getEmailSettings(),
    };
  }

  /**
   * Get smart notification timing recommendations
   */
  getRecommendedTimings(
    meetingType: string,
    historicalData?: any
  ): { timing: number; confidence: number; reason: string }[] {
    // Smart recommendations based on meeting type and historical data
    const recommendations = [];

    // For consultations, suggest earlier reminders
    if (meetingType.toLowerCase().includes('consultation')) {
      recommendations.push({
        timing: 48,
        confidence: 0.8,
        reason: 'Consultations benefit from 48-hour advance reminders for preparation',
      });
    }

    // For short meetings, suggest closer reminders
    if (meetingType.toLowerCase().includes('quick') || meetingType.toLowerCase().includes('brief')) {
      recommendations.push({
        timing: 2,
        confidence: 0.9,
        reason: 'Short meetings need timely reminders to reduce no-shows',
      });
    }

    // For workshops, suggest multiple reminders
    if (meetingType.toLowerCase().includes('workshop') || meetingType.toLowerCase().includes('training')) {
      recommendations.push(
        {
          timing: 168, // 1 week
          confidence: 0.7,
          reason: 'Workshops require early planning notifications',
        },
        {
          timing: 24,
          confidence: 0.9,
          reason: 'Workshop day-before reminder with preparation materials',
        }
      );
    }

    // Default recommendations
    if (recommendations.length === 0) {
      recommendations.push(
        {
          timing: 24,
          confidence: 0.9,
          reason: 'Standard 24-hour reminder works well for most meetings',
        },
        {
          timing: 1,
          confidence: 0.8,
          reason: 'Short-term reminder reduces no-show rates',
        }
      );
    }

    return recommendations;
  }

  /**
   * Validate notification configuration
   */
  validateConfig(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate templates
    for (const template of this.config.defaultTemplates) {
      if (!template.subject || !template.body) {
        errors.push(`Template ${template.type} is missing subject or body`);
      }

      // Check for required variables
      const requiredVars = ['recipientName', 'hostName'];
      for (const reqVar of requiredVars) {
        if (!template.variables.includes(reqVar)) {
          errors.push(`Template ${template.type} is missing required variable: ${reqVar}`);
        }
      }
    }

    // Validate rules
    for (const rule of this.config.defaultRules) {
      const hasTemplate = this.config.defaultTemplates.some(t => t.type === rule.type);
      if (!hasTemplate) {
        errors.push(`Rule ${rule.id} references non-existent template: ${rule.type}`);
      }

      if (rule.timing < 0) {
        errors.push(`Rule ${rule.id} has invalid timing: ${rule.timing}`);
      }
    }

    // Validate email settings
    if (!this.config.emailSettings.fromEmail.includes('@')) {
      errors.push('Invalid from email address');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}
