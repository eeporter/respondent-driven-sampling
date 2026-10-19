import { z } from 'zod';

import { createUserSchema } from '@/database/user/zod/user.validator';

// OTP code validation
const otpCodeSchema = z
	.string()
	.length(6, 'OTP code must be 6 digits')
	.regex(/^\d{6}$/, 'OTP code must contain only digits');

// Public signup can only ask for these roles; admins are created or promoted
// by an existing admin, never by self-signup
export const SIGNUP_ROLES = ['VOLUNTEER', 'MANAGER'] as const;
const signupRoleSchema = z.enum(SIGNUP_ROLES, {
	message: 'You can sign up as a volunteer or manager only'
});

export const sendOtpSignupSchema = createUserSchema
	.extend({ role: signupRoleSchema })
	.strict();

export const sendOtpLoginSchema = createUserSchema
	.pick({
		phone: true,
		email: true
	})
	.partial({ email: true })
	.strict();

export const verifyOtpSignupSchema = createUserSchema
	.extend({
		role: signupRoleSchema,
		code: otpCodeSchema
	})
	.strict();

export const verifyOtpLoginSchema = createUserSchema
	.pick({
		phone: true
	})
	.extend({
		code: otpCodeSchema
	})
	.strict();
