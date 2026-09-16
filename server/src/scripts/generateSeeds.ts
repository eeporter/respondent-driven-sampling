#!/usr/bin/env tsx
/**
 * Script to generate N seeds for a given location
 * Usage: npm run generate-seeds -- <hubName|objectId> <count>
 * Example: npm run generate-seeds -- "Main Hub" 10
 * Example: npm run generate-seeds -- 507f1f77bcf86cd799439011 10
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
	locationName: string,
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
	const sanitizedLocationName = locationName
		.replace(/[^a-z0-9]/gi, '-')
		.toLowerCase();
	const filename = `seeds-${sanitizedLocationName}-${timestamp}.pdf`;
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
	isFirstPage: boolean
): Promise<void> {
	if (!isFirstPage) {
		doc.addPage();
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
	locationName: string,
	couponTemplate: LoadedCouponTemplate
): Promise<void> {
	const outputDir = createOutputDirectory();
	const filepath = generateTimestampFilename(locationName, outputDir);

	if (couponTemplate.pdfPath) {
		const codes = seeds.map(seed => seed.surveyCode);
		fs.writeFileSync(
			filepath,
			await renderPdfCoupons(couponTemplate, codes)
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
		await addQRCodePage(doc, seeds[i].surveyCode, couponTemplate, i === 0);
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
	total: number
): Promise<ISeed> {
	try {
		const seed = await Seed.create({
			surveyCode,
			locationObjectId: locationId,
			isFallback: false
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
	count: number
): Promise<ISeed[]> {
	console.log(`Generating ${count} seed(s)...\n`);
	const createdSeeds: ISeed[] = [];

	for (let i = 0; i < count; i++) {
		const surveyCode = await generateUniqueSurveyCode();
		const seed = await createSeed(surveyCode, location._id, i, count);
		createdSeeds.push(seed);
	}

	return createdSeeds;
}

function printSeedsSummary(seeds: ISeed[], locationName: string): void {
	console.log(
		`\n✓ Successfully generated ${seeds.length} seed(s) for location "${locationName}"`
	);
	console.log('\nGenerated Survey Codes:');
	seeds.forEach((seed, index) => {
		console.log(`  ${index + 1}. ${seed.surveyCode}`);
	});
}

async function generateSeeds(
	locationIdentifier: string,
	count: number
): Promise<void> {
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

		const location = await findLocationByIdentifier(locationIdentifier);
		const createdSeeds = await generateSeedsForLocation(location, count);

		printSeedsSummary(createdSeeds, location.hubName);

		console.log('\n📄 Generating PDF with QR codes...');
		await generatePDF(createdSeeds, location.hubName, couponTemplate);
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

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length !== 2) {
	console.error(
		'Usage: npm run generate-seeds -- <hubName|objectId> <count>'
	);
	console.error('Example: npm run generate-seeds -- "Main Hub" 10');
	console.error(
		'Example: npm run generate-seeds -- 507f1f77bcf86cd799439011 10'
	);
	process.exit(1);
}

const [locationIdentifier, countStr] = args;
const count = parseInt(countStr, 10);

if (isNaN(count) || count <= 0) {
	console.error('Error: count must be a positive number');
	process.exit(1);
}

// Run the script
generateSeeds(locationIdentifier, count);
