import { useNavigate } from 'react-router-dom';

import '@/styles/complete.css';

// Shown instead of the coupon-code page when the survey cannot hand out
// referrals (consent declined, or already took the survey this year). The
// survey itself is still saved.
export default function IneligiblePage() {
	const navigate = useNavigate();

	return (
		<div className="completed-survey-page">
			<div className="completed-survey-container">
				<h2>Ineligible for referral coupons</h2>
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
