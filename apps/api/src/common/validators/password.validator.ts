import { 
  registerDecorator, 
  ValidationOptions, 
  ValidatorConstraint, 
  ValidatorConstraintInterface,
  ValidationArguments 
} from 'class-validator';

@ValidatorConstraint({ async: false })
export class IsStrongPasswordConstraint implements ValidatorConstraintInterface {
  validate(password: string, args: ValidationArguments) {
    if (!password || typeof password !== 'string') {
      return false;
    }

    // Minimum 8 characters, maximum 128 characters
    if (password.length < 8 || password.length > 128) {
      return false;
    }

    // Must contain at least one lowercase letter
    if (!/[a-z]/.test(password)) {
      return false;
    }

    // Must contain at least one uppercase letter
    if (!/[A-Z]/.test(password)) {
      return false;
    }

    // Must contain at least one number
    if (!/\d/.test(password)) {
      return false;
    }

    // Must contain at least one special character
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password)) {
      return false;
    }

    // Check for common weak passwords
    const weakPasswords = [
      'password', 'password123', '123456789', 'qwerty123',
      'admin123', 'letmein123', 'welcome123', 'password1',
      '12345678', 'administrator', 'Password123'
    ];
    
    if (weakPasswords.some(weak => password.toLowerCase().includes(weak.toLowerCase()))) {
      return false;
    }

    // Check for sequential characters (123, abc, etc.)
    const hasSequential = /(?:abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz|123|234|345|456|567|678|789)/i.test(password);
    if (hasSequential) {
      return false;
    }

    // Check for repeated characters (aaa, 111, etc.)
    const hasRepeated = /(.)\1{2,}/.test(password);
    if (hasRepeated) {
      return false;
    }

    return true;
  }

  defaultMessage(args: ValidationArguments) {
    return 'Password must be 8-128 characters long and contain at least one lowercase letter, one uppercase letter, one number, and one special character. It cannot contain common weak patterns or sequential/repeated characters.';
  }
}

export function IsStrongPassword(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsStrongPasswordConstraint,
    });
  };
}

/**
 * Password strength checker utility
 */
export class PasswordStrengthChecker {
  static checkStrength(password: string): {
    score: number;
    feedback: string[];
    isValid: boolean;
  } {
    const feedback: string[] = [];
    let score = 0;

    if (!password) {
      return { score: 0, feedback: ['Password is required'], isValid: false };
    }

    // Length check
    if (password.length < 8) {
      feedback.push('Password must be at least 8 characters long');
    } else if (password.length >= 12) {
      score += 2;
    } else {
      score += 1;
    }

    // Character type checks
    if (!/[a-z]/.test(password)) {
      feedback.push('Add lowercase letters');
    } else {
      score += 1;
    }

    if (!/[A-Z]/.test(password)) {
      feedback.push('Add uppercase letters');
    } else {
      score += 1;
    }

    if (!/\d/.test(password)) {
      feedback.push('Add numbers');
    } else {
      score += 1;
    }

    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password)) {
      feedback.push('Add special characters');
    } else {
      score += 2;
    }

    // Complexity bonus
    const uniqueChars = new Set(password).size;
    if (uniqueChars / password.length > 0.7) {
      score += 1;
    }

    // Penalty for common patterns
    if (/(.)\1{2,}/.test(password)) {
      feedback.push('Avoid repeated characters');
      score -= 1;
    }

    if (/(?:123|abc|qwe|asd|zxc)/i.test(password)) {
      feedback.push('Avoid common patterns');
      score -= 1;
    }

    const isValid = score >= 5 && feedback.length === 0;
    
    if (feedback.length === 0 && score >= 7) {
      feedback.push('Strong password!');
    } else if (feedback.length === 0 && score >= 5) {
      feedback.push('Good password');
    }

    return {
      score: Math.max(0, Math.min(10, score)),
      feedback,
      isValid
    };
  }
}
