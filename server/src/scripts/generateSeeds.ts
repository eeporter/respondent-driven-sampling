#!/usr/bin/env tsx
/**
 * Script to generate N seeds for a given location, or for the agencies that hand them out
 * Usage: npm run generate-seeds -- <hubName|objectId> <count>
 * Usage: npm run generate-seeds -- --agency "<agency>" [--agency-location "<city>"] <count>
 * Usage: npm run generate-seeds -- --all-agencies <count>
 * Example: npm run generate-seeds -- "Main Hub" 10
 * Example: npm run generate-seeds -- 507f1f77bcf86cd799439011 10
 * Example: npm run generate-seeds -- --agency "RYSE" 10
 * Example: npm run generate-seeds -- --all-agencies 10   (10 per agency, one PDF each)
 *
 * Agency seeds go to the agency's survey site (seed-agencies.yaml), save the agency's
 * name and location on each seed, and print the agency at the top of each coupon.
 *
 * `generate-seeds` reads server/.env; `generate-seeds:test` reads server/.env.test.
 * Coupon text comes from coupon-templates/, chosen by COUPON_TEMPLATE (see couponTemplate.ts).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

import connectDB from '@/database';
import Location from '@/database/location/mongoose/location.model';
import Seed, { ISeed } from '@/database/seed/mongoose/seed.model';
import { generateUniqueSurveyCode } from '@/database/survey/survey.controller';

import { assertPdfTemplate, renderPdfCoupons } from './couponPdf';
import {
	assertCouponFits,
	drawCouponPage,
	loadCouponTemplateFromEnv,
	LoadedCouponTemplate
} from './couponTemplate';
import {
	describeSeedAgency,
	findSeedAgency,
	loadSeedAgencies,
	SeedAgency,
	seedCouponHeader
} from './seedAgencies';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Output path
const seedsOutputDir = path.join(__dirname, 'seeds');

// QR code size, and the page height taken by the QR code plus its coupon code line
const qrSize = 100;
const codeBlockHeight = qrSize + 15 + 50;

// ===== PDF Generation Helper Functions =====

function createOutputDirectory(): string {
	if (!fs.existsSync(seedsOutputDir)) {
		fs.mkdirSync(seedsOutputDir, { recursive: true });
	}
	return seedsOutputDir;
}

function generateTimestampFilename(
	batchName: string,
	outputDir: string
): string {
	const now = new Date();
	const timestamp = [
		now.getFullYear(),
		String(now.getMonth() + 1).padStart(2, '0'),
		String(now.getDate()).padStart(2, '0'),
		String(now.getHours()).padStart(2, '0'),
		String(now.getMinutes()).padStart(2, '0'),
		String(now.getSeconds()).padStart(2, '0')
	].join('');
	const sanitizedBatchName = batchName
		.replace(/[^a-z0-9]/gi, '-')
		.toLowerCase();
	const filename = `seeds-${sanitizedBatchName}-${timestamp}.pdf`;
	return path.join(outputDir, filename);
}

async function generateQRCodeBuffer(
	surveyCode: string,
	qrSize: number
): Promise<Buffer> {
	// Encode only the coupon code (no URL) so QR codes work across any deployment
	const qrDataUrl = await QRCode.toDataURL(surveyCode, {
		width: qrSize,
		margin: 1,
		errorCorrectionLevel: 'M'
	});
	return Buffer.from(qrDataUrl.split(',')[1], 'base64');
}

async function addQRCodePage(
	doc: PDFKit.PDFDocument,
	surveyCode: string,
	couponTemplate: LoadedCouponTemplate,
	isFirstPage: boolean,
	header?: string
): Promise<void> {
	if (!isFirstPage) {
		doc.addPage();
	}
	if (header) {
		doc.fontSize(11)
			.font('Helvetica-Bold')
			.text(header, 20, 14, {
				align: 'center',
				width: doc.page.width - 40,
				lineBreak: false
			});
	}

	const pageWidth = doc.page.width;
	const margin = 50;
	const contentWidth = pageWidth - margin * 2;

	const qrBuffer = await generateQRCodeBuffer(surveyCode, qrSize);

	drawCouponPage(doc, couponTemplate, currentY => {
		// QR Code and Coupon Code
		doc.image(qrBuffer, (pageWidth - qrSize) / 2, currentY, {
			width: qrSize,
			height: qrSize
		});

		currentY += qrSize + 15;

		doc.fontSize(16)
			.font('Helvetica-Bold')
			.text(`Coupon Code: ${surveyCode}`, margin, currentY, {
				align: 'center',
				width: contentWidth
			});

		return currentY + 50;
	});
}

async function generatePDF(
	seeds: ISeed[],
	batchName: string,
	couponTemplate: LoadedCouponTemplate,
	header?: string
): Promise<void> {
	const outputDir = createOutputDirectory();
	const filepath = generateTimestampFilename(batchName, outputDir);

	if (couponTemplate.pdfPath) {
		const codes = seeds.map(seed => seed.surveyCode);
		fs.writeFileSync(
			filepath,
			await renderPdfCoupons(
				couponTemplate,
				codes,
				codes.map(() => header ?? null)
			)
		);
		console.log(`\n✓ PDF generated: ${filepath}`);
		console.log(
			`  Contains ${seeds.length} coupon(s) from template "${couponTemplate.name}"`
		);
		return;
	}

	// Create PDF document
	const doc = new PDFDocument({
		size: 'LETTER',
		margin: 50
	});

	const stream = fs.createWriteStream(filepath);
	doc.pipe(stream);

	// Generate one page per seed
	for (let i = 0; i < seeds.length; i++) {
		await addQRCodePage(
			doc,
			seeds[i].surveyCode,
			couponTemplate,
			i === 0,
			header
		);
	}

	doc.end();

	// Wait for stream to finish
	await new Promise<void>((resolve, reject) => {
		stream.on('finish', () => resolve());
		stream.on('error', reject);
	});

	console.log(`\n✓ PDF generated: ${filepath}`);
	console.log(`  Contains ${seeds.length} QR code(s), one per page`);
}

// ===== Seed Generation Helper Functions =====

function isValidObjectId(identifier: string): boolean {
	return (
		mongoose.Types.ObjectId.isValid(identifier) &&
		/^[0-9a-fA-F]{24}$/.test(identifier)
	);
}

async function findLocationByIdentifier(locationIdentifier: string) {
	const isObjectId = isValidObjectId(locationIdentifier);

	let location;
	if (isObjectId) {
		console.log(
			`Looking up location with ObjectId: "${locationIdentifier}"...`
		);
		location = await Location.findById(locationIdentifier);
	} else {
		console.log(
			`Looking up location with hubName: "${locationIdentifier}"...`
		);
		location = await Location.findOne({ hubName: locationIdentifier });
	}

	if (!location) {
		const idType = isObjectId ? 'ObjectId' : 'hubName';
		throw new Error(
			`Location with ${idType} "${locationIdentifier}" not found`
		);
	}

	console.log(`Found location: ${location.hubName} (${location._id}) ✓\n`);
	return location;
}

async function createSeed(
	surveyCode: string,
	locationId: mongoose.Types.ObjectId,
	index: number,
	total: number,
	agency?: SeedAgency
): Promise<ISeed> {
	try {
		const seed = await Seed.create({
			surveyCode,
			locationObjectId: locationId,
			isFallback: false,
			...(agency && {
				agencyName: agency.name,
				...(agency.location && { agencyLocation: agency.location })
			})
		});

		console.log(
			`  [${index + 1}/${total}] Created seed: ${seed.surveyCode} (${seed._id})`
		);
		return seed;
	} catch (error) {
		console.error(
			`  [${index + 1}/${total}] Failed to create seed:`,
			error
		);
		throw error;
	}
}

async function generateSeedsForLocation(
	location: { _id: mongoose.Types.ObjectId; hubName: string },
	count: number,
	agency?: SeedAgency
): Promise<ISeed[]> {
	console.log(`Generating ${count} seed(s)...\n`);
	const createdSeeds: ISeed[] = [];

	for (let i = 0; i < count; i++) {
		const surveyCode = await generateUniqueSurveyCode();
		const seed = await createSeed(
			surveyCode,
			location._id,
			i,
			count,
			agency
		);
		createdSeeds.push(seed);
	}

	return createdSeeds;
}

function printSeedsSummary(seeds: ISeed[], batchName: string): void {
	console.log(
		`\n✓ Successfully generated ${seeds.length} seed(s) for ${batchName}`
	);
	console.log('\nGenerated Survey Codes:');
	seeds.forEach((seed, index) => {
		console.log(`  ${index + 1}. ${seed.surveyCode}`);
	});
}

/** What to make seeds for: a survey site, or one or more agencies. */
type SeedTarget =
	| { kind: 'location'; identifier: string }
	| { kind: 'agencies'; agencies: SeedAgency[] };

