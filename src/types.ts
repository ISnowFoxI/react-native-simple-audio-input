/**
 * Input ports for receiving audio from various sources.
 */
export const InputPort = {
  /**
   * An input from a device's built-in microphone.
   */
  BuiltInMic: 'BuiltInMic',
  /**
   * An input from a Continuity Microphone on Apple TV.
   */
  ContinuityMicrophone: 'ContinuityMicrophone',
  /**
   * An input from a wired headset's built-in microphone.
   */
  HeadsetMic: 'HeadsetMic',
  /**
   * A line-level input from the dock connector.
   */
  LineIn: 'LineIn',
} as const;

/**
 * Input/Output ports for bidirectional audio connections. These can also be
 * used as an audio input (e.g. a USB or Bluetooth headset mic).
 */
export const InputOutputPort = {
  /**
   * An I/O connection to an Audio Video Bridging (AVB) device.
   */
  AVB: 'AVB',
  /**
   * An I/O connection to a Peripheral Component Interconnect (PCI) device.
   */
  PCI: 'PCI',
  /**
   * An I/O connection to a Bluetooth Hands-Free Profile device.
   */
  BluetoothHFP: 'BluetoothHFP',
  /**
   * An I/O connection through Car Audio.
   */
  CarAudio: 'CarAudio',
  /**
   * An I/O connection to a DisplayPort device.
   */
  DisplayPort: 'DisplayPort',
  /**
   * An I/O connection to a FireWire device.
   */
  FireWire: 'FireWire',
  /**
   * An I/O connection to a Thunderbolt device.
   */
  Thunderbolt: 'Thunderbolt',
  /**
   * An I/O connection to a Universal Serial Bus (USB) device.
   */
  USBAudio: 'USBAudio',
  /**
   * An I/O connection that doesn't correspond to physical audio hardware.
   */
  Virtual: 'Virtual',
  /**
   * The device type is unknown.
   */
  Unknown: 'Unknown',
} as const;

export type InputPort = (typeof InputPort)[keyof typeof InputPort];
export type InputOutputPort =
  (typeof InputOutputPort)[keyof typeof InputOutputPort];

export type PortType = InputPort | InputOutputPort;

export type PortDescription = {
  portName: string;
  portType: PortType;
  uid: string;
  channels?: number[];
  isDataSourceSupported?: boolean;
  selectedDataSourceId?: string;
};

export interface AudioSessionWarning {
  name: string;
  message: string;
}

/**
 * Categories for the underlying `AVAudioSession`. See Apple's documentation
 * for `AVAudioSession.Category` for the full behavioral details of each.
 */
export const AudioSessionCategory = {
  /**
   * Appropriate for "play-along" apps. Audio from other apps mixes with
   * yours (`MixWithOthers` is implied). Silenced by the ring/silent switch
   * and screen locking.
   *
   * Compatible modes: `Default`, `SpokenAudio`.
   * Compatible category options: `MixWithOthers`, `AllowBluetoothA2DP`.
   */
  Ambient: 'Ambient',
  /**
   * Silenced by the ring/silent switch and screen locking. Nonmixable by
   * default — activating your session interrupts other nonmixable sessions.
   *
   * Compatible modes: `Default`, `SpokenAudio`.
   * Compatible category options: `AllowBluetoothA2DP` (set by default).
   */
  SoloAmbient: 'SoloAmbient',
  /**
   * Continues with the screen locked / ring switch silenced. Nonmixable by
   * default; use the `MixWithOthers` option to allow mixing.
   *
   * Compatible modes: `Default`, `MoviePlayback`, `SpokenAudio`, `Measurement`.
   * Compatible category options: `MixWithOthers`, `DuckOthers`,
   * `InterruptSpokenAudioAndMixWithOthers`, `AllowBluetoothA2DP` (set by default).
   */
  Playback: 'Playback',
  /**
   * Appropriate for simultaneous recording and playback (or either on its
   * own). Requires microphone permission. Nonmixable by default; use the
   * `MixWithOthers` option to allow mixing.
   *
   * Compatible modes: `Default`, `SpokenAudio`, `Measurement`, `VoiceChat`,
   * `VideoChat`, `GameChat`, `VideoRecording`.
   * Compatible category options: `MixWithOthers`, `DuckOthers`,
   * `InterruptSpokenAudioAndMixWithOthers`, `AllowBluetoothHFP`,
   * `AllowBluetoothA2DP` (set by default), `AllowAirPlay`, `DefaultToSpeaker`,
   * `OverrideMutedMicrophoneInterruption`.
   */
  PlayAndRecord: 'PlayAndRecord',
  /**
   * Silences virtually all system output while the session is active.
   * Requires microphone permission.
   *
   * Compatible modes: `Default`, `SpokenAudio`, `Measurement`,
   * `VideoRecording`, `VideoChat`.
   * Compatible category options: `MixWithOthers`, `DuckOthers`,
   * `InterruptSpokenAudioAndMixWithOthers`, `AllowBluetoothA2DP`.
   */
  Record: 'Record',
  /**
   * Routes audio to multiple outputs simultaneously (e.g. a USB device and
   * headphones). Requires observing route-change notifications and
   * reconfiguring as needed.
   *
   * Compatible modes: `Default`, `SpokenAudio`.
   * Compatible category options: `MixWithOthers`, `DuckOthers`,
   * `InterruptSpokenAudioAndMixWithOthers`.
   */
  MultiRoute: 'MultiRoute',
} as const;

