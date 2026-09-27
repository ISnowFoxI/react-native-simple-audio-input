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
   * iOS only.
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
   * iOS only; returns a listener id to pass to `removeInputLevelListener`.
   */
  addInputLevelListener(callback: (level: number) => void): number;
  removeInputLevelListener(id: number): void;
}
