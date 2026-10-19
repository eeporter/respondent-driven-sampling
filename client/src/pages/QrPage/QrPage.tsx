import { useEffect, useRef } from 'react';

import { useApi } from '@/hooks';

import { useSurveyStore } from '@/stores';
import { QRCodeCanvas } from 'qrcode.react';
import { useNavigate } from 'react-router-dom';

import '@/styles/complete.css';

import { printQrCodePdf } from '@/utils/qrCodeUtils';

// Description: Displays referral QR codes and allows them to be printing

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
								No coupon codes were issued for this survey.
								You can still return to the home page below.
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
