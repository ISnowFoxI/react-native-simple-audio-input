import { NitroModules } from 'react-native-nitro-modules';
import type { SimpleAudioInput } from './SimpleAudioInput.nitro';
import type {
  AudioSessionCategory,
  AudioSessionCompatibleCategoryOptions,
  AudioSessionCompatibleModes,
  AudioSessionConfiguration,
  AudioSessionWarning,
  EchoCancelledInputCompatibleCategories,
  PortDescription,
} from './types';

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

/**
 * Notifies on every audio route change (e.g. a mic plugged/unplugged, a
 * Bluetooth device connecting) with no payload — call
 * `getAvailableAudioInputs` again from the callback to refresh your list.
 *
 * iOS only; the callback is never invoked on Android.
 *
 * @returns a function that removes the listener.
 *
 * @example
 * ```ts
 * const unsubscribe = addRouteChangeListener(() => {
 *   setInputs(getAvailableAudioInputs());
 * });
 * ```
 */
export function addRouteChangeListener(callback: () => void): () => void {
  const listenerId =
    SimpleAudioInputHybridObject.addRouteChangeListener(callback);
  return () => {
    SimpleAudioInputHybridObject.removeRouteChangeListener(listenerId);
  };
}

/**
 * Configures the `AVAudioSession` category/mode/options. Call `activate()`
 * afterward to actually activate the session — this only configures it.
 *
 * Throws on an invalid category, mode, or a category option that's
 * incompatible with the given category. Degraded/unsupported preferences
 * (e.g. `prefersEchoCancelledInput` pre-iOS 18.2) log a warning instead of
 * throwing.
 *
 * iOS only; no-op on Android.
 *
 * @example
 * ```ts
 * configureAudio({
 *   category: 'PlayAndRecord',
 *   mode: 'VideoRecording',
 *   categoryOptions: ['AllowBluetoothHFP'],
 * });
 * await activate();
 * ```
 */
export function configureAudio<
  T extends AudioSessionCategory,
  M extends AudioSessionCompatibleModes[T],
  N extends AudioSessionCompatibleCategoryOptions[T],
  O extends EchoCancelledInputCompatibleCategories[T],
>(config: AudioSessionConfiguration<T, M, N, O>): void {
  const {
    category,
    mode = 'Default',
    policy = 'Default',
    categoryOptions = [],
    prefersNoInterruptionFromSystemAlerts = false,
    prefersInterruptionOnRouteDisconnect = false,
    allowHapticsAndSystemSoundsDuringRecording = false,
    prefersEchoCancelledInput = false,
  } = config;

  SimpleAudioInputHybridObject.configureAudioSession(
    category,
    mode,
    policy,
    categoryOptions,
    prefersNoInterruptionFromSystemAlerts,
    prefersInterruptionOnRouteDisconnect,
    allowHapticsAndSystemSoundsDuringRecording,
    !!prefersEchoCancelledInput,
    logWarning
  );
}

/**
 * Activates the `AVAudioSession` — call after `configureAudio`. Resolves
 * even if the session was already active (logs a warning in that case
 * instead of failing).
 *
 * This can be a relatively heavy operation on iOS — if you notice UI lock up
 * a little, you may want to defer it, e.g. via `setTimeout(() => activate(), 100)`.
 *
 * iOS only; resolves immediately on Android.
 */
export function activate(): Promise<void> {
  return SimpleAudioInputHybridObject.activate(logWarning);
}
