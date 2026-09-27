# react-native-simple-audio-input

iOS mic input picking and live level metering, built for pairing with [react-native-vision-camera](https://github.com/mrousavy/react-native-vision-camera).

- Configure and activate the `AVAudioSession` for recording
- List and switch between available audio inputs (built-in mic, wired headset, USB/Bluetooth mic, etc.)
- Meter the currently selected mic's input level in real time, for building a mic level indicator

Powered by [Nitro Modules](https://nitro.margelo.com/). **iOS only** — on Android these calls are safe to call but no-op (`getAvailableAudioInputs` returns `[]`, `configureAudio`/`setPreferredAudioInput` do nothing, `activate` resolves immediately, listeners never fire).

## Installation

```sh
npm install react-native-simple-audio-input react-native-nitro-modules
```

`react-native-nitro-modules` is required as this library relies on [Nitro Modules](https://nitro.margelo.com/).

Add a microphone usage description to your iOS `Info.plist` (required for metering, since it taps the mic via `AVAudioEngine`):

```xml
<key>NSMicrophoneUsageDescription</key>
<string>This app needs microphone access to show the input level meter.</string>
```

## Usage

> `getAvailableAudioInputs` only enumerates inputs once the session is in a record-capable category (e.g. `PlayAndRecord`) — call `configureAudio` + `activate` first, as below.

```tsx
import {
  configureAudio,
  activate,
  getAvailableAudioInputs,
  setPreferredAudioInput,
  addInputLevelListener,
  addRouteChangeListener,
  type PortDescription,
} from 'react-native-simple-audio-input';

// Configure the session for recording, then activate it.
configureAudio({
  category: 'PlayAndRecord',
  mode: 'VideoRecording',
  categoryOptions: ['AllowBluetoothHFP'],
});
await activate();

// List the mics currently available to the session.
const inputs: PortDescription[] = getAvailableAudioInputs();

// Force the session onto one of them.
setPreferredAudioInput(inputs[0]);

// Get continuous mic level updates, roughly on a 0-100 scale.
const unsubscribeLevel = addInputLevelListener((level) => {
  console.log('mic level', level);
});

// Refresh your input list when the route changes (mic plugged/unplugged, etc).
const unsubscribeRoute = addRouteChangeListener(() => {
  console.log('available inputs', getAvailableAudioInputs());
});

// later, e.g. on unmount
unsubscribeLevel();
unsubscribeRoute();
```

See [example/src/App.tsx](example/src/App.tsx) for a full input picker + live level meter demo.

### API

| Function | Description |
| --- | --- |
| `configureAudio(config: AudioSessionConfiguration): void` | Configures the `AVAudioSession` category/mode/options. Throws on an invalid category, mode, or an incompatible category option; degraded/unsupported preferences log a warning instead. |
| `activate(): Promise<void>` | Activates the session (call after `configureAudio`). Resolves even if already active (logs a warning in that case). |
| `getAvailableAudioInputs(): PortDescription[]` | Lists the audio inputs currently available to the session. |
| `setPreferredAudioInput(port: PortDescription): void` | Switches the session to the given input. Falls back to the default input and logs a warning if the port can't be found or the switch fails. |
| `addInputLevelListener(callback: (level: number) => void): () => void` | Starts reporting the input level of whatever mic is currently active (survives route changes, interruptions, and foreground/background transitions). Returns an unsubscribe function. |
| `addRouteChangeListener(callback: () => void): () => void` | Notifies on every audio route change (mic plugged/unplugged, Bluetooth connect, etc), with no payload — call `getAvailableAudioInputs` again from the callback to refresh your list. Returns an unsubscribe function. |

### Types

- `PortDescription` — `{ portName, portType, uid, channels?, isDataSourceSupported?, selectedDataSourceId? }`
- `PortType` — `InputPort | InputOutputPort` (e.g. `'BuiltInMic'`, `'HeadsetMic'`, `'USBAudio'`, `'BluetoothHFP'`)
- `AudioSessionConfiguration` — `{ category, mode?, policy?, categoryOptions?, prefersNoInterruptionFromSystemAlerts?, prefersInterruptionOnRouteDisconnect?, allowHapticsAndSystemSoundsDuringRecording?, prefersEchoCancelledInput? }`. `mode`/`categoryOptions`/`prefersEchoCancelledInput` are constrained by TypeScript generics to values actually compatible with the given `category` (see `AudioSessionCompatibleModes`/`AudioSessionCompatibleCategoryOptions`/`EchoCancelledInputCompatibleCategories`).
- `AudioSessionCategory`, `AudioSessionMode`, `AudioSessionCategoryOptions`, `AudioSessionRouteSharingPolicy` — string-literal enums mirroring `AVAudioSession.Category`/`.Mode`/`.CategoryOptions`/`.RouteSharingPolicy`
- `AudioSessionWarning` — `{ name, message }`, logged via `console.warn` for non-fatal issues (e.g. an unsupported preference, or `setPreferredAudioInput` falling back to the default input)

## Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
