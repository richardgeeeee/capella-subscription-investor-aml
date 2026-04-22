import './canvas-polyfill';
import fs from 'fs';

/**
 * Address verification via MiniMax Anthropic-compatible endpoint.
 *
 * Env vars:
 * - LLM_API_KEY        — required (Token Plan sk-cp- keys supported)
 * - LLM_BASE_URL       — OpenAI-compatible base, e.g. "https://api.minimaxi.com/v1"
 *                         (the Anthropic endpoint is derived as {origin}/anthropic/v1/messages)
 * - LLM_TEXT_MODEL     — model for text (default: "MiniMax-M2.7")
 * - LLM_VISION_MODEL   — model for images (default: "MiniMax-M2.7")
 *
 * Token Plan keys (sk-cp-) only work with the Anthropic-compatible
 * endpoint using x-api-key auth, NOT the OpenAI-compatible endpoint.
 * All calls go through the Anthropic Messages format.
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

// --------------- Anthropic Messages API ---------------

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
  // MiniMax M2.7 returns [{ type: 'thinking', ... }, { type: 'text', text: '...' }]
  const blocks = Array.isArray(result.content) ? result.content : [];
  const textBlock = blocks.find((b: Record<string, unknown>) => b.type === 'text');
  return (textBlock?.text as string) || '';
}

// --------------- Vision path ---------------

async function verifyImageViaVision(
  base64: string,
  mimeType: string,
  userAddress: string
): Promise<AddressVerifyResult> {
  const model = process.env.LLM_VISION_MODEL || 'MiniMax-M2.7';

  const text = await callAnthropic(model, [
    {
      type: 'image',
      source: { type: 'base64', media_type: mimeType, data: base64 },
    },
    {
      type: 'text',
      text: `User-claimed address:\n"""\n${userAddress}\n"""`,
    },
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

  // No usable text — try sending PDF as document block (Anthropic format)
  const model = process.env.LLM_VISION_MODEL || 'MiniMax-M2.7';
  try {
    const responseText = await callAnthropic(model, [
      {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') },
      },
      {
        type: 'text',
        text: `User-claimed address:\n"""\n${userAddress}\n"""`,
      },
    ]);
    return parseResult(responseText);
  } catch (err) {
    console.warn('[verifyPdf] document vision failed, trying local render:', err instanceof Error ? err.message : err);
  }

  // Fallback: render to image
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
      reason: `PDF has no extractable text and rendering failed: ${renderErr instanceof Error ? renderErr.message : String(renderErr)}`,
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
    // Truncated JSON — try to salvage by closing open strings/braces
    jsonStr = jsonStr
      .replace(/,\s*$/, '')       // trailing comma
      .replace(/"\s*$/, '"}')     // unterminated string value
      .replace(/:\s*$/, ': ""}'); // key with no value
    if (!jsonStr.endsWith('}')) jsonStr += '}';
    try {
      const parsed = JSON.parse(jsonStr);
      return {
        match: !!parsed.match,
        extracted_address: String(parsed.extracted_address || ''),
        reason: String(parsed.reason || '(response truncated)'),
      };
    } catch {
      // Last resort: regex extraction
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
