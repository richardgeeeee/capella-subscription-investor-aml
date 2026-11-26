/**
 * Shared vision + text API caller.
 *
 * Primary: LLM_API_KEY / LLM_BASE_URL (MiniMax Token Plan)
 *   - Vision: /v1/coding_plan/vlm endpoint
 *   - Text: Anthropic-compatible /anthropic/v1/messages endpoint
 *
 * Fallback: VISION_API_KEY / VISION_BASE_URL / VISION_MODEL (OpenAI-compatible, e.g. Gemini)
 */

export async function callVisionApi(
  systemPrompt: string,
  userText: string,
  imageBase64: string,
  imageMimeType: string
): Promise<string> {
  // Primary: MiniMax VLM
  if (process.env.LLM_API_KEY && process.env.LLM_BASE_URL) {
    try {
      return await callMiniMaxVLM(systemPrompt, userText, imageBase64, imageMimeType);
    } catch (err) {
      console.warn('[vision] MiniMax VLM failed:', err instanceof Error ? err.message : err);
    }
  }

  // Fallback: OpenAI-compatible vision provider (Gemini, GLM, etc.)
  if (process.env.VISION_API_KEY) {
    const baseUrl = process.env.VISION_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai';
    const model = process.env.VISION_MODEL || 'gemini-2.0-flash';
    try {
      return await callOpenAICompatible(baseUrl, process.env.VISION_API_KEY, model, systemPrompt, userText, imageBase64, imageMimeType);
    } catch (err) {
      console.warn('[vision] Fallback vision API failed:', err instanceof Error ? err.message : err);
    }
  }

  throw new Error('No vision API configured — set LLM_API_KEY + LLM_BASE_URL');
}

export async function callTextApi(
  systemPrompt: string,
  userContent: string
): Promise<string> {
  // Primary: MiniMax Anthropic endpoint
  if (process.env.LLM_API_KEY && process.env.LLM_BASE_URL) {
    try {
      return await callMiniMaxAnthropic(systemPrompt, userContent);
    } catch (err) {
      console.warn('[text] MiniMax text API failed:', err instanceof Error ? err.message : err);
    }
  }

  // Fallback: OpenAI-compatible text provider
  if (process.env.VISION_API_KEY) {
    const baseUrl = process.env.VISION_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai';
    const model = process.env.VISION_TEXT_MODEL || process.env.VISION_MODEL || 'gemini-2.0-flash';
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.VISION_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`API error ${response.status}: ${body.slice(0, 300)}`);
      }
      const result = await response.json();
      return result.choices?.[0]?.message?.content || '';
    } catch (err) {
      console.warn('[text] Fallback text API failed:', err instanceof Error ? err.message : err);
    }
  }

  throw new Error('No text API configured — set LLM_API_KEY + LLM_BASE_URL');
}

// --------------- MiniMax Token Plan ---------------

async function callMiniMaxVLM(
  systemPrompt: string,
  userText: string,
  imageBase64: string,
  imageMimeType: string
): Promise<string> {
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
      prompt: `${systemPrompt}\n\n${userText}`,
      image_url: `data:${imageMimeType};base64,${imageBase64}`,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`VLM API error ${response.status}: ${body.slice(0, 300)}`);
  }

  const result = await response.json();
  return result.content || '';
}

async function callMiniMaxAnthropic(
  systemPrompt: string,
  userContent: string
): Promise<string> {
  const base = process.env.LLM_BASE_URL!;
  const origin = new URL(base).origin;
  const endpoint = `${origin}/anthropic/v1/messages`;
  const model = process.env.LLM_TEXT_MODEL || 'MiniMax-M2.7';

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
      system: systemPrompt,
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

// --------------- OpenAI-compatible fallback ---------------

async function callOpenAICompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userText: string,
  imageBase64: string,
  imageMimeType: string
): Promise<string> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${imageMimeType};base64,${imageBase64}` } },
            { type: 'text', text: userText },
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

export function isVisionConfigured(): boolean {
  return !!(process.env.LLM_API_KEY && process.env.LLM_BASE_URL) || !!process.env.VISION_API_KEY;
}
