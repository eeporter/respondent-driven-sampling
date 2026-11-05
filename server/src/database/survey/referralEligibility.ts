/**
 * Whether a survey's answers allow it to hand out referral coupons.
 *
 * A respondent who declined consent, or who says they already took the survey
 * this year, still gets a survey record (so the attempt is counted), but their
 * coupon codes must never be used to start a referred survey.
 */
export function isReferralEligible(
	responses: Record<string, unknown> | null | undefined
): boolean {
	if (!responses) return true;
	if (responses.consent_given === 'No') return false;
	if (responses.deduplication === 'Yes') return false;
	return true;
}
