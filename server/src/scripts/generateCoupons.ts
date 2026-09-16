#!/usr/bin/env tsx
/**
 * Script to generate a blank PDF template for survey referral coupons.
 * This script does not connect to the database or generate real seeds.
 * It creates a PDF with one or more pages, each containing a placeholder for a QR code.
 *
 * Usage:
 * 1. Make sure you are in the `server` directory.
 * 2. Run: npm run generate-coupons -- [how-many]
 *    Example: npm run generate-coupons -- 10  (generates a PDF with 10 coupons)
 *    Example: npm run generate-coupons      (generates a PDF with 1 coupon)
 *
 * Coupon text comes from coupon-templates/, chosen by COUPON_TEMPLATE (see couponTemplate.ts).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';

import { assertPdfTemplate, renderPdfCoupons } from './couponPdf';
import {
	drawCouponPage,
	loadCouponTemplateFromEnv,
	LoadedCouponTemplate
} from './couponTemplate';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Output path
const couponsOutputDir = path.join(__dirname, 'coupons');

// ===== PDF Generation Helper Functions =====

function createOutputDirectory(): string {
	if (!fs.existsSync(couponsOutputDir)) {
		fs.mkdirSync(couponsOutputDir, { recursive: true });
	}
	return couponsOutputDir;
}

function generateTimestampFilename(outputDir: string, count: number): string {
	const now = new Date();
	const timestamp = [
		now.getFullYear(),
		String(now.getMonth() + 1).padStart(2, '0'),
		String(now.getDate()).padStart(2, '0'),
		String(now.getHours()).padStart(2, '0'),
		String(now.getMinutes()).padStart(2, '0'),
		String(now.getSeconds()).padStart(2, '0')
	].join('');
	const filename = `coupons-${count}-${timestamp}.pdf`;
	return path.join(outputDir, filename);
}

function addTemplatePage(
	doc: PDFKit.PDFDocument,
	couponTemplate: LoadedCouponTemplate
): void {
	const pageWidth = doc.page.width;

	drawCouponPage(doc, couponTemplate, currentY => {
		// --- QR Code Placeholder ---
		const qrSize = 150;
		const qrX = (pageWidth - qrSize) / 2;

		doc.lineWidth(1)
			.rect(qrX, currentY, qrSize, qrSize)
			.dash(5, { space: 5 })
			.stroke();
		doc.undash();

		doc.fontSize(10)
			.font('Helvetica-Oblique')
			.text(
				'Place QR Code Sticker Here',
				qrX,
				currentY + qrSize / 2 - 5,
				{
					width: qrSize,
					align: 'center'
				}
			);

		return currentY + qrSize + 15;
	});
}

async function generateCoupons(): Promise<void> {
	try {
		const args = process.argv.slice(2);
		const count = args.length > 0 ? parseInt(args[0], 10) : 1;

		if (isNaN(count) || count < 1) {
			throw new Error(
				'Invalid number provided. Please provide a positive integer for the number of coupons.'
			);
		}

		const couponTemplate = loadCouponTemplateFromEnv(__dirname);

		console.log(`📄 Generating a PDF with ${count} blank coupon(s)...`);

		const outputDir = createOutputDirectory();
		const filepath = generateTimestampFilename(outputDir, count);

		if (couponTemplate.pdfPath) {
			await assertPdfTemplate(couponTemplate);
			const blanks = Array.from({ length: count }, () => null);
			fs.writeFileSync(
				filepath,
				await renderPdfCoupons(couponTemplate, blanks)
			);
			console.log(`\n✓ PDF generated: ${filepath}`);
			return;
		}

		const doc = new PDFDocument({
			size: 'LETTER',
			margin: 50,
			autoFirstPage: false // We will add pages manually
		});

		const stream = fs.createWriteStream(filepath);
		doc.pipe(stream);

		for (let i = 0; i < count; i++) {
			doc.addPage();
			addTemplatePage(doc, couponTemplate);
		}

		doc.end();

		await new Promise<void>((resolve, reject) => {
			stream.on('finish', () => resolve());
			stream.on('error', reject);
		});

		console.log(`\n✓ PDF generated: ${filepath}`);
	} catch (error) {
		console.error(
			'\n✗ Error:',
			error instanceof Error ? error.message : error
		);
		process.exit(1);
	}
}

// Run the script
generateCoupons();
