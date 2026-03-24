/**
 * SignVerify Mobile – user.ts Types
 */

export interface User {
  id: string;
  phone_number: string;
  public_key?: string;
  is_verified: boolean;
  created_at: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user_id: string;
}

export interface OTPRequest {
  phone_number: string;
}

export interface OTPVerify {
  phone_number: string;
  code: string;
}
