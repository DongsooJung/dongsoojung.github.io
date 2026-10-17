import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GoogleSignInButton } from '@/screens/Auth/GoogleSignInButton';
import { tokens } from '@/theme/tokens';

export function SignIn() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.background }}>
      <View style={{ flex: 1, padding: tokens.spacing.xl, justifyContent: 'center' }}>
        <Text style={{ fontSize: tokens.font.title, fontWeight: tokens.font.weightBold, color: tokens.color.text }}>
          로그인
        </Text>
        <Text style={{ marginTop: tokens.spacing.sm, fontSize: tokens.font.body, color: tokens.color.textMuted }}>
          Google 계정으로 계속하기
        </Text>
        <View style={{ marginTop: tokens.spacing.xl }}>
          <GoogleSignInButton />
        </View>
      </View>
    </SafeAreaView>
  );
}
