import { isTestEnvironment } from '@/utils/environment';

import '@/styles/testBanner.css';

// Sits above every page on anything that is not production, so nobody records a
// real participant's survey on the test site by mistake.
export const TestBanner = () => {
	if (!isTestEnvironment()) return null;

	return (
		<div className="test-banner" role="status">
			<span className="test-banner-word">TEST</span> SITE — surveys
			entered here are practice only and are not part of the count.
		</div>
	);
};

export default TestBanner;
