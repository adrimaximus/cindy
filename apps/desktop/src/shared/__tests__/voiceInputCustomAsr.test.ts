import { describe, expect, it } from 'vitest';

import {
  validateVoiceInputCustomAsrConfig,
  validateVoiceInputCustomAsrWebsocketUrl,
} from '../voiceInputCustomAsr.js';

describe('custom ASR WebSocket URL validation', () => {
  it.each(['sig', 'signature', 'password', 'X-Amz-Signature'])(
    'rejects credential query parameter %s',
    (key) => {
      expect(validateVoiceInputCustomAsrWebsocketUrl(`wss://asr.example.test/stream?${key}=secret`))
        .toContain('unsupported query parameters');
    },
  );

  it('allows known non-secret protocol and tenant routing query parameters', () => {
    expect(validateVoiceInputCustomAsrWebsocketUrl(
      'wss://asr.example.test/stream?model=qwen3-asr-flash-realtime&intent=transcription&tenant=one',
    )).toBeNull();
  });

  it('rejects unknown and signed URL query parameters', () => {
    expect(validateVoiceInputCustomAsrWebsocketUrl(
      'wss://asr.example.test/stream?X-Goog-Signature=secret',
    )).toContain('unsupported query parameters');
    expect(validateVoiceInputCustomAsrWebsocketUrl(
      'wss://asr.example.test/stream?custom-routing=value',
    )).toContain('unsupported query parameters');
  });

  it('allows loopback ws IPv6 literals', () => {
    expect(validateVoiceInputCustomAsrWebsocketUrl('ws://[::1]/stream')).toBeNull();
  });

  it('allows valid loopback IPv4 and rejects out-of-range octets', () => {
    expect(validateVoiceInputCustomAsrWebsocketUrl('ws://127.0.0.1/stream')).toBeNull();
    expect(validateVoiceInputCustomAsrWebsocketUrl('ws://127.255.255.255/stream')).toBeNull();
    expect(validateVoiceInputCustomAsrWebsocketUrl('ws://127.999.999.999/stream')).not.toBeNull();
  });
});

describe('custom ASR batch HTTP URL validation', () => {
  const realtimeUrl = 'ws://localhost:5178/v1/stt/realtime';

  it('accepts a same-origin loopback http batch endpoint and keeps it in the config value', () => {
    const result = validateVoiceInputCustomAsrConfig({
      protocol: 'openai-realtime',
      websocketUrl: realtimeUrl,
      model: 'stt-rt-v5',
      batchHttpUrl: 'http://localhost:5178/v1/audio/transcriptions',
    });
    expect(result).toEqual({
      ok: true,
      value: {
        protocol: 'openai-realtime',
        websocketUrl: realtimeUrl,
        model: 'stt-rt-v5',
        batchHttpUrl: 'http://localhost:5178/v1/audio/transcriptions',
      },
    });
  });

  it('omits batchHttpUrl from the value when absent or blank', () => {
    for (const batchHttpUrl of [undefined, '', '   ']) {
      const result = validateVoiceInputCustomAsrConfig({
        protocol: 'openai-realtime',
        websocketUrl: realtimeUrl,
        model: 'stt-rt-v5',
        ...(batchHttpUrl === undefined ? {} : { batchHttpUrl }),
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect('batchHttpUrl' in result.value).toBe(false);
    }
  });

  it('rejects a batch endpoint on a different origin than the realtime websocket', () => {
    expect(validateVoiceInputCustomAsrConfig({
      protocol: 'openai-realtime',
      websocketUrl: realtimeUrl,
      model: 'stt-rt-v5',
      batchHttpUrl: 'http://localhost:9999/v1/audio/transcriptions',
    })).toEqual({ ok: false, error: expect.stringContaining('origin') });
    expect(validateVoiceInputCustomAsrConfig({
      protocol: 'openai-realtime',
      websocketUrl: realtimeUrl,
      model: 'stt-rt-v5',
      batchHttpUrl: 'https://other.example.test/v1/audio/transcriptions',
    })).toEqual({ ok: false, error: expect.stringContaining('origin') });
  });

  it('rejects plain http off loopback, credentials and fragments', () => {
    const cases = [
      'http://asr.example.test/v1/audio/transcriptions',
      'http://user:pass@localhost:5178/v1/audio/transcriptions',
      'http://localhost:5178/v1/audio/transcriptions#frag',
    ];
    for (const batchHttpUrl of cases) {
      expect(validateVoiceInputCustomAsrConfig({
        protocol: 'openai-realtime',
        websocketUrl: realtimeUrl,
        model: 'stt-rt-v5',
        batchHttpUrl,
      }).ok).toBe(false);
    }
  });
});
