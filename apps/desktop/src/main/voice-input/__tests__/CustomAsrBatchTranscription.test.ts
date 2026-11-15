/**
 * CustomAsrBatchTranscription.test.ts — BYOK 批量转写传输合同:
 * multipart 形状(model/file/language)、可选 Authorization、OpenAI 兼容响应
 * 解析与非 2xx 错误透传。credential scope(origin 同源)由 shared validator
 * 的测试覆盖,这里只验证传输本身。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const outboundFetchMock = vi.hoisted(() => vi.fn());
vi.mock('../../maker-host/outbound-fetch.desktop.js', () => ({
  outboundFetch: (...args: unknown[]) => outboundFetchMock(...args),
}));

import { transcribeCustomAsrAudioFile } from '../CustomAsrBatchTranscription.js';

function okResponse(body: unknown) {
  return { ok: true, status: 200, text: async () => JSON.stringify(body) };
}

afterEach(() => {
  outboundFetchMock.mockReset();
});

describe('transcribeCustomAsrAudioFile', () => {
  it('posts OpenAI-compatible multipart with the configured model and file', async () => {
    outboundFetchMock.mockResolvedValue(okResponse({ text: '  tes transkrip  ' }));

    const text = await transcribeCustomAsrAudioFile({
      batchHttpUrl: 'http://localhost:5178/v1/audio/transcriptions',
      model: 'stt-rt-v5',
      apiKey: 'local-key',
      bytes: Buffer.from([1, 2, 3]),
      mimeType: 'audio/mp4',
      fileName: 'voice.m4a',
      sourceLanguage: 'id-ID',
    });

    expect(text).toBe('tes transkrip');
    const [url, init] = outboundFetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:5178/v1/audio/transcriptions');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer local-key');
    const form = init.body as FormData;
    expect(form.get('model')).toBe('stt-rt-v5');
    expect(form.get('language')).toBe('id-ID');
    const file = form.get('file') as File;
    expect(file.name).toBe('voice.m4a');
    expect(file.type).toBe('audio/mp4');
  });

  it('omits Authorization when no key is stored and skips language for auto', async () => {
    outboundFetchMock.mockResolvedValue(okResponse({ text: 'ok' }));

    await transcribeCustomAsrAudioFile({
      batchHttpUrl: 'http://localhost:5178/v1/audio/transcriptions',
      model: 'stt-rt-v5',
      apiKey: undefined,
      bytes: Buffer.from([1]),
      sourceLanguage: 'auto',
    });

    const [, init] = outboundFetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    const form = init.body as FormData;
    expect(form.get('language')).toBeNull();
  });

  it('returns empty text for empty audio without any network call', async () => {
    const text = await transcribeCustomAsrAudioFile({
      batchHttpUrl: 'http://localhost:5178/v1/audio/transcriptions',
      model: 'stt-rt-v5',
      apiKey: undefined,
      bytes: Buffer.alloc(0),
    });
    expect(text).toBe('');
    expect(outboundFetchMock).not.toHaveBeenCalled();
  });

  it('propagates upstream error detail on non-2xx', async () => {
    outboundFetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => JSON.stringify({ error: { message: 'stt down' } }),
    });

    await expect(transcribeCustomAsrAudioFile({
      batchHttpUrl: 'http://localhost:5178/v1/audio/transcriptions',
      model: 'stt-rt-v5',
      apiKey: undefined,
      bytes: Buffer.from([1]),
    })).rejects.toThrow('stt down');
  });
});
