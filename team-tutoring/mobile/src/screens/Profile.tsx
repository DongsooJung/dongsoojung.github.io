import { signOut } from 'firebase/auth';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '@/services/firebase';
import { tokens } from '@/theme/tokens';

export function Profile() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.background }}>
      <View style={{ flex: 1, padding: tokens.spacing.xl }}>
        <Text style={{ fontSize: tokens.font.title, fontWeight: tokens.font.weightBold, color: tokens.color.text }}>
          내 프로필
        </Text>
        <Text style={{ marginTop: tokens.spacing.sm, color: tokens.color.textMuted }}>
          {auth.currentUser?.email ?? '로그인되지 않음'}
        </Text>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => signOut(auth)}
          style={{
            borderWidth: 1,
            borderColor: tokens.color.text,
            paddingVertical: tokens.spacing.lg,
            borderRadius: tokens.radius.md,
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: tokens.font.body, fontWeight: tokens.font.weightBold, color: tokens.color.text }}>
            로그아웃
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
