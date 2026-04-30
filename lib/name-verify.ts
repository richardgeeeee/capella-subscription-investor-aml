import './canvas-polyfill';
import fs from 'fs';

function getAnthropicEndpoint(): string {
  const base = process.env.LLM_BASE_URL!;
  const origin = new URL(base).origin;
  return `${origin}/anthropic/v1/messages`;
}

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
  if (!process.env.LLM_API_KEY || !process.env.LLM_BASE_URL) {
    throw new Error('LLM_API_KEY and LLM_BASE_URL must be configured');
  }

  const isPdf = mimeType === 'application/pdf';
  const isImage = mimeType.startsWith('image/');

  if (isImage) return verifyImageViaVision(fs.readFileSync(filePath).toString('base64'), mimeType, legalName);
  if (isPdf) return verifyPdf(filePath, legalName);

  return {
    match: false,
    extracted_name: '',
    reason: `Unsupported file type: ${mimeType}`,
    skipped: true,
  };
}

async function callMiniMaxVLM(base64: string, mimeType: string, prompt: string): Promise<string> {
  const base = process.env.LLM_BASE_URL!;
  const origin = new URL(base).origin;
  const endpoint = `${origin}/v1/coding_plan/vlm`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.LLM_API_KEY}`,
    },
    body: JSON.stringify({ prompt, image_url: `data:${mimeType};base64,${base64}` }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`VLM API error ${response.status}: ${body.slice(0, 300)}`);
  }

  const result = await response.json();
  return result.content || '';
}

async function callExternalVision(base64: string, mimeType: string, legalName: string): Promise<string> {
  const apiKey = process.env.VISION_API_KEY;
  const baseUrl = process.env.VISION_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai';
  const model = process.env.VISION_MODEL || 'gemini-2.0-flash';
  if (!apiKey) throw new Error('VISION_API_KEY is not configured');

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model, max_tokens: 1024,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: [
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
          { type: 'text', text: `User-claimed legal name:\n"""\n${legalName}\n"""` },
        ]},
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

async function verifyImageViaVision(base64: string, mimeType: string, legalName: string): Promise<NameVerifyResult> {
  const vlmPrompt = `${SYSTEM_PROMPT}\n\nUser-claimed legal name:\n"""\n${legalName}\n"""\n\nAnalyze the attached identity document and respond with the JSON object.`;

  try {
    const text = await callMiniMaxVLM(base64, mimeType, vlmPrompt);
    return parseResult(text);
  } catch (err) {
    console.warn('[name-verify] VLM failed:', err instanceof Error ? err.message : err);
  }

  if (process.env.VISION_API_KEY) {
    try {
      const text = await callExternalVision(base64, mimeType, legalName);
      return parseResult(text);
    } catch (err) {
      console.warn('[name-verify] External vision failed:', err instanceof Error ? err.message : err);
    }
  }

  return { match: false, extracted_name: '', reason: 'Vision verification unavailable', skipped: true };
}

async function verifyPdf(filePath: string, legalName: string): Promise<NameVerifyResult> {
  const buffer = fs.readFileSync(filePath);

  // Try rendering to image for VLM (passport PDFs are usually scanned images)
  try {
    const { execSync } = await import('child_process');
    const { mkdtempSync, readFileSync, rmSync, readdirSync } = await import('fs');
    const { join } = await import('path');
    const os = await import('os');
    const tmpDir = mkdtempSync(join(os.tmpdir(), 'nameverify-'));
    try {
      execSync(`pdftoppm -png -r 200 -f 1 -l 1 "${filePath}" "${join(tmpDir, 'page')}"`, { timeout: 15000 });
      const pngs = readdirSync(tmpDir).filter(f => f.endsWith('.png'));
      if (pngs.length > 0) {
        const imgBuf = readFileSync(join(tmpDir, pngs[0]));
        return await verifyImageViaVision(imgBuf.toString('base64'), 'image/png', legalName);
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.warn('[name-verify] pdftoppm render failed:', err instanceof Error ? err.message : err);
  }

  // Fallback: send PDF as document block
  try {
    const endpoint = getAnthropicEndpoint();
    const model = process.env.LLM_VISION_MODEL || 'MiniMax-M2.7';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.LLM_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model, max_tokens: 2048, system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } },
          { type: 'text', text: `User-claimed legal name:\n"""\n${legalName}\n"""` },
        ]}],
      }),
    });
    if (!response.ok) throw new Error(`LLM API error ${response.status}`);
    const result = await response.json();
    const blocks = Array.isArray(result.content) ? result.content : [];
    const textBlock = blocks.find((b: Record<string, unknown>) => b.type === 'text');
    return parseResult((textBlock?.text as string) || '');
  } catch (err) {
    return { match: false, extracted_name: '', reason: `PDF verification failed: ${err instanceof Error ? err.message : String(err)}`, skipped: true };
  }
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
