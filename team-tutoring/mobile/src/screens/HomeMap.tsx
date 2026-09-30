import { StyleSheet, View } from 'react-native';
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';
import { tokens } from '@/theme/tokens';

const DAECHI = { latitude: 37.4956, longitude: 127.0623 };

export function HomeMap() {
  return (
    <View style={styles.container}>
      <MapView
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          ...DAECHI,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.color.background,
  },
});
