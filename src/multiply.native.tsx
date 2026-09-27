import { NitroModules } from 'react-native-nitro-modules';
import type { SimpleAudioConfig } from './SimpleAudioConfig.nitro';

const SimpleAudioConfigHybridObject =
  NitroModules.createHybridObject<SimpleAudioConfig>('SimpleAudioConfig');

export function multiply(a: number, b: number): number {
  return SimpleAudioConfigHybridObject.multiply(a, b);
}
