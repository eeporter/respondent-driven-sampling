import { useLocation, useNavigate } from 'react-router-dom';

import '@/styles/complete.css';

// Shown instead of the coupon-code page when the survey cannot hand out
// referrals. Respondents who don't qualify for the survey at all (declined
// consent or the "does not qualify" outro) see a wording of their own. The
// survey itself is still saved.
export default function IneligiblePage() {
	const navigate = useNavigate();
	const { state } = useLocation() as {
		state?: { doesNotQualify?: boolean } | null;
	};
	const doesNotQualify = state?.doesNotQualify === true;

	return (
		<div className="completed-survey-page">
			<div className="completed-survey-container">
				{doesNotQualify ? (
					<>
						<h2>Does not qualify for the survey</h2>
						<p>
							No Visa card or referral coupons are given for this
							survey.
						</p>
					</>
				) : (
					<h2>Ineligible for referral coupons</h2>
				)}
				<div className="qr-buttons">
					<button
						className="generate-btn"
						onClick={() => navigate('/apply-referral')}
					>
						Return to Home Page
					</button>
				</div>
			</div>
		</div>
	);
}
