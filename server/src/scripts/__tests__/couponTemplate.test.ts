import path from 'path';
import PDFDocument from 'pdfkit';

import {
	assertCouponFits,
	drawCouponPage,
	findPlaceholders,
	loadCouponTemplate,
	parseCouponTemplate
} from '../couponTemplate';

const scriptsDir = path.join(process.cwd(), 'src/scripts');

describe('parseCouponTemplate', () => {
	const valid = `
title: 'Study'
intro:
  before: 'Bring this coupon'
locations:
  - name: 'Site'
    address: '1 Main St'
`;

	it('accepts a minimal template', () => {
		const template = parseCouponTemplate(valid, 'minimal');
		expect(template.title).toBe('Study');
		expect(template.locations).toHaveLength(1);
	});

	it('lists every missing required field', () => {
		expect(() =>
			parseCouponTemplate(
				`intro: {}\nlocations:\n  - name: 'Site'\n`,
				'bad'
			)
		).toThrow(/title, intro\.before, locations\[0\]\.address/);
	});

	it('rejects a template with no locations', () => {
		expect(() =>
			parseCouponTemplate(
				`title: 'Study'\nintro:\n  before: 'x'\nlocations: []\n`,
				'empty'
			)
		).toThrow(/locations \(at least one\)/);
	});

	it('rejects an empty file', () => {
		expect(() => parseCouponTemplate('', 'blank')).toThrow(/is empty/);
	});
});

describe('findPlaceholders', () => {
	it('returns dotted paths of TODO values only', () => {
		expect(
			findPlaceholders({
				title: 'Done',
				notes: ['fine', 'TODO: confirm'],
				locations: [{ schedule: ['TODO dates'] }],
				contact: 'no todos here'
			})
		).toEqual(['notes[1]', 'locations[0].schedule[0]']);
	});
});

describe('bundled templates', () => {
	it('king-county has no placeholders and fits on a page', () => {
		const loaded = loadCouponTemplate('king-county', scriptsDir);
		expect(loaded.placeholders).toEqual([]);
		expect(loaded.logoPath).not.toBeNull();
		expect(() => assertCouponFits(loaded, 165)).not.toThrow();
	});

	it('grant-county-wa uses the designed PDF with a box on each page', async () => {
		const { assertPdfTemplate } = await import('../couponPdf');
		const loaded = loadCouponTemplate('grant-county-wa', scriptsDir);
		expect(loaded.pdfPath).not.toBeNull();
		expect(loaded.template.qrBoxes?.map(box => box.page)).toEqual([1, 2]);
		await expect(assertPdfTemplate(loaded)).resolves.toBeUndefined();
	});

	it('names the available templates when one is missing', () => {
		expect(() => loadCouponTemplate('nope', scriptsDir)).toThrow(
			/Available templates: .*grant-county-wa.*king-county/
		);
	});
});

describe('drawCouponPage', () => {
	it('throws when the content overflows one page', () => {
		const loaded = loadCouponTemplate('king-county', scriptsDir);
		const crowded = {
			...loaded,
			template: {
				...loaded.template,
				locations: Array.from({ length: 12 }, (_, i) => ({
					name: `Site ${i}`,
					address: `${i} Main St`,
					schedule: ['Mon - Fri', '10am to 3pm']
				}))
			}
		};
		const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
		expect(() => drawCouponPage(doc, crowded, y => y + 165)).toThrow(
			/does not fit on one page/
		);
		doc.end();
	});
});

describe('PDF templates', () => {
	const writeTemplate = async (dir: string, yaml: string) => {
		const fs = await import('fs');
		const { PDFDocument: PdfLib } = await import('pdf-lib');
		fs.mkdirSync(path.join(dir, 'coupon-templates'), { recursive: true });
		const pdf = await PdfLib.create();
		pdf.addPage([612, 792]);
		pdf.addPage([612, 792]);
		fs.writeFileSync(
			path.join(dir, 'coupon-templates', 'designed.pdf'),
			await pdf.save()
		);
		fs.writeFileSync(
			path.join(dir, 'coupon-templates', 'designed.yaml'),
			yaml
		);
	};
	const tmpDir = async () => {
		const fs = await import('fs');
		const os = await import('os');
		return fs.mkdtempSync(path.join(os.tmpdir(), 'coupon-'));
	};
	const boxes = `qrBoxes:
  - { page: 1, x: 60, y: 560, width: 130, height: 130 }
  - { page: 2, x: 60, y: 560, width: 130, height: 130 }
`;

	it('does not require the text fields', () => {
		const template = parseCouponTemplate(
			`pdf: 'coupon-templates/designed.pdf'\n${boxes}`,
			'designed'
		);
		expect(template.qrBoxes).toHaveLength(2);
	});

	it('requires qrBoxes with numeric positions', () => {
		expect(() =>
			parseCouponTemplate(
				`pdf: 'x.pdf'\nqrBoxes:\n  - { page: 1, x: '10' }\n`,
				'bad'
			)
		).toThrow(/qrBoxes\[0\]\.x, qrBoxes\[0\]\.y/);
	});

	it('copies every template page per coupon', async () => {
		const { assertPdfTemplate, renderPdfCoupons } = await import(
			'../couponPdf'
		);
		const { PDFDocument: PdfLib } = await import('pdf-lib');
		const dir = await tmpDir();
		await writeTemplate(
			dir,
			`pdf: 'coupon-templates/designed.pdf'\n${boxes}`
		);
		const loaded = loadCouponTemplate('designed', dir);

		await expect(assertPdfTemplate(loaded)).resolves.toBeUndefined();
		const seeded = await PdfLib.load(
			await renderPdfCoupons(loaded, ['ABCD1234', 'EFGH5678'])
		);
		expect(seeded.getPageCount()).toBe(4);
		const blank = await PdfLib.load(
			await renderPdfCoupons(loaded, [null, null, null])
		);
		expect(blank.getPageCount()).toBe(6);
	});

	it('rejects boxes off the page or on a missing page', async () => {
		const { assertPdfTemplate } = await import('../couponPdf');
		const dir = await tmpDir();

		await writeTemplate(
			dir,
			`pdf: 'coupon-templates/designed.pdf'\nqrBoxes:\n  - { page: 3, x: 60, y: 560, width: 130, height: 130 }\n`
		);
		await expect(
			assertPdfTemplate(loadCouponTemplate('designed', dir))
		).rejects.toThrow(/page 3, but the PDF has 2 page/);

		await writeTemplate(
			dir,
			`pdf: 'coupon-templates/designed.pdf'\nqrBoxes:\n  - { page: 1, x: 560, y: 560, width: 130, height: 130 }\n`
		);
		await expect(
			assertPdfTemplate(loadCouponTemplate('designed', dir))
		).rejects.toThrow(/falls outside/);
	});
});
