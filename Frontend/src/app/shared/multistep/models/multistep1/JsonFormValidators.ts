export interface JsonFormValidators {
    min?: number;
    max?: number;
    required?: boolean;
    requiredTrue?: boolean;
    email?: boolean;
    minLength?: boolean;
    maxLength?: boolean;
    pattern?: string;
    nullValidator?: boolean;
  }