/**
 * Shared coupon page layout for generateSeeds.ts and generateCoupons.ts.
 *
 * All participant-facing coupon text lives in YAML files under coupon-templates/,
 * selected with the COUPON_TEMPLATE env var (default: "king-county"), so each
 * deployment prints its own locations, dates and contact number.
 *
 * Any value containing "TODO" marks the template as a draft: pages are stamped
 * DRAFT so a test printout cannot be mistaken for a real coupon.
 *
 * A template can instead point at a designed PDF (`pdf:`) plus the boxes where
 * each seed's QR code goes (`qrBoxes:`); see couponPdf.ts.
 */
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { parse as parseYaml } from 'yaml';

/** Where a QR code goes on a PDF template page, in points from the page's top-left. */
export interface QrBox {
	/** 1-based page number within the template PDF. */
	page: number;
	x: number;
	y: number;
	width: number;
	height: number;
}

/** Shape of a YAML coupon template file (e.g. coupon-templates/king-county.yaml). */
export interface CouponTemplate {
	/** Designed coupon PDF, relative to the scripts directory. Replaces the text fields. */
	pdf?: string;
	/** QR code positions on the PDF; required with `pdf`. */
	qrBoxes?: QrBox[];
	title: string;
	/** Intro sentence; `highlight` is rendered bold between `before` and `after`. */
	intro: { before: string; highlight?: string; after?: string };
	/** Short lines shown under the intro (accessibility, pets, ...). */
	notes?: string[];
	locations: {
		name: string;
		address: string;
		/** Lines listed under "Interview Dates and Hours:". */
		schedule?: string[];
	}[];
	contact?: string;
	/** Logo image path, relative to the scripts directory. Omit for no logo. */
	logo?: string;
}

export interface LoadedCouponTemplate {
	name: string;
	template: CouponTemplate;
	/** Absolute logo path, or null if the template has no logo. */
	logoPath: string | null;
	/** Absolute path of the designed coupon PDF, or null for a text template. */
	pdfPath: string | null;
	/** Dotted paths of every value still containing "TODO". */
	placeholders: string[];
}

export const DEFAULT_COUPON_TEMPLATE = 'king-county';

const PAGE_MARGIN = 50;

/**
 * Parse and validate coupon template YAML.
 * @throws Error if required fields are missing or have the wrong type.
 */
export function parseCouponTemplate(
	content: string,
	templateName: string
): CouponTemplate {
	const parsed = parseYaml(content) as CouponTemplate | null;
	const problems: string[] = [];

	if (!parsed || typeof parsed !== 'object') {
		throw new Error(`Coupon template "${templateName}" is empty`);
	}

	if (parsed.pdf !== undefined) {
		validatePdfFields(parsed, problems);
	} else {
		validateTextFields(parsed, problems);
	}

	if (problems.length > 0) {
		throw new Error(
			`Coupon template "${templateName}" is missing or has invalid fields: ${problems.join(', ')}`
		);
	}

	return parsed;
}

function validatePdfFields(parsed: CouponTemplate, problems: string[]): void {
	if (typeof parsed.pdf !== 'string' || !parsed.pdf) {
		problems.push('pdf');
	}
	if (!Array.isArray(parsed.qrBoxes) || parsed.qrBoxes.length === 0) {
		problems.push('qrBoxes (at least one)');
		return;
	}
	parsed.qrBoxes.forEach((box, i) => {
		for (const key of ['page', 'x', 'y', 'width', 'height'] as const) {
			if (typeof box?.[key] !== 'number') {
				problems.push(`qrBoxes[${i}].${key}`);
			}
		}
	});
}

function validateTextFields(parsed: CouponTemplate, problems: string[]): void {
	if (typeof parsed.title !== 'string' || !parsed.title) {
		problems.push('title');
	}
	if (typeof parsed.intro?.before !== 'string') {
		problems.push('intro.before');
	}
	if (!Array.isArray(parsed.locations) || parsed.locations.length === 0) {
		problems.push('locations (at least one)');
	} else {
		parsed.locations.forEach((location, i) => {
			if (typeof location?.name !== 'string' || !location.name) {
				problems.push(`locations[${i}].name`);
			}
			if (typeof location?.address !== 'string' || !location.address) {
				problems.push(`locations[${i}].address`);
			}
			if (
				location?.schedule !== undefined &&
				!Array.isArray(location.schedule)
			) {
				problems.push(`locations[${i}].schedule (must be a list)`);
			}
		});
	}
	if (parsed.notes !== undefined && !Array.isArray(parsed.notes)) {
		problems.push('notes (must be a list)');
	}
}

