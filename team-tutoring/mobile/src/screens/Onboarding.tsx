import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { tokens } from '@/theme/tokens';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Onboarding'>;

export function Onboarding() {
  const nav = useNavigation<Nav>();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.background }}>
      <View style={{ flex: 1, padding: tokens.spacing.xl, justifyContent: 'space-between' }}>
        <View style={{ marginTop: tokens.spacing.xxl * 2 }}>
          <Text style={{ fontSize: tokens.font.heading, fontWeight: tokens.font.weightBold, color: tokens.color.text }}>
            강남 그룹 과외
          </Text>
          <Text style={{ marginTop: tokens.spacing.md, fontSize: tokens.font.body, color: tokens.color.textMuted }}>
            대치동 중심, 내 주변 그룹 과외를 지도로 탐색하세요.
          </Text>
        </View>
        <Pressable
          onPress={() => nav.navigate('SignIn')}
          style={{
            borderWidth: 1,
            borderColor: tokens.color.text,
            paddingVertical: tokens.spacing.lg,
            borderRadius: tokens.radius.md,
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: tokens.font.body, fontWeight: tokens.font.weightBold, color: tokens.color.text }}>
            시작하기
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
