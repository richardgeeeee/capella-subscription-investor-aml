import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

const CERT_TEXT = 'I hereby certify that this photo is of true likeness and complete copy of the original';

const CERT_INFO_LINES = [
  'Ran MA',
  'Director',
  'Capella Capital Limited',
  'SFC CE No. BBS460',
];

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

export function isCertifiableDocType(docType: string): boolean {
  return !IDENTITY_DOC_TYPES.has(docType);
}

interface SourceFile {
  storedPath: string;
  mimeType: string;
}

function getAssetsDir(): string {
  return path.join(
    process.env.DATABASE_PATH ? path.dirname(process.env.DATABASE_PATH) : './data',
    'assets'
  );
}

export async function generateCertifiedPdf(
  sourceFiles: SourceFile[],
  certDate: Date
): Promise<Buffer> {
  const outputPdf = await PDFDocument.create();

  const font = await outputPdf.embedFont(StandardFonts.TimesRoman);
  const fontBold = await outputPdf.embedFont(StandardFonts.TimesRomanBold);
  const fontItalic = await outputPdf.embedFont(StandardFonts.TimesRomanItalic);

  const signaturePath = path.join(getAssetsDir(), 'signature.png');
  let signatureImage: PDFImage | null = null;
  if (fs.existsSync(signaturePath)) {
    try {
      const sigBytes = fs.readFileSync(signaturePath);
      signatureImage = await outputPdf.embedPng(sigBytes);
    } catch {
      console.warn('[certify] Failed to load signature image, skipping');
    }
  }

  for (const source of sourceFiles) {
    if (!fs.existsSync(source.storedPath)) continue;
    const buffer = fs.readFileSync(source.storedPath);

    if (source.mimeType === 'application/pdf') {
      try {
        const srcPdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
        const pages = await outputPdf.copyPages(srcPdf, srcPdf.getPageIndices());
        for (const page of pages) {
          outputPdf.addPage(page);
        }
      } catch (err) {
        console.warn(`[certify] Failed to load PDF ${source.storedPath}:`, err);
      }
    } else if (source.mimeType === 'image/png') {
      try {
        const img = await outputPdf.embedPng(buffer);
        addImagePage(outputPdf, img);
      } catch (err) {
        console.warn(`[certify] Failed to embed PNG:`, err);
      }
    } else if (source.mimeType === 'image/jpeg' || source.mimeType === 'image/jpg') {
      try {
        const img = await outputPdf.embedJpg(buffer);
        addImagePage(outputPdf, img);
      } catch (err) {
        console.warn(`[certify] Failed to embed JPEG:`, err);
      }
    }
  }

  if (outputPdf.getPageCount() === 0) {
    throw new Error('No pages could be generated from the source files');
  }

  const dateText = formatCertDate(certDate);
  for (const page of outputPdf.getPages()) {
    addCertificationStamp(page, { font, fontBold, fontItalic, signatureImage, dateText });
  }

  return Buffer.from(await outputPdf.save());
}

function addImagePage(doc: PDFDocument, img: PDFImage) {
  const page = doc.addPage([595, 842]); // A4
  const { width, height } = page.getSize();
  const margin = 40;
  const stampReserve = 150;
  const maxW = width - margin * 2;
  const maxH = height - margin - stampReserve;

  const imgAspect = img.width / img.height;
  let drawW = maxW;
  let drawH = drawW / imgAspect;
  if (drawH > maxH) {
    drawH = maxH;
    drawW = drawH * imgAspect;
  }

  page.drawImage(img, {
    x: (width - drawW) / 2,
    y: height - margin - drawH,
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
  }
) {
  const { width } = page.getSize();
  const { font, fontBold, fontItalic, signatureImage, dateText } = opts;

  const stampBottom = 25;
  const stampHeight = 120;
  const stampTop = stampBottom + stampHeight;

  // White background for readability
  page.drawRectangle({
    x: 30,
    y: stampBottom,
    width: width - 60,
    height: stampHeight,
    color: rgb(1, 1, 1),
    opacity: 0.9,
  });

  // Separator line
  page.drawLine({
    start: { x: 40, y: stampTop },
    end: { x: width - 40, y: stampTop },
    thickness: 0.5,
    color: rgb(0.4, 0.4, 0.4),
  });

  // Certification text (centered, italic)
  const certTextSize = 8.5;
  const certTextWidth = fontItalic.widthOfTextAtSize(CERT_TEXT, certTextSize);
  page.drawText(CERT_TEXT, {
    x: (width - certTextWidth) / 2,
    y: stampTop - 15,
    size: certTextSize,
    font: fontItalic,
    color: rgb(0, 0, 0),
  });

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
      y: stampBottom + 15,
      width: sigW,
      height: sigH,
    });
  }

  // Info text block (right side)
  const infoX = width / 2 + 10;
  const infoStartY = stampTop - 35;
  const lineHeight = 13;
  const allLines = [...CERT_INFO_LINES, dateText];

  for (let i = 0; i < allLines.length; i++) {
    page.drawText(allLines[i], {
      x: infoX,
      y: infoStartY - i * lineHeight,
      size: 9.5,
      font: i === 0 ? fontBold : font,
      color: rgb(0, 0, 0),
    });
  }
}
