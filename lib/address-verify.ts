import './canvas-polyfill';
import fs from 'fs';
import { callVisionApi, callTextApi, isVisionConfigured } from './vision-api';

export interface AddressVerifyResult {
  match: boolean;
  extracted_address: string;
  reason: string;
  skipped?: boolean;
}

const SYSTEM_PROMPT = `You verify an investor's address proof document (utility bill, bank statement, government letter, etc.).

Rules:
1. Find the residential/mailing address of the addressee in the document (NOT the company sending it).
2. Compare it to the user-claimed address.
3. Be lenient with formatting differences: word order ("Flat A 5/F" vs "5/F Flat A"), abbreviations, bilingual rendering, punctuation, spelling variants. Treat them as a match if they clearly refer to the same location.
4. A mismatch means a different street, building, unit, city or country — not merely formatting differences.

Respond with ONLY a JSON object (no markdown, no prose) in this exact shape:
{"match": boolean, "extracted_address": "<address found>", "reason": "<one short sentence>"}`;

export async function verifyAddressAgainstDocument(
  filePath: string,
  mimeType: string,
  userAddress: string
): Promise<AddressVerifyResult> {
  if (!isVisionConfigured()) {
    throw new Error('No vision API configured (set VISION_API_KEY + VISION_BASE_URL)');
  }

  const isPdf = mimeType === 'application/pdf';
  const isImage = mimeType.startsWith('image/');

  if (isPdf) return verifyPdf(filePath, userAddress);
  if (isImage) return verifyImage(fs.readFileSync(filePath).toString('base64'), mimeType, userAddress);

  return { match: false, extracted_address: '', reason: `Unsupported file type: ${mimeType}`, skipped: true };
}

async function verifyImage(base64: string, mimeType: string, userAddress: string): Promise<AddressVerifyResult> {
  try {
    const text = await callVisionApi(SYSTEM_PROMPT, `User-claimed address:\n"""\n${userAddress}\n"""`, base64, mimeType);
    return parseResult(text);
  } catch (err) {
    return { match: false, extracted_address: '', reason: `Vision failed: ${err instanceof Error ? err.message : String(err)}`, skipped: true };
  }
}

async function verifyPdf(filePath: string, userAddress: string): Promise<AddressVerifyResult> {
  const buffer = fs.readFileSync(filePath);

  let text = '';
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    text = (result.text || '').trim();
    await parser.destroy();
  } catch (err) {
    console.warn('[verifyPdf] text extraction failed:', err instanceof Error ? err.message : err);
  }

  if (text.length >= 50) {
    const truncated = text.length > 6000 ? text.slice(0, 6000) : text;
    const responseText = await callTextApi(
      SYSTEM_PROMPT,
      `Extracted text from the address proof document:\n"""\n${truncated}\n"""\n\nUser-claimed address:\n"""\n${userAddress}\n"""`
    );
    return parseResult(responseText);
  }

  // Scanned PDF — render to image via pdftoppm
  try {
    const { execSync } = await import('child_process');
    const os = await import('os');
    const path = await import('path');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'addrverify-'));
    try {
      execSync(`pdftoppm -png -r 200 -f 1 -l 1 "${filePath}" "${path.join(tmpDir, 'page')}"`, { timeout: 15000 });
      const pngs = fs.readdirSync(tmpDir).filter(f => f.endsWith('.png'));
      if (pngs.length > 0) {
        const imgBuf = fs.readFileSync(path.join(tmpDir, pngs[0]));
        return await verifyImage(imgBuf.toString('base64'), 'image/png', userAddress);
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.warn('[verifyPdf] pdftoppm failed:', err instanceof Error ? err.message : err);
  }

  return { match: false, extracted_address: '', reason: 'PDF verification failed — no text and image render unavailable', skipped: true };
}

function parseResult(raw: string): AddressVerifyResult {
  if (!raw) throw new Error('Model returned empty response');
  const stripped = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
  const firstBrace = stripped.indexOf('{');
  const lastBrace = stripped.lastIndexOf('}');
  const jsonStr = firstBrace >= 0 && lastBrace > firstBrace ? stripped.slice(firstBrace, lastBrace + 1) : stripped;

  try {
    const parsed = JSON.parse(jsonStr);
    return { match: !!parsed.match, extracted_address: String(parsed.extracted_address || ''), reason: String(parsed.reason || '') };
  } catch {
    const matchVal = /"match"\s*:\s*(true|false)/i.exec(stripped);
    const addrVal = /"extracted_address"\s*:\s*"([^"]*)/.exec(stripped);
    if (matchVal) {
      return { match: matchVal[1] === 'true', extracted_address: addrVal?.[1] || '', reason: '(parsed from truncated response)' };
    }
    throw new Error(`Failed to parse: ${jsonStr.slice(0, 200)}`);
  }
}
