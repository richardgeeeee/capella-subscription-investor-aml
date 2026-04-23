import './canvas-polyfill';
import fs from 'fs';

/**
 * Address verification using two LLM providers:
 *
 * 1. Text (MiniMax): PDF text extraction → MiniMax Anthropic endpoint
 *    - LLM_API_KEY, LLM_BASE_URL, LLM_TEXT_MODEL
 *
 * 2. Vision (Gemini): images + scanned PDFs → Gemini OpenAI-compatible endpoint
 *    - VISION_API_KEY, VISION_BASE_URL, VISION_MODEL
 *    - Default: Gemini 2.0 Flash via generativelanguage.googleapis.com
 *
 * Falls back to text provider for vision if VISION_API_KEY is not set.
 */

function getAnthropicEndpoint(): string {
  const base = process.env.LLM_BASE_URL!;
  const origin = new URL(base).origin;
  return `${origin}/anthropic/v1/messages`;
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

// --------------- MiniMax Anthropic API (text) ---------------

async function callAnthropic(
  model: string,
  userContent: string | Array<Record<string, unknown>>
): Promise<string> {
  const endpoint = getAnthropicEndpoint();

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.LLM_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LLM API error ${response.status}: ${body.slice(0, 300)}`);
  }

  const result = await response.json();
  const blocks = Array.isArray(result.content) ? result.content : [];
  const textBlock = blocks.find((b: Record<string, unknown>) => b.type === 'text');
  return (textBlock?.text as string) || '';
}

// --------------- Gemini Vision API (OpenAI-compatible) ---------------

async function callVision(
  base64: string,
  mimeType: string,
  userAddress: string
): Promise<string> {
  const apiKey = process.env.VISION_API_KEY;
  const baseUrl = process.env.VISION_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai';
  const model = process.env.VISION_MODEL || 'gemini-2.0-flash';

  if (!apiKey) throw new Error('VISION_API_KEY is not configured');

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
            { type: 'text', text: `User-claimed address:\n"""\n${userAddress}\n"""` },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Vision API error ${response.status}: ${body.slice(0, 300)}`);
  }

  const result = await response.json();
  return result.choices?.[0]?.message?.content || '';
}

// --------------- Vision path ---------------

async function verifyImageViaVision(
  base64: string,
  mimeType: string,
  userAddress: string
): Promise<AddressVerifyResult> {
  // Use dedicated vision provider (Gemini) if configured
  if (process.env.VISION_API_KEY) {
    const text = await callVision(base64, mimeType, userAddress);
    return parseResult(text);
  }

  // Fallback: try MiniMax Anthropic (may not work with Token Plan)
  const model = process.env.LLM_VISION_MODEL || 'MiniMax-M2.7';
  const text = await callAnthropic(model, [
    { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
    { type: 'text', text: `User-claimed address:\n"""\n${userAddress}\n"""` },
  ]);
  return parseResult(text);
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

  // No usable text — try vision on the PDF
  // First try Gemini vision with rendered image
  if (process.env.VISION_API_KEY) {
    try {
      const { pdf: pdfToImg } = await import('pdf-to-img');
      const doc = await pdfToImg(buffer, { scale: 2 });
      const pageImage = await doc.getPage(1);
      return await verifyImageViaVision(pageImage.toString('base64'), 'image/png', userAddress);
    } catch (renderErr) {
      console.warn('[verifyPdf] local render failed, trying document block:', renderErr instanceof Error ? renderErr.message : renderErr);
    }
  }

  // Fallback: send PDF as document block to MiniMax
  const model = process.env.LLM_VISION_MODEL || 'MiniMax-M2.7';
  try {
    const responseText = await callAnthropic(model, [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } },
      { type: 'text', text: `User-claimed address:\n"""\n${userAddress}\n"""` },
    ]);
    return parseResult(responseText);
  } catch (err) {
    console.warn('[verifyPdf] document vision failed:', err instanceof Error ? err.message : err);
    return {
      match: false,
      extracted_address: '',
      reason: `PDF has no extractable text and vision failed: ${err instanceof Error ? err.message : String(err)}`,
      skipped: true,
    };
  }
}

async function verifyPdfText(text: string, userAddress: string): Promise<AddressVerifyResult> {
  const model = process.env.LLM_TEXT_MODEL || process.env.LLM_VISION_MODEL || 'MiniMax-M2.7';
  const truncated = text.length > 6000 ? text.slice(0, 6000) : text;

  const responseText = await callAnthropic(
    model,
    `Extracted text from the address proof document:\n"""\n${truncated}\n"""\n\nUser-claimed address:\n"""\n${userAddress}\n"""`,
  );

  return parseResult(responseText);
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
  let jsonStr = firstBrace >= 0 && lastBrace > firstBrace
    ? stripped.slice(firstBrace, lastBrace + 1)
    : stripped;

  try {
    const parsed = JSON.parse(jsonStr);
    return {
      match: !!parsed.match,
      extracted_address: String(parsed.extracted_address || ''),
      reason: String(parsed.reason || ''),
    };
  } catch {
    jsonStr = jsonStr
      .replace(/,\s*$/, '')
      .replace(/"\s*$/, '"}')
      .replace(/:\s*$/, ': ""}');
    if (!jsonStr.endsWith('}')) jsonStr += '}';
    try {
      const parsed = JSON.parse(jsonStr);
      return {
        match: !!parsed.match,
        extracted_address: String(parsed.extracted_address || ''),
        reason: String(parsed.reason || '(response truncated)'),
      };
    } catch {
      const matchVal = /"match"\s*:\s*(true|false)/i.exec(stripped);
      const addrVal = /"extracted_address"\s*:\s*"([^"]*)/.exec(stripped);
      if (matchVal) {
        return {
          match: matchVal[1] === 'true',
          extracted_address: addrVal?.[1] || '',
          reason: '(parsed from truncated response)',
        };
      }
      throw new Error(`Failed to parse model response: ${stripped.slice(0, 200)}`);
    }
  }
}