export type AudioSessionCategory =
  (typeof AudioSessionCategory)[keyof typeof AudioSessionCategory];

/**
 * Modes further tune the audio session's behavior on top of its category.
 */
export const AudioSessionMode = {
  /** No specific optimizations. Valid with every category. */
  Default: 'Default',
  /**
   * For VoIP apps using `PlayAndRecord`. Optimizes tonal equalization for
   * voice and implicitly enables `AllowBluetoothHFP`.
   */
  VoiceChat: 'VoiceChat',
  /**
   * For video chat apps using `PlayAndRecord` or `Record`. Optimizes tonal
   * equalization for voice and implicitly enables `AllowBluetoothHFP`.
   */
  VideoChat: 'VideoChat',
  /** Only valid with `PlayAndRecord`; set implicitly by GameKit voice chat. */
  GameChat: 'GameChat',
  /**
   * For `Record`/`PlayAndRecord`. On devices with more than one built-in
   * mic, uses the mic closest to the camera.
   */
  VideoRecording: 'VideoRecording',
  /**
   * Minimizes system-supplied signal processing. Valid with `Playback`,
   * `Record`, or `PlayAndRecord`.
   */
  Measurement: 'Measurement',
  /** Enhances movie playback. Only valid with `Playback`. */
  MoviePlayback: 'MoviePlayback',
  /**
   * For continuous spoken audio (podcasts, audiobooks) — your audio pauses
   * rather than ducks when another app plays a spoken audio prompt.
   */
  SpokenAudio: 'SpokenAudio',
  /**
   * For apps like turn-by-turn navigation that play short prompts, allowing
   * different routing behavior for devices like CarPlay.
   */
  VoicePrompt: 'VoicePrompt',
} as const;

export type AudioSessionMode =
  (typeof AudioSessionMode)[keyof typeof AudioSessionMode];

/**
 * How this session's route is shared with the system / other apps.
 */
export const AudioSessionRouteSharingPolicy = {
  /** Standard routing rules. */
  Default: 'Default',
  /** For long-form audio (music, audiobooks) — shares output with Music/Podcasts. */
  LongFormAudio: 'LongFormAudio',
  /** For long-form video — shares output with other long-form video apps. */
  LongFormVideo: 'LongFormVideo',
  /** Set by the system when the user picks a wireless video route; don't set directly. */
  Independent: 'Independent',
} as const;

export type AudioSessionRouteSharingPolicy =
  (typeof AudioSessionRouteSharingPolicy)[keyof typeof AudioSessionRouteSharingPolicy];

/**
 * Category options that modify how a category behaves. Which ones are
 * valid depends on the category — see `AudioSessionCompatibleCategoryOptions`.
 */
