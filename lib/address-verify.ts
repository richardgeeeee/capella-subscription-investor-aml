import fs from 'fs';
import OpenAI from 'openai';

/**
 * Address verification uses any OpenAI-compatible LLM endpoint.
 * Configure via env vars:
 * - LLM_API_KEY           — required
 * - LLM_BASE_URL          — e.g. "https://open.bigmodel.cn/api/paas/v4"  (GLM / Zhipu)
 *                         — or  "https://api.minimax.chat/v1"           (MiniMax)
 * - LLM_VISION_MODEL      — model that accepts images (e.g. "glm-4v-plus", "glm-4.5v", "MiniMax-VL-01")
 * - LLM_TEXT_MODEL        — text-only model used for PDF text extracts (e.g. "glm-4-plus", "abab6.5s-chat")
 *
 * For PDFs we try to extract the text layer first (cheaper + works for most
 * utility bills / bank statements). If the PDF is a scanned image with no
 * text layer we report status="skipped" so an admin can review manually.
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
  /** If we could not attempt verification (e.g. scanned PDF w/o text) */
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
  if (isImage) return verifyImage(filePath, mimeType, userAddress);

  return {
    match: false,
    extracted_address: '',
    reason: `Unsupported file type for verification: ${mimeType}`,
    skipped: true,
  };
}

async function verifyImage(
  filePath: string,
  mimeType: string,
  userAddress: string
): Promise<AddressVerifyResult> {
  const model = process.env.LLM_VISION_MODEL;
  if (!model) throw new Error('LLM_VISION_MODEL is not configured');

  const base64 = fs.readFileSync(filePath).toString('base64');
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const response = await getClient().chat.completions.create({
    model,
    max_tokens: 500,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: dataUrl } },
          { type: 'text', text: `User-claimed address:\n"""\n${userAddress}\n"""` },
        ],
      },
    ],
  });

  return parseResult(response.choices[0]?.message?.content || '');
}

async function verifyPdf(filePath: string, userAddress: string): Promise<AddressVerifyResult> {
  const { PDFParse } = await import('pdf-parse');
  const buffer = fs.readFileSync(filePath);
  let text = '';
  try {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    text = (result.text || '').trim();
    await parser.destroy();
  } catch {
    text = '';
  }

  if (text.length < 50) {
    return {
      match: false,
      extracted_address: '',
      reason: 'PDF appears to be scanned (no text layer); manual review required.',
      skipped: true,
    };
  }

  const model = process.env.LLM_TEXT_MODEL || process.env.LLM_VISION_MODEL;
  if (!model) throw new Error('LLM_TEXT_MODEL is not configured');

  // Cap text length to avoid huge inputs — first 6000 chars is plenty for an address
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

function parseResult(raw: string): AddressVerifyResult {
  if (!raw) throw new Error('Model returned empty response');
  const stripped = raw.trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '');
  // Some models still wrap or prose around JSON — try to extract the first JSON object
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
