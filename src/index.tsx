import { NitroModules } from 'react-native-nitro-modules';
import type { SimpleAudioInput } from './SimpleAudioInput.nitro';
import type { AudioSessionWarning, PortDescription } from './types';

export * from './types';

const SimpleAudioInputHybridObject =
  NitroModules.createHybridObject<SimpleAudioInput>('SimpleAudioInput');

function logWarning(warning: AudioSessionWarning): void {
  console.warn(
    `[react-native-simple-audio-input] ${warning.name}: ${warning.message}`
  );
}

/**
 * Lists the audio inputs (mics) currently available to the session, e.g. the
 * built-in mic, a wired headset mic, or a connected USB/Bluetooth mic.
 *
 * iOS only; returns an empty array on Android.
 */
export function getAvailableAudioInputs(): PortDescription[] {
  return SimpleAudioInputHybridObject.getAvailableAudioInputs();
}

/**
 * Forces the session onto a specific input, e.g. an external mic instead of
 * the built-in one. Pass one of the `PortDescription`s from
 * `getAvailableAudioInputs`.
 *
 * iOS only; no-op on Android.
 */
export function setPreferredAudioInput(port: PortDescription): void {
  SimpleAudioInputHybridObject.setPreferredAudioInput(port, logWarning);
}

/**
 * Starts continuously reporting the input (mic) level, roughly on a 0-100
 * dB-above-noise-floor scale: silence reads ~0, full-scale reads ~100. Useful
 * for building a mic level meter. Survives route changes (e.g. switching mics
 * via `setPreferredAudioInput`), interruptions, and foreground/background
 * transitions.
 *
 * iOS only; the callback is never invoked on Android.
 *
 * @returns a function that removes the listener.
 *
 * @example
 * ```ts
 * const unsubscribe = addInputLevelListener((level) => setLevel(level));
 * // later
 * unsubscribe();
 * ```
 */
export function addInputLevelListener(
  callback: (level: number) => void
): () => void {
  const listenerId =
    SimpleAudioInputHybridObject.addInputLevelListener(callback);
  return () => {
    SimpleAudioInputHybridObject.removeInputLevelListener(listenerId);
  };
}
