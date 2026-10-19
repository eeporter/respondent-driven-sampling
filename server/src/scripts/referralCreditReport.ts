#!/usr/bin/env tsx
/**
 * Spreadsheet (CSV) of every participant who earned referral credit, with their
 * initials, date of birth, survey location, email and phone (if given) and the
 * number of completed surveys taken with their referral coupons.
 *
 * Usage: npm run referral-report          (reads server/.env)
 *        npm run referral-report:test     (reads server/.env.test)
 *
 * The file is written to src/scripts/gift-cards/, which git ignores: it contains
 * participant information and must never be committed.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

import connectDB from '@/database';
import Location from '@/database/location/mongoose/location.model';
import Survey from '@/database/survey/mongoose/survey.model';

import {
	buildReferralCreditRows,
	ReferralLocation,
	ReferralSurvey,
	toCsv
} from './referralCredits';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(__dirname, 'gift-cards');

async function main() {
	await connectDB();
	try {
		const surveys = (await Survey.find({ deletedAt: null })
			.select({
				surveyCode: 1,
				parentSurveyCode: 1,
				childSurveyCodes: 1,
				responses: 1,
				isCompleted: 1,
				createdAt: 1,
				locationObjectId: 1
			})
			.lean()) as unknown as ReferralSurvey[];

		const locations = await Location.find({}).select({ hubName: 1, address: 1 }).lean();
		const locationsById = new Map<string, ReferralLocation>(
			locations.map(l => [String(l._id), { hubName: l.hubName, address: l.address }])
		);

		const rows = buildReferralCreditRows(surveys, locationsById);

		fs.mkdirSync(outputDir, { recursive: true });
		const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
		const outputPath = path.join(outputDir, `referral-credits-${stamp}.csv`);
		fs.writeFileSync(outputPath, toCsv(rows));

		const totalCredits = rows.reduce((sum, r) => sum + r.referralCredits, 0);
		console.log(`Database: ${process.env.MONGO_DB_NAME}`);
		console.log(`Surveys read: ${surveys.length}`);
		console.log(`Participants with referral credit: ${rows.length} (${totalCredits} credits)`);
		console.log(`Wrote ${outputPath}`);
		console.log('This file contains participant information. Do not commit or share it.');
	} finally {
		await mongoose.disconnect();
	}
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});