/** List the dotted paths of every string value that still contains "TODO". */
export function findPlaceholders(value: unknown, prefix = ''): string[] {
	if (typeof value === 'string') {
		return /\bTODO\b/.test(value) ? [prefix] : [];
	}
	if (Array.isArray(value)) {
		return value.flatMap((item, i) =>
			findPlaceholders(item, `${prefix}[${i}]`)
		);
	}
	if (value && typeof value === 'object') {
		return Object.entries(value).flatMap(([key, item]) =>
			findPlaceholders(item, prefix ? `${prefix}.${key}` : key)
		);
	}
	return [];
}

/**
 * Load a coupon template by name from `<scriptsDir>/coupon-templates/`.
 * @param templateName - Template name without extension (e.g. "grant-county-wa").
 * @param scriptsDir - Directory containing coupon-templates/ and logo assets.
 * @throws Error if the template doesn't exist or fails validation.
 */
export function loadCouponTemplate(
	templateName: string,
	scriptsDir: string
): LoadedCouponTemplate {
	const templatesDir = path.join(scriptsDir, 'coupon-templates');
	const filePath = path.join(templatesDir, `${templateName}.yaml`);

	if (!fs.existsSync(filePath)) {
		const available = fs
			.readdirSync(templatesDir)
			.filter(f => f.endsWith('.yaml'))
			.map(f => f.replace('.yaml', ''));
		throw new Error(
			`Coupon template "${templateName}" not found at ${filePath}\n` +
				`Available templates: ${available.length > 0 ? available.join(', ') : '(none)'}`
		);
	}

	const template = parseCouponTemplate(
		fs.readFileSync(filePath, 'utf-8'),
		templateName
	);

	let pdfPath: string | null = null;
	if (template.pdf) {
		pdfPath = path.join(scriptsDir, template.pdf);
		if (!fs.existsSync(pdfPath)) {
			throw new Error(
				`Coupon template "${templateName}" PDF not found: ${pdfPath}`
			);
		}
	}

	let logoPath: string | null = null;
	if (template.logo) {
		logoPath = path.join(scriptsDir, template.logo);
		if (!fs.existsSync(logoPath)) {
			throw new Error(
				`Coupon template "${templateName}" logo not found: ${logoPath}`
			);
		}
	}

	return {
		name: templateName,
		template,
		logoPath,
		pdfPath,
		placeholders: findPlaceholders(template)
	};
}

/** Load the template named by COUPON_TEMPLATE and report it on the console. */
export function loadCouponTemplateFromEnv(
	scriptsDir: string
): LoadedCouponTemplate {
	// An empty COUPON_TEMPLATE= line falls back to the default too
	const templateName = process.env.COUPON_TEMPLATE;
	const loaded = loadCouponTemplate(
		templateName ? templateName : DEFAULT_COUPON_TEMPLATE,
		scriptsDir
	);

	console.log(`Coupon template: ${loaded.name}`);
	if (loaded.placeholders.length > 0) {
		console.warn(
			`⚠ Template "${loaded.name}" still has TODO values — pages will be stamped DRAFT:\n` +
				loaded.placeholders.map(p => `    - ${p}`).join('\n')
		);
	}

	return loaded;
}

/**
 * Draw one coupon page onto the current page of `doc`.
 * @param drawCodeBlock - Draws the QR code (or sticker placeholder) starting at
 *   `y` and returns the y position where the locations section should begin.
 * @throws Error if the content does not fit on a single page.
 */
