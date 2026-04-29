import './canvas-polyfill';
import fs from 'fs';

/**
 * Payment proof extraction: reads transfer amount, date, and payer
 * from uploaded payment proof documents (PDF or image).
 *
 * Uses MiniMax VLM for images, MiniMax Anthropic for PDF text,
 * with Gemini as optional fallback for vision.
 */

function getAnthropicEndpoint(): string {
  const base = process.env.LLM_BASE_URL!;
  const origin = new URL(base).origin;
  return `${origin}/anthropic/v1/messages`;
}

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

async function callAnthropicForPayment(
  userContent: string | Array<Record<string, unknown>>
): Promise<string> {
  const endpoint = getAnthropicEndpoint();
  const model = process.env.LLM_TEXT_MODEL || process.env.LLM_VISION_MODEL || 'MiniMax-M2.7';

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
      system: PAYMENT_PROMPT,
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

async function callVLMForPayment(base64: string, mimeType: string): Promise<string> {
  const base = process.env.LLM_BASE_URL!;
  const origin = new URL(base).origin;
  const endpoint = `${origin}/v1/coding_plan/vlm`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.LLM_API_KEY}`,
    },
    body: JSON.stringify({
      prompt: PAYMENT_PROMPT + '\n\nAnalyze the attached document and respond with the JSON.',
      image_url: `data:${mimeType};base64,${base64}`,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`VLM API error ${response.status}: ${body.slice(0, 300)}`);
  }

  const result = await response.json();
  return result.content || '';
}

export async function extractPaymentInfo(
  filePath: string,
  mimeType: string
): Promise<PaymentExtractionResult> {
  if (!process.env.LLM_API_KEY || !process.env.LLM_BASE_URL) {
    return { records: [], error: 'LLM not configured' };
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
  // Try MiniMax VLM first
  try {
    const text = await callVLMForPayment(base64, mimeType);
    return parsePaymentResult(text);
  } catch (err) {
    console.warn('[payment] VLM failed:', err instanceof Error ? err.message : err);
  }

  // Fallback: external vision (Gemini)
  if (process.env.VISION_API_KEY) {
    try {
      const apiKey = process.env.VISION_API_KEY;
      const baseUrl = process.env.VISION_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai';
      const model = process.env.VISION_MODEL || 'gemini-2.0-flash';
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model, max_tokens: 1024,
          messages: [
            { role: 'system', content: PAYMENT_PROMPT },
            { role: 'user', content: [
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
              { type: 'text', text: 'Extract payment information from this document.' },
            ]},
          ],
        }),
      });
      if (response.ok) {
        const result = await response.json();
        return parsePaymentResult(result.choices?.[0]?.message?.content || '');
      }
    } catch { /* fall through */ }
  }

  return { records: [], error: 'Image extraction failed' };
}

async function extractFromPdf(filePath: string): Promise<PaymentExtractionResult> {
  const buffer = fs.readFileSync(filePath);

  // Try text extraction
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
    const responseText = await callAnthropicForPayment(
      `Extracted text from the payment proof document:\n"""\n${truncated}\n"""\n\nExtract payment information.`
    );
    return parsePaymentResult(responseText);
  }

  // Scanned PDF — render to image
  try {
    const { pdf: pdfToImg } = await import('pdf-to-img');
    const doc = await pdfToImg(buffer, { scale: 2 });
    const pageImage = await doc.getPage(1);
    return extractFromImage(pageImage.toString('base64'), 'image/png');
  } catch (err) {
    return { records: [], error: `PDF processing failed: ${err instanceof Error ? err.message : String(err)}` };
  }
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
