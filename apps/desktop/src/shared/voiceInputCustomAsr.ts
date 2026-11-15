export type VoiceInputCustomAsrProtocol = 'openai-realtime' | 'qwen-realtime';

export type VoiceInputCustomAsrConfig = {
  protocol: VoiceInputCustomAsrProtocol;
  websocketUrl: string;
  model: string;
  /**
   * Optional OpenAI-compatible batch transcription endpoint for the
   * device-link remote dictation path. Must share the websocketUrl origin so
   * the credential scope (`voiceInputCustomAsrCredentialScope`) still holds:
   * the stored API key may only ever be sent to the same server.
   */
  batchHttpUrl?: string;
};

export const MAX_CUSTOM_ASR_WEBSOCKET_URL_CHARS = 2_048;
export const MAX_CUSTOM_ASR_MODEL_CHARS = 200;
export const MAX_CUSTOM_ASR_API_KEY_CHARS = 8_192;
const ALLOWED_CUSTOM_ASR_QUERY_KEYS = new Set([
  'model',
  'model_id',
  'api-version',
  'api_version',
  'deployment',
  'intent',
  'tenant',
  'language',
  'language_code',
  'audio_format',
  'commit_strategy',
  'vad_silence_threshold_secs',
]);

/**
 * Credential scope for a custom ASR endpoint. Paths may change without
 * exposing the key to a different server, while scheme/host/port changes
 * require an explicit credential update.
 */
export function voiceInputCustomAsrCredentialScope(websocketUrl: string): string | null {
  try {
    return new URL(websocketUrl).origin;
  } catch {
    return null;
  }
}

export function canReuseVoiceInputCustomAsrCredential(
  currentWebsocketUrl: string | undefined,
  nextWebsocketUrl: string,
): boolean {
  if (!currentWebsocketUrl) return false;
  const currentScope = voiceInputCustomAsrCredentialScope(currentWebsocketUrl);
  return currentScope !== null
    && currentScope === voiceInputCustomAsrCredentialScope(nextWebsocketUrl);
}

/**
 * Qwen's realtime protocol selects its model in the WebSocket query rather
 * than the session.update payload. The form's model field remains the source
 * of truth and overrides a stale model query already present in the URL.
 */
export function resolveVoiceInputCustomAsrWebsocketUrl(
  config: VoiceInputCustomAsrConfig,
): string {
  if (config.protocol !== 'qwen-realtime') return config.websocketUrl;
  const websocketUrl = new URL(config.websocketUrl);
  websocketUrl.searchParams.set('model', config.model);
  return websocketUrl.toString();
}

export function validateVoiceInputCustomAsrWebsocketUrl(value: string): string | null {
  const websocketUrl = value.trim();
  if (!websocketUrl || websocketUrl.length > MAX_CUSTOM_ASR_WEBSOCKET_URL_CHARS) {
    return 'customAsr.websocketUrl is required and must be at most 2048 characters';
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(websocketUrl);
  } catch {
    return 'customAsr.websocketUrl must be a valid URL';
  }
  const loopbackHost = parsedUrl.hostname === 'localhost'
    || parsedUrl.hostname === '::1'
    || parsedUrl.hostname === '[::1]'
    || isLoopbackIpv4(parsedUrl.hostname);
  if (parsedUrl.protocol !== 'wss:' && !(parsedUrl.protocol === 'ws:' && loopbackHost)) {
    return 'customAsr.websocketUrl must use wss, or ws on a loopback host';
  }
  if (parsedUrl.username || parsedUrl.password) {
    return 'customAsr.websocketUrl must not contain credentials';
  }
  const containsDisallowedQuery = [...parsedUrl.searchParams.keys()].some((key) => (
    !ALLOWED_CUSTOM_ASR_QUERY_KEYS.has(key.toLowerCase())
  ));
  if (containsDisallowedQuery) {
    return 'customAsr.websocketUrl contains unsupported query parameters; only documented routing parameters are allowed';
  }
  if (parsedUrl.hash) {
    return 'customAsr.websocketUrl must not contain a fragment';
  }
  return null;
}

function isLoopbackIpv4(hostname: string): boolean {
  const octets = hostname.split('.');
  return octets.length === 4
    && octets[0] === '127'
    && octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255);
}