async function generateSeeds(target: SeedTarget, count: number): Promise<void> {
	try {
		// Check the coupon template before creating any seeds, so a bad template
		// cannot leave seeds in the database without a printable PDF.
		const couponTemplate = loadCouponTemplateFromEnv(__dirname);
		if (couponTemplate.pdfPath) {
			await assertPdfTemplate(couponTemplate);
		} else {
			assertCouponFits(couponTemplate, codeBlockHeight);
		}

		console.log('Connecting to database...');
		await connectDB();
		console.log(`Connected to database "${process.env.MONGO_DB_NAME}" ✓\n`);

		if (target.kind === 'location') {
			const location = await findLocationByIdentifier(target.identifier);
			const createdSeeds = await generateSeedsForLocation(
				location,
				count
			);

			printSeedsSummary(createdSeeds, `location "${location.hubName}"`);

			console.log('\n📄 Generating PDF with QR codes...');
			await generatePDF(createdSeeds, location.hubName, couponTemplate);
			return;
		}

		// Look up every agency's site first, so a typo stops the run before any seeds exist
		const batches = [];
		for (const agency of target.agencies) {
			batches.push({
				agency,
				location: await findLocationByIdentifier(agency.site)
			});
		}
		for (const { agency, location } of batches) {
			console.log(`\n== ${describeSeedAgency(agency)} ==`);
			const createdSeeds = await generateSeedsForLocation(
				location,
				count,
				agency
			);
			printSeedsSummary(
				createdSeeds,
				`${describeSeedAgency(agency)}, survey site "${location.hubName}"`
			);
			await generatePDF(
				createdSeeds,
				describeSeedAgency(agency),
				couponTemplate,
				seedCouponHeader(agency)
			);
		}
	} catch (error) {
		console.error(
			'\n✗ Error:',
			error instanceof Error ? error.message : error
		);
		process.exit(1);
	} finally {
		await mongoose.connection.close();
		console.log('\nDatabase connection closed.');
		process.exit(0);
	}
}

