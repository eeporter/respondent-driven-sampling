import { NextFunction, Response } from 'express';

import Survey from '@/database/survey/mongoose/survey.model';
import User from '@/database/user/mongoose/user.model';
import { ApprovalStatus } from '@/database/utils/constants';
import defineAbilitiesForUser from '@/permissions/abilityBuilder';
import { DEFAULT_TIMEZONE } from '@/permissions/utils';
import { AuthenticatedRequest } from '@/types/auth';
import { verifyAuthToken } from '@/utils/authTokenHandler';

// Middleware for verifying token signature and storing token info in response
// If this call passes to the next handler, it means the user is atleast a volunteer
// and has been approved by an admin.
export async function auth(
	req: AuthenticatedRequest,
	res: Response,
	next: NextFunction
): Promise<void> {
	const authHeader = req.headers['authorization'];

	if (!authHeader) {
		res.status(401).json({ message: 'Access denied. No token provided' });
		return;
	}

	const parts = authHeader.split(' ');
	const token = parts.length === 2 ? parts[1] : authHeader;

	if (!token) {
		res.status(401).json({ message: 'Access denied. No token provided' });
		return;
	}

	try {
		const decodedAuthToken = verifyAuthToken(token);

		// Get user account from database
		const user = await User.findById(decodedAuthToken.userObjectId).select(
			'+deletedAt'
		);

		// Deleted accounts are treated as missing so removing a user revokes access
		if (!user || user.deletedAt) {
			// This case means that the user has a valid JWT signed by our server but
			// the account it is linked to does not exist in our database.
			// 401 so the client logs the user out.
			res.status(401).json({
				message:
					'User account not found. Please contact Administration.'
			});
			return;
		}

		// Check if user is approved
		if (user.approvalStatus !== ApprovalStatus.APPROVED) {
			res.status(403).json({
				message:
					'User account not approved yet. Please contact Administration.'
			});
			return;
		}

		// Derive latest location objectId from user's latest survey
		// This is for read/update permissions for surveys, where users can only read/update surveys created at their own location
		const latestSurvey = await Survey.findOne({
			createdByUserObjectId: decodedAuthToken.userObjectId
		}).sort({ updatedAt: -1 });
		// If user has no associated surveys, use the user's profile location
		const latestLocationObjectId =
			latestSurvey?.locationObjectId ?? user.locationObjectId;

		// eslint-disable-next-line require-atomic-updates
		req.userObjectId = decodedAuthToken.userObjectId;
		// eslint-disable-next-line require-atomic-updates
		req.userRole = user.role;
		// Add role authorization to the request
		// eslint-disable-next-line require-atomic-updates
		req.authorization = defineAbilitiesForUser(
			user.role,
			decodedAuthToken.userObjectId,
			latestLocationObjectId.toString(),
			user.permissions.map(permission => ({
				action: permission.action,
				subject: permission.subject,
				conditions: permission.conditions
			})),
			DEFAULT_TIMEZONE
		);
		if (!req.authorization) {
			res.sendStatus(403);
			return;
		}

		next();
	} catch (err: any) {
		res.status(401).json({ message: `Invalid Token: ${err.name}` });
		return;
	}
}
