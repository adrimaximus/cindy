/**
 * CustomAsrBatchTranscription.ts — device-link 远程听写的 BYOK 批量转写:
 * 手机上传录音后,被控端把音频 POST 到 customAsr.batchHttpUrl(OpenAI 兼容
 * `/v1/audio/transcriptions` 合同),provider/model 完全跟随被控端的语音输入
 * 设置,不经过 XD Gateway。仅在 batchHttpUrl 与 realtime websocketUrl 同源
 * (由 validateVoiceInputCustomAsrBatchHttpUrl 保证)时才会携带已存 API key。
 */
import { outboundFetch } from '../maker-host/outbound-fetch.desktop.js';

export interface CustomAsrAudioFileTranscriptionInput {
  batchHttpUrl: string;
  model: string;
  apiKey: string | undefined;
  bytes: Buffer | Uint8Array;
  mimeType?: string;
  fileName?: string;
  sourceLanguage?: string;
}

/**
 * OpenAI 兼容音频转写:multipart `file` + `model`(+ 可选 `language`),
 * 响应 `{ "text": "..." }`。API key 缺省时不发 Authorization(本机端点常见)。
 */
export async function transcribeCustomAsrAudioFile(
  input: CustomAsrAudioFileTranscriptionInput,
): Promise<string> {
  const bytes = input.bytes instanceof Buffer ? input.bytes : Buffer.from(input.bytes);
  if (bytes.byteLength === 0) return '';
  const exact = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const fileName = input.fileName?.trim() || fileNameForMimeType(input.mimeType);
  const mimeType = input.mimeType?.trim() || 'application/octet-stream';
  const form = new FormData();
  form.set('model', input.model);
  const language = normalizeLanguageHint(input.sourceLanguage);
  if (language) form.set('language', language);
  form.set('file', new Blob([exact], { type: mimeType }), fileName);

  const headers: Record<string, string> = {};
  if (input.apiKey) headers.Authorization = `Bearer ${input.apiKey}`;

  const response = await outboundFetch(input.batchHttpUrl, {
    method: 'POST',
    headers,
    body: form,
  });
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    throw new Error(transcriptionErrorMessage(parsed, text, response.status));
  }
  return isRecord(parsed) && typeof parsed.text === 'string'
    ? parsed.text.trim()
    : '';
}

/** `auto`/空提示不上送 language,让端点自行检测。 */
function normalizeLanguageHint(sourceLanguage: string | undefined): string | undefined {
  const value = sourceLanguage?.trim();
  if (!value || value.toLowerCase() === 'auto') return undefined;
  return value;
}

function fileNameForMimeType(mimeType: string | undefined): string {
  if (mimeType === 'audio/wav' || mimeType === 'audio/wave' || mimeType === 'audio/x-wav') return 'dictation.wav';
  if (mimeType === 'audio/mp4' || mimeType === 'audio/m4a' || mimeType === 'audio/x-m4a') return 'dictation.m4a';
  if (mimeType === 'audio/mpeg') return 'dictation.mp3';
  if (mimeType === 'audio/webm') return 'dictation.webm';
  if (mimeType === 'audio/ogg') return 'dictation.ogg';
  return 'dictation.bin';
}

function transcriptionErrorMessage(parsed: unknown, raw: string, status: number): string {
  if (isRecord(parsed)) {
    const detail = parsed.detail;
    if (typeof detail === 'string') return detail;
    const error = parsed.error;
    if (isRecord(error) && typeof error.message === 'string') return error.message;
    if (typeof parsed.message === 'string') return parsed.message;
  }
  return raw.trim() || `Transcription failed with HTTP ${status}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
