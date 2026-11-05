// Mirrors server/src/database/survey/referralEligibility.ts. A respondent who
// declined consent, or who says they already took the survey this year, keeps
// their survey record but must not be given referral coupons.
export function isReferralEligible(
	responses: Record<string, unknown> | null | undefined
): boolean {
	if (!responses) return true;
	if (responses.consent_given === 'No') return false;
	if (responses.deduplication === 'Yes') return false;
	return true;
}
