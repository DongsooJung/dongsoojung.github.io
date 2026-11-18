import { FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tokens } from '@/theme/tokens';

type ClassPreview = {
  id: string;
  title: string;
  subject: string;
  pricePerSession: number;
  distanceMeters: number;
};

const PLACEHOLDER: ClassPreview[] = [];

export function NearbyList() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.background }}>
      <FlatList
        data={PLACEHOLDER}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View
            style={{
              padding: tokens.spacing.lg,
              borderBottomWidth: 1,
              borderBottomColor: tokens.color.border,
            }}
          >
            <Text style={{ fontSize: tokens.font.title, fontWeight: tokens.font.weightBold, color: tokens.color.text }}>
              {item.title}
            </Text>
            <Text style={{ marginTop: tokens.spacing.xs, color: tokens.color.textMuted }}>
              {item.subject} · {item.pricePerSession.toLocaleString()}원 · {item.distanceMeters}m
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={{ padding: tokens.spacing.xxl, alignItems: 'center' }}>
            <Text style={{ color: tokens.color.textMuted }}>주변에 모집 중인 수업이 없어요</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}
