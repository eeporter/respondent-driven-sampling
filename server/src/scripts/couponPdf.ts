/**
 * Renders coupons from a designed PDF template (coupon-templates/*.yaml with `pdf:`).
 *
 * Every page of the template is copied once per coupon. For seeds, each page's
 * `qrBoxes` get that seed's QR code with the code printed underneath; blank
 * coupons leave the boxes empty for a sticker.
 */
import fs from 'fs';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import QRCode from 'qrcode';

import { LoadedCouponTemplate, QrBox } from './couponTemplate';

const BOX_PADDING = 8;
const CODE_FONT_SIZE = 9;
const CODE_GAP = 3;

/**
 * Check the template PDF opens and every QR box sits inside its page.
 * @throws Error describing the first problem found.
 */
export async function assertPdfTemplate(
	loaded: LoadedCouponTemplate
): Promise<void> {
	const template = await loadTemplatePdf(loaded);
	const pageCount = template.getPageCount();

	loaded.template.qrBoxes?.forEach((box, i) => {
		if (
			!Number.isInteger(box.page) ||
			box.page < 1 ||
			box.page > pageCount
		) {
			throw new Error(
				`Coupon template "${loaded.name}" qrBoxes[${i}] is on page ${box.page}, but the PDF has ${pageCount} page(s)`
			);
		}
		const { width, height } = template.getPage(box.page - 1).getSize();
		const inside =
			box.x >= 0 &&
			box.y >= 0 &&
			box.width > 0 &&
			box.height > 0 &&
			box.x + box.width <= width &&
			box.y + box.height <= height;
		if (!inside) {
			throw new Error(
				`Coupon template "${loaded.name}" qrBoxes[${i}] falls outside its ${width}x${height}pt page`
			);
		}
		if (qrSizeFor(box) < 36) {
			throw new Error(
				`Coupon template "${loaded.name}" qrBoxes[${i}] is too small for a scannable QR code`
			);
		}
	});
}

/**
 * Build one PDF containing a full copy of the template per coupon.
 * @param codes - One survey code per coupon, or null for a blank coupon.
 */
export async function renderPdfCoupons(
	loaded: LoadedCouponTemplate,
	codes: (string | null)[]
): Promise<Uint8Array> {
	const template = await loadTemplatePdf(loaded);
	const output = await PDFDocument.create();
	const font = await output.embedFont(StandardFonts.HelveticaBold);
	const pageIndices = template.getPageIndices();
	const boxes = loaded.template.qrBoxes ?? [];

	for (const code of codes) {
		const pages = await output.copyPages(template, pageIndices);
		pages.forEach(page => output.addPage(page));
		if (code === null) {
			continue;
		}

		const qrPng = await output.embedPng(
			await QRCode.toBuffer(code, {
				type: 'png',
				width: 600,
				margin: 1,
				errorCorrectionLevel: 'M'
			})
		);

		for (const box of boxes) {
			const page = pages[box.page - 1];
			const pageHeight = page.getHeight();
			const qrSize = qrSizeFor(box);
			const codeWidth = font.widthOfTextAtSize(code, CODE_FONT_SIZE);
			const blockHeight = qrSize + CODE_GAP + CODE_FONT_SIZE;

			// YAML boxes are measured from the top; pdf-lib draws from the bottom
			const blockTop =
				pageHeight - box.y - (box.height - blockHeight) / 2;
			page.drawImage(qrPng, {
				x: box.x + (box.width - qrSize) / 2,
				y: blockTop - qrSize,
				width: qrSize,
				height: qrSize
			});
			page.drawText(code, {
				x: box.x + (box.width - codeWidth) / 2,
				y: blockTop - blockHeight,
				size: CODE_FONT_SIZE,
				font,
				color: rgb(0, 0, 0)
			});
		}
	}

	return output.save();
}

/** Largest square QR that fits in the box above the code text. */
function qrSizeFor(box: QrBox): number {
	return Math.min(
		box.width - BOX_PADDING * 2,
		box.height - BOX_PADDING * 2 - CODE_GAP - CODE_FONT_SIZE
	);
}

async function loadTemplatePdf(
	loaded: LoadedCouponTemplate
): Promise<PDFDocument> {
	if (!loaded.pdfPath) {
		throw new Error(`Coupon template "${loaded.name}" has no pdf`);
	}
	try {
		return await PDFDocument.load(fs.readFileSync(loaded.pdfPath));
	} catch (error) {
		throw new Error(
			`Coupon template "${loaded.name}" PDF could not be opened: ${error instanceof Error ? error.message : error}`
		);
	}
}
