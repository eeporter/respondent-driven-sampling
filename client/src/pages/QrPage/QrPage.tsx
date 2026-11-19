import { useEffect, useRef } from 'react';

import { useApi } from '@/hooks';
import { useSurveyStore } from '@/stores';
import { QRCodeCanvas } from 'qrcode.react';
import { useNavigate } from 'react-router-dom';

import '@/styles/complete.css';

import { printQrCodePdf } from '@/utils/qrCodeUtils';

// Description: Displays referral QR codes and allows them to be printing

// Read aloud to the participant when handing out the referral coupons.
const COUPON_SCRIPT = [
	"I'M NOW GOING TO GIVE YOU THREE REFERRAL COUPONS. THESE ARE FOR YOU TO SHARE WITH OTHER YOUNG PEOPLE YOU KNOW PERSONALLY WHO ARE UNDER 25 AND CURRENTLY EXPERIENCING HOMELESSNESS SO THEY CAN ALSO PARTICIPATE IN THE SURVEY. PLEASE ONLY GIVE THEM TO PEOPLE YOU'VE TALKED TO OR SEEN IN THE LAST 3 MONTHS AND WHO YOU THINK WOULD BE WILLING TO COME TO A HUB SITE TO TAKE THE SURVEY.",
	'EACH COUPON CAN ONLY BE USED ONCE. PLEASE REMIND THE INDIVIDUALS TO BRING THE COUPON WITH THEM WHEN THEY COME TO A HUB SITE AND TO TAKE A PICTURE OF THE COUPON, WITH THE QR CODE CLEARLY VISIBLE, IN CASE IT GETS LOST.',
	'IF SOMEONE YOU REFER COMES TO A HUB SITE AND SUCCESSFULLY COMPLETES THE SURVEY, YOU MAY RECEIVE A $5 REFERRAL BONUS FOR EACH PERSON YOU REFER. THE REFERRAL BONUS WILL BE SENT TO YOU ELECTRONICALLY BY TEXT MESSAGE OR EMAIL.',
	"REMEMBER, THESE COUPONS ARE ONLY FOR YOUTH UNDER 25 WHO ARE CURRENTLY UNHOUSED. IF SOMEONE DOESN'T MEET THESE REQUIREMENTS, THEY MAY NOT BE ABLE TO TAKE THE SURVEY."
];

export default function QrPage() {
	const navigate = useNavigate();
	const { surveyData } = useSurveyStore();
	const childSurveyCodes = surveyData?.childSurveyCodes ?? [];
	const qrRefs = useRef<(HTMLDivElement | null)[]>([]);
	const { surveyService } = useApi();
	const objectId = surveyData?.objectId ?? null;

	// Reaching this page means the survey counts as submitted. The survey page
	// already saves it as completed before coming here; marking it again on
	// arrival makes sure that holds even if that save was lost or the flow
	// changes. Only isCompleted is sent so no answers can be overwritten.
	useEffect(() => {
		if (!objectId) return;
		surveyService
			.updateSurvey(objectId, { isCompleted: true })
			.catch(error =>
				console.error('Could not mark survey as completed:', error)
			);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [objectId]);

	// Print PDF with custom paper size (62mm width)
	const handlePrint = () => {
		printQrCodePdf(qrRefs.current, childSurveyCodes);
	};

	return (
		<div className="completed-survey-page">
			<div className="completed-survey-container">
				<h2>Coupon Codes</h2>
				<p>Provide these QR codes to referred individuals.</p>

				{childSurveyCodes.length > 0 && (
					<div className="coupon-read-aloud">
						<p>
							<strong>Interviewer:</strong> Read this out loud to
							the participant.
						</p>
						{COUPON_SCRIPT.map(paragraph => (
							<p key={paragraph.slice(0, 24)}>
								<strong>{paragraph}</strong>
							</p>
						))}
					</div>
				)}

				{/* Display QR Codes */}
				<div className="print-area">
					<div className="qr-code-container">
						{childSurveyCodes.length > 0 ? (
							childSurveyCodes.map(
								(code: string, index: number) => {
									const qrSurveyCode = code;
									return (
										<div
											key={index}
											className="qr-box"
											ref={el => {
												qrRefs.current[index] = el;
											}}
										>
											<QRCodeCanvas
												value={qrSurveyCode}
												size={120}
												level="M"
											/>
											<p className="qr-code-text">
												{index + 1}. Coupon Code: {code}
											</p>
										</div>
									);
								}
							)
						) : (
							<p>
								No coupon codes were issued for this survey. You
								can still return to the home page below.
							</p>
						)}
					</div>
				</div>

				<div className="qr-buttons">
					<button className="generate-btn" onClick={handlePrint}>
						Print Coupon Codes
					</button>
					<button
						className="generate-btn"
						onClick={() => navigate('/dashboard')}
					>
						Return to Home Page
					</button>
				</div>
			</div>
		</div>
	);
}
