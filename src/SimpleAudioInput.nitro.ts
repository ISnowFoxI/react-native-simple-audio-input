import type { HybridObject } from 'react-native-nitro-modules';
import type { AudioSessionWarning, PortDescription } from './types';

export interface SimpleAudioInput extends HybridObject<{
  ios: 'swift';
  android: 'kotlin';
}> {
  /**
   * Lists the audio inputs (mics) currently available to the session,
   * e.g. the built-in mic, a wired headset mic, or a connected USB/Bluetooth mic.
   */
  getAvailableAudioInputs(): PortDescription[];
  /**
   * Forces the session onto a specific input, e.g. an external mic instead of
   * the built-in one. Pass one of the `PortDescription`s from
   * `getAvailableAudioInputs`. Falls back to the default input and reports a
   * warning if the port can no longer be found or the switch fails.
   *
   * On Android, requires API 31+ (uses `AudioManager.setCommunicationDevice`,
   * which only accepts output/communication routes — the platform pairs the
   * matching mic automatically, and puts the session into
   * `MODE_IN_COMMUNICATION` for the routing to take effect). Only inputs with
   * a corresponding communication route are switchable (built-in mic, wired
   * headset, Bluetooth SCO/BLE, USB, line-in, hearing aid); others report a
   * warning and no-op.
   */
  setPreferredAudioInput(
    port: PortDescription,
    warningCallback: (warning: AudioSessionWarning) => void
  ): void;
  /**
   * Starts continuously reporting the input (mic) level, roughly on a 0-100
   * dB-above-noise-floor scale: silence reads ~0, full-scale reads ~100.
   * Useful for building a mic level meter. Survives route changes (e.g.
   * switching mics via `setPreferredAudioInput`), interruptions, and
   * foreground/background transitions.
   *
   * On Android, requires the `RECORD_AUDIO` permission to already be granted
   * (silently does nothing until it is) and taps the mic through a dedicated
   * `AudioRecord`, separate from `configureAudioSession`/`activate` (which
   * remain no-ops there) and from any recording happening elsewhere (e.g.
   * vision-camera) — concurrent capture support depends on the device.
   *
   * Returns a listener id to pass to `removeInputLevelListener`.
   */
  addInputLevelListener(callback: (level: number) => void): number;
  removeInputLevelListener(id: number): void;
  /**
   * Notifies on every audio route change (e.g. a mic plugged/unplugged, a
   * Bluetooth device connecting) with no payload — call
   * `getAvailableAudioInputs` again from the callback to refresh your list.
   *
   * Returns a listener id to pass to `removeRouteChangeListener`.
   */
  addRouteChangeListener(callback: () => void): number;
  removeRouteChangeListener(id: number): void;
  /**
   * Configures the underlying `AVAudioSession` category/mode/options. Throws
   * on an invalid category, mode, or incompatible category option; degraded
   * or unsupported preferences (e.g. `prefersEchoCancelledInput` pre-iOS
   * 18.2) report a warning instead of failing the whole call.
   *
   * iOS only.
   */
  configureAudioSession(
    category: string,
    mode: string,
    policy: string,
    categoryOptions: string[],
    prefersNoInterruptionFromSystemAlerts: boolean,
    prefersInterruptionOnRouteDisconnect: boolean,
    allowHapticsAndSystemSoundsDuringRecording: boolean,
    prefersEchoCancelledInput: boolean,
    warningCallback: (warning: AudioSessionWarning) => void
  ): void;
  /**
   * Activates the `AVAudioSession` (call after `configureAudioSession`).
   * Resolves even if the session was already active (emits a warning in
   * that case instead of failing).
   *
   * iOS only.
   */
  activate(
    warningCallback: (warning: AudioSessionWarning) => void
  ): Promise<void>;
}