export const AudioSessionCategoryOptions = {
  /** Mix with audio from other, currently active sessions. */
  MixWithOthers: 'MixWithOthers',
  /** Reduce the volume of other sessions while this one plays. Implies `MixWithOthers`. */
  DuckOthers: 'DuckOthers',
  /** Pause (rather than duck) spoken-audio sessions while this one plays. Implies `MixWithOthers`. */
  InterruptSpokenAudioAndMixWithOthers: 'InterruptSpokenAudioAndMixWithOthers',
  /** Allow routing to/from a paired Bluetooth Hands-Free Profile (HFP) device. */
  AllowBluetoothHFP: 'AllowBluetoothHFP',
  /** Allow streaming to Bluetooth A2DP devices. */
  AllowBluetoothA2DP: 'AllowBluetoothA2DP',
  /** Allow routing output to AirPlay devices. */
  AllowAirPlay: 'AllowAirPlay',
  /** Always route to the speaker instead of the receiver, even with headphones/Bluetooth in use. */
  DefaultToSpeaker: 'DefaultToSpeaker',
  /** Don't interrupt the session when the system mutes the built-in mic (e.g. iPad Smart Folio closed). */
  OverrideMutedMicrophoneInterruption: 'OverrideMutedMicrophoneInterruption',
} as const;

export type AudioSessionCategoryOptions =
  (typeof AudioSessionCategoryOptions)[keyof typeof AudioSessionCategoryOptions];

/** Which `AudioSessionMode`s are valid for each `AudioSessionCategory`. */
export type AudioSessionCompatibleModes = {
  Ambient: 'Default' | 'SpokenAudio';
  SoloAmbient: 'Default' | 'SpokenAudio';
  Playback: 'Default' | 'MoviePlayback' | 'SpokenAudio' | 'Measurement';
  Record:
    'Default' | 'VideoRecording' | 'VideoChat' | 'Measurement' | 'SpokenAudio';
  PlayAndRecord:
    | 'Default'
    | 'Measurement'
    | 'SpokenAudio'
    | 'VoiceChat'
    | 'VideoChat'
    | 'GameChat'
    | 'VideoRecording'
    | 'VoicePrompt';
  MultiRoute: 'Default' | 'SpokenAudio';
};

/** Which `AudioSessionCategoryOptions` are valid for each `AudioSessionCategory`. */
export type AudioSessionCompatibleCategoryOptions = {
  Ambient: 'MixWithOthers';
  SoloAmbient: never;
  Playback:
    'MixWithOthers' | 'DuckOthers' | 'InterruptSpokenAudioAndMixWithOthers';
  Record: 'AllowBluetoothHFP';
  PlayAndRecord:
    | 'MixWithOthers'
    | 'DuckOthers'
    | 'InterruptSpokenAudioAndMixWithOthers'
    | 'AllowBluetoothHFP'
    | 'AllowBluetoothA2DP'
    | 'AllowAirPlay'
    | 'DefaultToSpeaker'
    | 'OverrideMutedMicrophoneInterruption';
  MultiRoute:
    'MixWithOthers' | 'DuckOthers' | 'InterruptSpokenAudioAndMixWithOthers';
};

/**
 * Only `PlayAndRecord` supports `prefersEchoCancelledInput` (iOS 18.2+, and
 * only with `Default` mode and hardware support — see `configureAudio`).
 */
export type EchoCancelledInputCompatibleCategories = {
  Ambient: false;
  SoloAmbient: false;
  Playback: false;
  Record: false;
  MultiRoute: false;
  PlayAndRecord: true;
};

/**
 * The `AVAudioSession` configuration to apply via `configureAudio`. Generic
 * over the category so `mode`/`categoryOptions`/`prefersEchoCancelledInput`
 * are constrained to values actually compatible with it.
 */
export type AudioSessionConfiguration<
  T extends AudioSessionCategory,
  M extends AudioSessionCompatibleModes[T],
  N extends AudioSessionCompatibleCategoryOptions[T],
  O extends EchoCancelledInputCompatibleCategories[T],
> = {
  category: T;
  mode?: M;
  policy?: AudioSessionRouteSharingPolicy;
  categoryOptions?: N[];
  prefersNoInterruptionFromSystemAlerts?: boolean;
  prefersInterruptionOnRouteDisconnect?: boolean;
  allowHapticsAndSystemSoundsDuringRecording?: boolean;
  prefersEchoCancelledInput?: O;
};
