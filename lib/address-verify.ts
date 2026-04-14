import fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

export interface AddressVerifyResult {
  match: boolean;
  extracted_address: string;
  reason: string;
}

/**
 * Use Claude Vision to read the address from a document (image or PDF)
 * and compare it to the user-provided address. Handles Chinese and English
 * addresses and is tolerant of formatting differences.
 */
export async function verifyAddressAgainstDocument(
  filePath: string,
  mimeType: string,
  userAddress: string
): Promise<AddressVerifyResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const buffer = fs.readFileSync(filePath);
  const base64 = buffer.toString('base64');

  // Claude supports images (JPEG/PNG/GIF/WebP) and PDFs as document content blocks.
  const isPdf = mimeType === 'application/pdf';
  const isImage = mimeType.startsWith('image/');

  if (!isPdf && !isImage) {
    return {
      match: false,
      extracted_address: '',
      reason: `Unsupported file type for verification: ${mimeType}`,
    };
  }

  const anthropic = getClient();
  const userContent: Anthropic.Messages.ContentBlockParam[] = [];

  if (isPdf) {
    userContent.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: base64 },
    });
  } else {
    userContent.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
        data: base64,
      },
    });
  }

  userContent.push({
    type: 'text',
    text: `You are verifying an investor's address proof document (e.g. utility bill, bank statement, government letter).

The user claims their residential address is:
"""
${userAddress}
"""

Please:
1. Extract the residential/mailing address of the addressee from the document (NOT the company sending the document).
2. Compare it to the user's claimed address.
3. Be lenient with formatting differences: word order (e.g. "Flat A, 5/F" vs "5/F Flat A"), abbreviations, bilingual rendering, punctuation, or spelling variants. They should be treated as a match if they clearly refer to the same location.
4. A mismatch means a different street, building, unit, city, or country — NOT just formatting differences.

Respond with ONLY a JSON object (no markdown, no prose) in this exact shape:
{"match": boolean, "extracted_address": "<address found in document>", "reason": "<one short sentence explaining the decision>"}`,
  });

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    messages: [{ role: 'user', content: userContent }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude returned no text content');
  }

  const raw = textBlock.text.trim();
  // Tolerate ```json fences
  const jsonStr = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(jsonStr);

  return {
    match: !!parsed.match,
    extracted_address: String(parsed.extracted_address || ''),
    reason: String(parsed.reason || ''),
  };
}
