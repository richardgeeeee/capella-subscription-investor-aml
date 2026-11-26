import './canvas-polyfill';
import fs from 'fs';
import { callVisionApi, callTextApi, isVisionConfigured } from './vision-api';

export interface PaymentRecord {
  amount: string;
  currency: string;
  date: string;
  payer: string;
}

export interface PaymentExtractionResult {
  records: PaymentRecord[];
  raw_text?: string;
  error?: string;
}

const PAYMENT_PROMPT = `You extract payment/wire transfer information from a bank transfer receipt, payment confirmation, or remittance advice.

Extract ALL payment records found in this document. For each payment record, extract:
1. amount: the transfer amount (numeric value with currency symbol if shown)
2. currency: the currency code (e.g. USD, HKD, CNY, SGD)
3. date: the transfer/value date in YYYY-MM-DD format
4. payer: the name of the person or entity who sent the payment (the remitter/sender, NOT the recipient)

If there are multiple payments in one document, list them all.

Respond with ONLY a JSON object (no markdown, no prose) in this exact shape:
{"records": [{"amount": "100000", "currency": "USD", "date": "2026-04-25", "payer": "John Smith"}]}

If you cannot find payment information, respond with:
{"records": [], "error": "reason"}`;

export async function extractPaymentInfo(
  filePath: string,
  mimeType: string
): Promise<PaymentExtractionResult> {
  if (!isVisionConfigured()) {
    return { records: [], error: 'No vision/LLM API configured' };
  }

  try {
    const isPdf = mimeType === 'application/pdf';
    const isImage = mimeType.startsWith('image/');

    if (isPdf) return extractFromPdf(filePath);
    if (isImage) return extractFromImage(fs.readFileSync(filePath).toString('base64'), mimeType);
    return { records: [], error: `Unsupported file type: ${mimeType}` };
  } catch (err) {
    return { records: [], error: err instanceof Error ? err.message : String(err) };
  }
}

async function extractFromImage(base64: string, mimeType: string): Promise<PaymentExtractionResult> {
  try {
    const text = await callVisionApi(PAYMENT_PROMPT, 'Extract payment information from this document.', base64, mimeType);
    return parsePaymentResult(text);
  } catch (err) {
    return { records: [], error: `Image extraction failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function extractFromPdf(filePath: string): Promise<PaymentExtractionResult> {
  const buffer = fs.readFileSync(filePath);

  let text = '';
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    text = (result.text || '').trim();
    await parser.destroy();
  } catch (err) {
    console.warn('[payment] PDF text extraction failed:', err instanceof Error ? err.message : err);
  }

  if (text.length >= 30) {
    const truncated = text.length > 6000 ? text.slice(0, 6000) : text;
    const responseText = await callTextApi(
      PAYMENT_PROMPT,
      `Extracted text from the payment proof document:\n"""\n${truncated}\n"""\n\nExtract payment information.`
    );
    return parsePaymentResult(responseText);
  }

  // Scanned PDF — render to image via pdftoppm
  try {
    const { execSync } = await import('child_process');
    const os = await import('os');
    const path = await import('path');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'payment-'));
    try {
      execSync(`pdftoppm -png -r 200 -f 1 -l 1 "${filePath}" "${path.join(tmpDir, 'page')}"`, { timeout: 15000 });
      const pngs = fs.readdirSync(tmpDir).filter(f => f.endsWith('.png'));
      if (pngs.length > 0) {
        const imgBuf = fs.readFileSync(path.join(tmpDir, pngs[0]));
        return await extractFromImage(imgBuf.toString('base64'), 'image/png');
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  } catch (err) {
    return { records: [], error: `PDF processing failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  return { records: [], error: 'PDF has no extractable text and image render failed' };
}

function parsePaymentResult(raw: string): PaymentExtractionResult {
  if (!raw) return { records: [], error: 'Model returned empty response' };
  const stripped = raw.trim()
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
  const firstBrace = stripped.indexOf('{');
  const lastBrace = stripped.lastIndexOf('}');
  const jsonStr = firstBrace >= 0 && lastBrace > firstBrace
    ? stripped.slice(firstBrace, lastBrace + 1) : stripped;

  try {
    const parsed = JSON.parse(jsonStr);
    const records = Array.isArray(parsed.records) ? parsed.records.map((r: Record<string, string>) => ({
      amount: String(r.amount || ''),
      currency: String(r.currency || ''),
      date: String(r.date || ''),
      payer: String(r.payer || ''),
    })) : [];
    return { records, error: parsed.error };
  } catch {
    return { records: [], error: `Failed to parse: ${jsonStr.slice(0, 200)}` };
  }
}
