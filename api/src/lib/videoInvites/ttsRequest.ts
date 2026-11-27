// Pure parts of the narrator TTS (no env, no R2), so tests can import them.

/** One fixed warm narrator voice; TTS_VOICE overrides. */
export const DEFAULT_TTS_VOICE = "en-US-Studio-O";

export function ttsVoice(): string {
  return process.env.TTS_VOICE || DEFAULT_TTS_VOICE;
}

/** The Google voice name's language code ("en-US-Studio-O" -> "en-US"). */
export function voiceLanguage(voice: string): string {
  const m = /^([a-z]{2,3}-[A-Z]{2})-/.exec(voice);
  return m ? m[1] : "en-US";
}

/** The Cloud Text-to-Speech texts:synthesize request body. */
export function googleTtsBody(text: string, voice: string) {
  return {
    input: { text },
    voice: { languageCode: voiceLanguage(voice), name: voice },
    audioConfig: { audioEncoding: "MP3", speakingRate: 1.0, sampleRateHertz: 48000 },
  };
}
