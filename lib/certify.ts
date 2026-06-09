import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const CERT_TEXT_DEFAULT = 'I hereby certify that this photo is of true likeness and complete copy of the original';
const CERT_TEXT_IDENTITY = 'I hereby certify that this photo is of true likeness and complete copy of the original and the bearer of the document has signed in my presence';

const CERT_INFO_LINES = [
  'Ran MA',
  'Director',
  'Capella Capital Limited',
  'SFC CE No. BBS460',
];

const STAMP_HEIGHT = 130;
const STAMP_PADDING = 20;

function formatCertDate(date: Date): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `Date: ${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

const IDENTITY_DOC_TYPES = new Set([
  'passport_front',
  'passport_signature',
  'id_card',
  'personnel_passport_front',
  'personnel_passport_signature',
  'personnel_id_card',
]);

export function isIdentityDocType(docType: string): boolean {
  return IDENTITY_DOC_TYPES.has(docType);
}

function getAssetsDir(): string {
  return path.join(process.cwd(), 'assets');
}

async function loadSignature(doc: PDFDocument): Promise<PDFImage | null> {
  const signaturePath = path.join(getAssetsDir(), 'maran_signature.png');
  if (!fs.existsSync(signaturePath)) return null;
  try {
    return await doc.embedPng(fs.readFileSync(signaturePath));
  } catch {
    console.warn('[certify] Failed to load signature image, skipping');
    return null;
  }
}

/**
 * Generate a certified true copy for a SINGLE source file.
 * Each page of the original is placed on a new, taller canvas
 * so the certification stamp never overlaps original content.
 */
export async function generateCertifiedPdf(
  storedPath: string,
  mimeType: string,
  certDate: Date,
  documentType?: string
): Promise<Buffer> {
  if (!fs.existsSync(storedPath)) {
    throw new Error('Source file not found on disk');
  }

  const outputPdf = await PDFDocument.create();
  const font = await outputPdf.embedFont(StandardFonts.TimesRoman);
  const fontBold = await outputPdf.embedFont(StandardFonts.TimesRomanBold);
  const fontItalic = await outputPdf.embedFont(StandardFonts.TimesRomanItalic);
  const signatureImage = await loadSignature(outputPdf);

  const buffer = fs.readFileSync(storedPath);

  if (mimeType === 'application/pdf') {
    let loaded = false;
    // Try direct pdf-lib embed first (fastest, preserves vectors)
    try {
      const srcPdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
      for (const idx of srcPdf.getPageIndices()) {
        const srcPage = srcPdf.getPage(idx);
        const { width: srcW, height: srcH } = srcPage.getSize();

        const newHeight = srcH + STAMP_HEIGHT + STAMP_PADDING;
        const newPage = outputPdf.addPage([srcW, newHeight]);

        const embedded = await outputPdf.embedPage(srcPage);
        newPage.drawPage(embedded, {
          x: 0,
          y: STAMP_HEIGHT + STAMP_PADDING,
          width: srcW,
          height: srcH,
        });
      }
      loaded = true;
    } catch (err) {
      console.warn('[certify] pdf-lib failed, falling back to image render:', err instanceof Error ? err.message : err);
    }

    // Fallback: render PDF pages to images via pdftoppm (poppler-utils)
    if (!loaded) {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'certify-'));
      try {
        execSync(`pdftoppm -png -r 200 "${storedPath}" "${path.join(tmpDir, 'page')}"`, { timeout: 30000 });
        const pngFiles = fs.readdirSync(tmpDir).filter(f => f.endsWith('.png')).sort();
        for (const pngFile of pngFiles) {
          const pngBuf = fs.readFileSync(path.join(tmpDir, pngFile));
          const img = await outputPdf.embedPng(pngBuf);
          addImagePage(outputPdf, img);
        }
        if (pngFiles.length === 0) {
          throw new Error('pdftoppm produced no output');
        }
      } catch (renderErr) {
        throw new Error(`PDF could not be processed: ${renderErr instanceof Error ? renderErr.message : String(renderErr)}`);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  } else if (mimeType === 'image/png' || mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
    const img = mimeType === 'image/png'
      ? await outputPdf.embedPng(buffer)
      : await outputPdf.embedJpg(buffer);
    addImagePage(outputPdf, img);
  } else {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }

  if (outputPdf.getPageCount() === 0) {
    throw new Error('No pages could be generated from the source file');
  }

  const dateText = formatCertDate(certDate);
  const certText = documentType && isIdentityDocType(documentType) ? CERT_TEXT_IDENTITY : CERT_TEXT_DEFAULT;
  for (const page of outputPdf.getPages()) {
    addCertificationStamp(page, { font, fontBold, fontItalic, signatureImage, dateText, certText });
  }

  return Buffer.from(await outputPdf.save());
}

function addImagePage(doc: PDFDocument, img: PDFImage) {
  const A4_W = 595;
  const margin = 40;
  const maxImgW = A4_W - margin * 2;

  // Scale image to fit A4 width
  const imgAspect = img.width / img.height;
  let drawW = maxImgW;
  let drawH = drawW / imgAspect;

  // Total page height = margin + image + padding + stamp + margin
  const pageHeight = margin + drawH + STAMP_PADDING + STAMP_HEIGHT + margin;
  const page = doc.addPage([A4_W, pageHeight]);

  page.drawImage(img, {
    x: (A4_W - drawW) / 2,
    y: STAMP_HEIGHT + STAMP_PADDING + margin,
    width: drawW,
    height: drawH,
  });
}

function addCertificationStamp(
  page: PDFPage,
  opts: {
    font: PDFFont;
    fontBold: PDFFont;
    fontItalic: PDFFont;
    signatureImage: PDFImage | null;
    dateText: string;
    certText: string;
  }
) {
  const { width } = page.getSize();
  const { font, fontBold, fontItalic, signatureImage, dateText, certText } = opts;

  const stampBottom = 15;
  const stampTop = stampBottom + STAMP_HEIGHT;

  // Separator line between original content and stamp
  page.drawLine({
    start: { x: 40, y: stampTop },
    end: { x: width - 40, y: stampTop },
    thickness: 0.5,
    color: rgb(0.4, 0.4, 0.4),
  });

  // Certification text (italic, may wrap for longer identity text)
  const margin = 40;
  const maxTextWidth = width - margin * 2;
  const certTextSize = 8.5;
  const textWidth = fontItalic.widthOfTextAtSize(certText, certTextSize);

  if (textWidth <= maxTextWidth) {
    page.drawText(certText, {
      x: (width - textWidth) / 2,
      y: stampTop - 18,
      size: certTextSize,
      font: fontItalic,
      color: rgb(0, 0, 0),
    });
  } else {
    // Word-wrap into two lines
    const words = certText.split(' ');
    let line1 = '';
    let line2 = '';
    for (const word of words) {
      const test = line1 ? `${line1} ${word}` : word;
      if (fontItalic.widthOfTextAtSize(test, certTextSize) <= maxTextWidth) {
        line1 = test;
      } else {
        line2 += (line2 ? ' ' : '') + word;
      }
    }
    const w1 = fontItalic.widthOfTextAtSize(line1, certTextSize);
    const w2 = fontItalic.widthOfTextAtSize(line2, certTextSize);
    page.drawText(line1, { x: (width - w1) / 2, y: stampTop - 15, size: certTextSize, font: fontItalic, color: rgb(0, 0, 0) });
    page.drawText(line2, { x: (width - w2) / 2, y: stampTop - 27, size: certTextSize, font: fontItalic, color: rgb(0, 0, 0) });
  }

  // Signature image (left side)
  if (signatureImage) {
    const maxSigW = 100;
    const maxSigH = 65;
    const sigAspect = signatureImage.width / signatureImage.height;
    let sigW = maxSigW;
    let sigH = sigW / sigAspect;
    if (sigH > maxSigH) {
      sigH = maxSigH;
      sigW = sigH * sigAspect;
    }
    page.drawImage(signatureImage, {
      x: width / 2 - 140,
      y: stampBottom + 10,
      width: sigW,
      height: sigH,
    });
  }

  // Info text block (right side)
  const infoX = width / 2 + 10;
  const infoStartY = stampTop - 40;
  const lineHeight = 14;
  const allLines = [...CERT_INFO_LINES, dateText];

  for (let i = 0; i < allLines.length; i++) {
    page.drawText(allLines[i], {
      x: infoX,
      y: infoStartY - i * lineHeight,
      size: 10,
      font: i === 0 ? fontBold : font,
      color: rgb(0, 0, 0),
    });
  }
}
