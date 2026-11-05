/**
 * Whether a survey's answers allow it to hand out referral coupons.
 *
 * A respondent who declined consent, says they already took the survey this
 * year, or gave no location for both screening questions still gets a survey
 * record (so the attempt is counted), but their coupon codes must never be used
 * to start a referred survey.
 */
export function isReferralEligible(
	responses: Record<string, unknown> | null | undefined
): boolean {
	if (!responses) return true;
	if (responses.consent_given === 'No') return false;
	if (responses.deduplication === 'Yes') return false;
	// Declined or didn't know where they slept, both in the last 30 days and last
	// night: the survey's own complete trigger ends it, and it gets no coupons.
	const noLocation = (v: unknown) => v === 'Declined' || v === "Don't know";
	if (noLocation(responses.Q2) && noLocation(responses.Q3)) return false;
	return true;
}
