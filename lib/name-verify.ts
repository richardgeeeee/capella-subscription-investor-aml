import './canvas-polyfill';
import fs from 'fs';
import { callVisionApi, isVisionConfigured } from './vision-api';

export interface NameVerifyResult {
  match: boolean;
  extracted_name: string;
  reason: string;
  skipped?: boolean;
}

const SYSTEM_PROMPT = `You verify an investor's identity document (passport, HKID card, national ID, etc.).

Rules:
1. Find the full legal name of the document holder as printed on the document.
2. Compare it to the user-claimed legal name.
3. Be lenient with: casing differences, romanisation variants of Chinese names (e.g. "Yi Ting" vs "Yiting"), spacing, order (family name first vs last), middle name presence/absence.
4. A mismatch means a clearly different name — not merely formatting differences.
5. For Chinese IDs that show Chinese characters only, romanise them for comparison if the claimed name appears to be a romanised version.

Respond with ONLY a JSON object (no markdown, no prose) in this exact shape:
{"match": boolean, "extracted_name": "<name found on document>", "reason": "<one short sentence>"}`;

export async function verifyNameAgainstDocument(
  filePath: string,
  mimeType: string,
  legalName: string
): Promise<NameVerifyResult> {
  if (!isVisionConfigured()) {
    throw new Error('No vision API configured (set VISION_API_KEY + VISION_BASE_URL)');
  }

  const isImage = mimeType.startsWith('image/');
  const isPdf = mimeType === 'application/pdf';

  if (isImage) return verifyImage(fs.readFileSync(filePath).toString('base64'), mimeType, legalName);
  if (isPdf) return verifyPdf(filePath, legalName);

  return { match: false, extracted_name: '', reason: `Unsupported file type: ${mimeType}`, skipped: true };
}

async function verifyImage(base64: string, mimeType: string, legalName: string): Promise<NameVerifyResult> {
  try {
    const text = await callVisionApi(SYSTEM_PROMPT, `User-claimed legal name:\n"""\n${legalName}\n"""`, base64, mimeType);
    return parseResult(text);
  } catch (err) {
    return { match: false, extracted_name: '', reason: `Vision failed: ${err instanceof Error ? err.message : String(err)}`, skipped: true };
  }
}

async function verifyPdf(filePath: string, legalName: string): Promise<NameVerifyResult> {
  try {
    const { execSync } = await import('child_process');
    const os = await import('os');
    const path = await import('path');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nameverify-'));
    try {
      execSync(`pdftoppm -png -r 200 -f 1 -l 1 "${filePath}" "${path.join(tmpDir, 'page')}"`, { timeout: 15000 });
      const pngs = fs.readdirSync(tmpDir).filter(f => f.endsWith('.png'));
      if (pngs.length > 0) {
        const imgBuf = fs.readFileSync(path.join(tmpDir, pngs[0]));
        return await verifyImage(imgBuf.toString('base64'), 'image/png', legalName);
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.warn('[name-verify] pdftoppm failed:', err instanceof Error ? err.message : err);
  }

  return { match: false, extracted_name: '', reason: 'PDF name verification failed', skipped: true };
}

function parseResult(raw: string): NameVerifyResult {
  if (!raw) throw new Error('Model returned empty response');
  const stripped = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
  const firstBrace = stripped.indexOf('{');
  const lastBrace = stripped.lastIndexOf('}');
  const jsonStr = firstBrace >= 0 && lastBrace > firstBrace ? stripped.slice(firstBrace, lastBrace + 1) : stripped;

  try {
    const parsed = JSON.parse(jsonStr);
    return { match: !!parsed.match, extracted_name: String(parsed.extracted_name || ''), reason: String(parsed.reason || '') };
  } catch {
    const matchVal = /"match"\s*:\s*(true|false)/i.exec(stripped);
    const nameVal = /"extracted_name"\s*:\s*"([^"]*)/.exec(stripped);
    if (matchVal) {
      return { match: matchVal[1] === 'true', extracted_name: nameVal?.[1] || '', reason: '(parsed from truncated response)' };
    }
    throw new Error(`Failed to parse: ${jsonStr.slice(0, 200)}`);
  }
}
