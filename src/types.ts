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