export function validateVoiceInputCustomAsrConfig(
  value: unknown,
): { ok: true; value: VoiceInputCustomAsrConfig } | { ok: false; error: string } {
  if (!isPlainObject(value)) return { ok: false, error: 'customAsr must be an object' };

  const protocol = typeof value.protocol === 'string' ? value.protocol.trim().toLowerCase() : '';
  if (protocol !== 'openai-realtime' && protocol !== 'qwen-realtime') {
    return { ok: false, error: 'customAsr.protocol must be openai-realtime or qwen-realtime' };
  }

  const websocketUrl = typeof value.websocketUrl === 'string' ? value.websocketUrl.trim() : '';
  const websocketUrlError = validateVoiceInputCustomAsrWebsocketUrl(websocketUrl);
  if (websocketUrlError) return { ok: false, error: websocketUrlError };

  const model = typeof value.model === 'string' ? value.model.trim() : '';
  const hasControlCharacter = [...model].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
  if (!model || model.length > MAX_CUSTOM_ASR_MODEL_CHARS || hasControlCharacter) {
    return { ok: false, error: 'customAsr.model is required and must be at most 200 characters' };
  }

  const batchHttpUrlError = validateVoiceInputCustomAsrBatchHttpUrl(value.batchHttpUrl, websocketUrl);
  if (batchHttpUrlError) return { ok: false, error: batchHttpUrlError };

  return {
    ok: true,
    value: {
      protocol,
      websocketUrl,
      model,
      ...(typeof value.batchHttpUrl === 'string' && value.batchHttpUrl.trim()
        ? { batchHttpUrl: value.batchHttpUrl.trim() }
        : {}),
    },
  };
}

/**
 * Batch transcription endpoint rules: OpenAI-compatible HTTP(S), loopback may
 * use plain http, and the origin must match the realtime websocketUrl so the
 * stored API key never crosses servers (credential scope stays origin-based).
 * Empty/absent is valid — batch support is optional.
 */
export function validateVoiceInputCustomAsrBatchHttpUrl(
  batchHttpUrl: unknown,
  websocketUrl: string,
): string | null {
  if (batchHttpUrl === undefined || batchHttpUrl === null) return null;
  if (typeof batchHttpUrl !== 'string') return 'customAsr.batchHttpUrl must be a string';
  const url = batchHttpUrl.trim();
  if (!url) return null;
  if (url.length > MAX_CUSTOM_ASR_WEBSOCKET_URL_CHARS) {
    return 'customAsr.batchHttpUrl must be at most 2048 characters';
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return 'customAsr.batchHttpUrl must be a valid URL';
  }
  const loopbackHost = parsedUrl.hostname === 'localhost'
    || parsedUrl.hostname === '::1'
    || parsedUrl.hostname === '[::1]'
    || isLoopbackIpv4(parsedUrl.hostname);
  if (parsedUrl.protocol !== 'https:' && !(parsedUrl.protocol === 'http:' && loopbackHost)) {
    return 'customAsr.batchHttpUrl must use https, or http on a loopback host';
  }
  if (parsedUrl.username || parsedUrl.password) {
    return 'customAsr.batchHttpUrl must not contain credentials';
  }
  if (parsedUrl.hash) {
    return 'customAsr.batchHttpUrl must not contain a fragment';
  }
  const websocketParsed = new URL(websocketUrl);
  const normalizedWebsocketOrigin = normalizeAsrUrlScheme(websocketParsed).origin;
  const normalizedBatchOrigin = normalizeAsrUrlScheme(parsedUrl).origin;
  if (normalizedBatchOrigin !== normalizedWebsocketOrigin) {
    return 'customAsr.batchHttpUrl must share the websocketUrl origin (credential scope)';
  }
  return null;
}

/** ws/wss 与 http/https 指同一服务器时 origin 才可比:先归一到 http(s) 再比。 */
function normalizeAsrUrlScheme(url: URL): URL {
  const normalized = new URL(url.toString());
  if (normalized.protocol === 'ws:') normalized.protocol = 'http:';
  if (normalized.protocol === 'wss:') normalized.protocol = 'https:';
  return normalized;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