export function drawCouponPage(
	doc: PDFKit.PDFDocument,
	loaded: LoadedCouponTemplate,
	drawCodeBlock: (y: number) => number
): void {
	const { template, logoPath } = loaded;
	const pageWidth = doc.page.width;
	const margin = PAGE_MARGIN;
	const contentWidth = pageWidth - margin * 2;

	let currentY = margin;

	// Logo
	if (logoPath) {
		const logoWidth = 60;
		doc.image(logoPath, (pageWidth - logoWidth) / 2, currentY, {
			fit: [logoWidth, logoWidth]
		});
		currentY += logoWidth + 10;
	}

	// Title
	doc.fontSize(18)
		.font('Helvetica-Bold')
		.text(template.title, margin, currentY, {
			align: 'center',
			width: contentWidth
		});

	currentY += 40;

	// Instructions
	const { before, highlight, after } = template.intro;
	doc.fontSize(12).font('Helvetica');
	if (highlight) {
		doc.text(before, margin, currentY, {
			align: 'left',
			width: contentWidth,
			continued: true
		})
			.font('Helvetica-Bold')
			.text(highlight, { continued: Boolean(after) })
			.font('Helvetica');
		if (after) {
			doc.text(after);
		}
	} else {
		doc.text(`${before}${after ?? ''}`, margin, currentY, {
			align: 'left',
			width: contentWidth
		});
	}

	currentY += 50;

	// Notes
	const notes = template.notes ?? [];
	if (notes.length > 0) {
		doc.fontSize(12).font('Helvetica');
		notes.forEach((note, i) => {
			if (i > 0) {
				currentY += 25;
			}
			doc.text(note, margin, currentY, {
				align: 'left',
				width: contentWidth
			});
		});
		currentY += 50;
	}

	// QR code or sticker placeholder
	currentY = drawCodeBlock(currentY);

	// Locations section
	doc.fontSize(12)
		.font('Helvetica-Bold')
		.text('Locations', margin, currentY, {
			align: 'left',
			width: contentWidth
		});

	currentY += 20;

	const indent = { align: 'left' as const, width: contentWidth - 10 };
	doc.fontSize(11).font('Helvetica');
	template.locations.forEach((location, i) => {
		if (i > 0) {
			currentY += 10;
		}
		doc.text(`• ${location.name}`, margin + 10, currentY, indent);
		currentY += 15;
		doc.text(`  ${location.address}`, margin + 10, currentY, indent);
		currentY += 15;

		if (location.schedule && location.schedule.length > 0) {
			currentY += 5;
			doc.text(
				'• Interview Dates and Hours:',
				margin + 10,
				currentY,
				indent
			);
			currentY += 15;
			for (const line of location.schedule) {
				doc.text(`  ${line}`, margin + 10, currentY, indent);
				currentY += 15;
			}
		}
	});

	currentY += 35;

	// Contact info
	if (template.contact) {
		doc.fontSize(10)
			.font('Helvetica')
			.text(template.contact, margin, currentY, {
				align: 'center',
				width: contentWidth
			});
		currentY += 15;
	}

	if (currentY > doc.page.height - margin) {
		throw new Error(
			`Coupon template "${loaded.name}" does not fit on one page — ` +
				'shorten the notes or list fewer locations'
		);
	}

	if (loaded.placeholders.length > 0) {
		drawDraftStamp(doc);
	}
}

/**
 * Render one page into a throwaway document to check the template fits.
 * @param codeBlockHeight - Height the caller's code block will take on the page.
 * @throws Error if the content does not fit on a single page.
 */
export function assertCouponFits(
	loaded: LoadedCouponTemplate,
	codeBlockHeight: number
): void {
	const doc = new PDFDocument({ size: 'LETTER', margin: PAGE_MARGIN });
	try {
		drawCouponPage(doc, loaded, y => y + codeBlockHeight);
	} finally {
		doc.end();
	}
}

/** Stamp a large diagonal DRAFT watermark across the current page. */
function drawDraftStamp(doc: PDFKit.PDFDocument): void {
	const { width, height } = doc.page;
	doc.save()
		.rotate(-35, { origin: [width / 2, height / 2] })
		.fillColor('#cc0000')
		.opacity(0.25)
		.fontSize(64)
		.font('Helvetica-Bold')
		.text('DRAFT', 0, height / 2 - 60, {
			width,
			align: 'center',
			lineBreak: false
		})
		.fontSize(20)
		.text('NOT FOR DISTRIBUTION', 0, height / 2 + 10, {
			width,
			align: 'center',
			lineBreak: false
		})
		.restore();
	doc.fillColor('black').opacity(1);
}
