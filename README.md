# react-native-simple-audio-input

iOS mic input picking and live level metering, built for pairing with [react-native-vision-camera](https://github.com/mrousavy/react-native-vision-camera).

- List and switch between available audio inputs (built-in mic, wired headset, USB/Bluetooth mic, etc.)
- Meter the currently selected mic's input level in real time, for building a mic level indicator

Powered by [Nitro Modules](https://nitro.margelo.com/). **iOS only** — on Android these calls are safe to call but no-op (`getAvailableAudioInputs` returns `[]`, `setPreferredAudioInput` does nothing, `addInputLevelListener` never fires).

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

```tsx
import {
  getAvailableAudioInputs,
  setPreferredAudioInput,
  addInputLevelListener,
  type PortDescription,
} from 'react-native-simple-audio-input';

// List the mics currently available to the session.
const inputs: PortDescription[] = getAvailableAudioInputs();

// Force the session onto one of them.
setPreferredAudioInput(inputs[0]);

// Get continuous mic level updates, roughly on a 0-100 scale.
const unsubscribe = addInputLevelListener((level) => {
  console.log('mic level', level);
});

// later, e.g. on unmount
unsubscribe();
```

See [example/src/App.tsx](example/src/App.tsx) for a full input picker + live level meter demo.

### API

| Function | Description |
| --- | --- |
| `getAvailableAudioInputs(): PortDescription[]` | Lists the audio inputs currently available to the session. |
| `setPreferredAudioInput(port: PortDescription): void` | Switches the session to the given input. Falls back to the default input and logs a warning if the port can't be found or the switch fails. |
| `addInputLevelListener(callback: (level: number) => void): () => void` | Starts reporting the input level of whatever mic is currently active (survives route changes, interruptions, and foreground/background transitions). Returns an unsubscribe function. |

### Types

- `PortDescription` — `{ portName, portType, uid, channels?, isDataSourceSupported?, selectedDataSourceId? }`
- `PortType` — `InputPort | InputOutputPort` (e.g. `'BuiltInMic'`, `'HeadsetMic'`, `'USBAudio'`, `'BluetoothHFP'`)
- `AudioSessionWarning` — `{ name, message }`, logged via `console.warn` when `setPreferredAudioInput` falls back to the default input

## Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
