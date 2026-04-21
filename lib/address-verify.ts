import './canvas-polyfill';
import fs from 'fs';
import OpenAI from 'openai';

/**
 * Address verification via MiniMax (or any OpenAI-compatible provider).
 *
 * Env vars:
 * - LLM_API_KEY        — required
 * - LLM_BASE_URL       — OpenAI-compatible base, e.g. "https://api.minimax.io/v1"
 * - LLM_TEXT_MODEL     — text model for extracted PDF text (e.g. "MiniMax-Text-01")
 * - LLM_VISION_MODEL   — vision model for images (e.g. "MiniMax-VL-01")
 *
 * Text PDFs  → extract text via pdf-parse → send to text model.
 * Scanned PDFs / images → send as base64 data URI to vision model.
 *
 * The canvas-polyfill import provides DOMMatrix/Path2D/ImageData stubs so
 * pdfjs-dist initializes without @napi-rs/canvas (needed on Alpine Docker).
 */

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.LLM_API_KEY,
      baseURL: process.env.LLM_BASE_URL,
    });
  }
  return client;
}

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
  if (!process.env.LLM_API_KEY || !process.env.LLM_BASE_URL) {
    throw new Error('LLM_API_KEY and LLM_BASE_URL must be configured');
  }

  const isPdf = mimeType === 'application/pdf';
  const isImage = mimeType.startsWith('image/');

  if (isPdf) return verifyPdf(filePath, userAddress);
  if (isImage) return verifyImageViaVision(fs.readFileSync(filePath).toString('base64'), mimeType, userAddress);

  return {
    match: false,
    extracted_address: '',
    reason: `Unsupported file type for verification: ${mimeType}`,
    skipped: true,
  };
}

// --------------- Vision path (OpenAI-compatible endpoint) ---------------

async function verifyImageViaVision(
  base64: string,
  mimeType: string,
  userAddress: string
): Promise<AddressVerifyResult> {
  const model = process.env.LLM_VISION_MODEL;
  if (!model) throw new Error('LLM_VISION_MODEL is not configured');

  const response = await getClient().chat.completions.create({
    model,
    max_tokens: 500,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${base64}` },
          },
          {
            type: 'text',
            text: `User-claimed address:\n"""\n${userAddress}\n"""`,
          },
        ],
      },
    ],
  });

  return parseResult(response.choices[0]?.message?.content || '');
}

// --------------- PDF path ---------------

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
    text = '';
  }

  if (text.length >= 50) {
    return verifyPdfText(text, userAddress);
  }

  // No usable text (scanned PDF). Try rendering page 1 to image then vision.
  const model = process.env.LLM_VISION_MODEL;
  if (!model) {
    return {
      match: false,
      extracted_address: '',
      reason: 'PDF has no text layer and LLM_VISION_MODEL is not configured.',
      skipped: true,
    };
  }

  try {
    const { pdf: pdfToImg } = await import('pdf-to-img');
    const doc = await pdfToImg(buffer, { scale: 2 });
    const pageImage = await doc.getPage(1);
    return await verifyImageViaVision(pageImage.toString('base64'), 'image/png', userAddress);
  } catch (renderErr) {
    console.warn('[verifyPdf] local PDF render failed:', renderErr instanceof Error ? renderErr.message : renderErr);
    return {
      match: false,
      extracted_address: '',
      reason: `PDF has no extractable text and local rendering failed: ${renderErr instanceof Error ? renderErr.message : String(renderErr)}`,
      skipped: true,
    };
  }
}

async function verifyPdfText(text: string, userAddress: string): Promise<AddressVerifyResult> {
  const model = process.env.LLM_TEXT_MODEL || process.env.LLM_VISION_MODEL;
  if (!model) throw new Error('LLM_TEXT_MODEL is not configured');

  const truncated = text.length > 6000 ? text.slice(0, 6000) : text;

  const response = await getClient().chat.completions.create({
    model,
    max_tokens: 500,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Extracted text from the address proof document:\n"""\n${truncated}\n"""\n\nUser-claimed address:\n"""\n${userAddress}\n"""`,
      },
    ],
  });

  return parseResult(response.choices[0]?.message?.content || '');
}

// --------------- Shared ---------------

function parseResult(raw: string): AddressVerifyResult {
  if (!raw) throw new Error('Model returned empty response');
  const stripped = raw.trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '');
  const firstBrace = stripped.indexOf('{');
  const lastBrace = stripped.lastIndexOf('}');
  const jsonStr = firstBrace >= 0 && lastBrace > firstBrace
    ? stripped.slice(firstBrace, lastBrace + 1)
    : stripped;
  const parsed = JSON.parse(jsonStr);
  return {
    match: !!parsed.match,
    extracted_address: String(parsed.extracted_address || ''),
    reason: String(parsed.reason || ''),
  };
}
