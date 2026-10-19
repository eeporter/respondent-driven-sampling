import { Request } from 'express';
import { JwtPayload } from 'jsonwebtoken';

import { Ability } from '@/permissions/constants';

export interface AuthenticatedRequest extends Request {
	user?: {
		userObjectId: string;
		role: string;
		firstName: string;
		locationObjectId: string;
	};
	authorization?: Ability;
	// Set by the auth middleware from the verified token
	userObjectId?: string;
	userRole?: string;
}

export interface JWTPayload extends JwtPayload {
	userObjectId: string;
}

export interface OTPRequest {
	phone: string;
	// Removed email to simplify OTP flow based on phone number only
	email?: string;
}

export interface VerifyOTPRequest extends OTPRequest {
	code: string;
}

export interface SignupRequest extends VerifyOTPRequest {
	name: string;
	role: string;
}