const USAGE = [
	'Usage: npm run generate-seeds -- <hubName|objectId> <count>',
	'       npm run generate-seeds -- --agency "<agency>" [--agency-location "<city>"] <count>',
	'       npm run generate-seeds -- --all-agencies <count>',
	'Example: npm run generate-seeds -- "Main Hub" 10',
	'Example: npm run generate-seeds -- --agency "RYSE" 10'
].join('\n');

function fail(message: string): never {
	console.error(`Error: ${message}\n\n${USAGE}`);
	process.exit(1);
}

/** Read the command line into what to seed and how many. */
function parseArgs(args: string[]): { target: SeedTarget; count: number } {
	const flags = new Map<string, string | true>();
	const positional: string[] = [];
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === '--all-agencies') {
			flags.set(arg, true);
		} else if (arg === '--agency' || arg === '--agency-location') {
			const value = args[++i];
			if (!value) fail(`${arg} needs a value`);
			flags.set(arg, value);
		} else if (arg.startsWith('--')) {
			fail(`unknown option ${arg}`);
		} else {
			positional.push(arg);
		}
	}

	const countStr = positional.pop();
	const count = parseInt(countStr ?? '', 10);
	if (isNaN(count) || count <= 0) fail('count must be a positive number');

	const agencyName = flags.get('--agency');
	const agencyLocation = flags.get('--agency-location');
	if (flags.has('--all-agencies') || typeof agencyName === 'string') {
		if (positional.length > 0) {
			fail('give either a survey site or agency options, not both');
		}
		const agencies = loadSeedAgencies(__dirname);
		if (flags.has('--all-agencies')) {
			if (agencyName) fail('use --agency or --all-agencies, not both');
			return { target: { kind: 'agencies', agencies }, count };
		}
		const agency = findSeedAgency(
			agencies,
			agencyName as string,
			typeof agencyLocation === 'string' ? agencyLocation : undefined
		);
		return { target: { kind: 'agencies', agencies: [agency] }, count };
	}
	if (agencyLocation) fail('--agency-location goes with --agency');
	if (positional.length !== 1) fail('give one survey site and a count');
	return { target: { kind: 'location', identifier: positional[0] }, count };
}

let parsed: { target: SeedTarget; count: number };
try {
	parsed = parseArgs(process.argv.slice(2));
} catch (error) {
	fail(error instanceof Error ? error.message : String(error));
}

// Run the script
generateSeeds(parsed.target, parsed.count);
