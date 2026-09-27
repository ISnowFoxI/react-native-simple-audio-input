import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  activate,
  addInputLevelListener,
  addRouteChangeListener,
  configureAudio,
  getAvailableAudioInputs,
  setPreferredAudioInput,
  type PortDescription,
} from 'react-native-simple-audio-input';

export default function App() {
  const [inputs, setInputs] = useState<PortDescription[]>([]);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [level, setLevel] = useState(0);

  useEffect(() => {
    // Recording needs a record-capable category before inputs/mics can be
    // enumerated or metered — configure it once, then activate.
    configureAudio({
      category: 'PlayAndRecord',
      mode: 'VideoRecording',
      categoryOptions: ['AllowBluetoothHFP'],
    });
    activate();

    setInputs(getAvailableAudioInputs());
    // Refresh the list whenever the route changes (e.g. a mic is
    // plugged/unplugged or a Bluetooth device connects).
    return addRouteChangeListener(() => {
      setInputs(getAvailableAudioInputs());
    });
  }, []);

  useEffect(() => addInputLevelListener(setLevel), []);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Mic level</Text>
      <View style={styles.meterTrack}>
        <View
          style={[styles.meterFill, { width: `${Math.min(level, 100)}%` }]}
        />
      </View>

      <Text style={styles.header}>Available inputs</Text>
      <FlatList
        data={inputs}
        keyExtractor={(item) => item.uid}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => {
              setPreferredAudioInput(item);
              setSelectedUid(item.uid);
            }}
          >
            <Text style={styles.rowText}>
              {item.portName} ({item.portType})
              {selectedUid === item.uid ? ' ✓' : ''}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  header: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  meterTrack: {
    height: 12,
    borderRadius: 6,
    backgroundColor: '#e0e0e0',
    overflow: 'hidden',
    marginBottom: 24,
  },
  meterFill: {
    height: '100%',
    backgroundColor: '#4caf50',
  },
  row: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  rowText: {
    fontSize: 15,
  },
});
