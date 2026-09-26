import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { Alert, Pressable, Text } from 'react-native';
import { auth, googleSignInWebClientId } from '@/services/firebase';
import { tokens } from '@/theme/tokens';

export function GoogleSignInButton() {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (googleSignInWebClientId) {
      GoogleSignin.configure({ webClientId: googleSignInWebClientId });
    }
  }, []);

  const handlePress = async () => {
    setLoading(true);
    try {
      await GoogleSignin.hasPlayServices();
      const result = await GoogleSignin.signIn();
      const idToken = result.data?.idToken ?? null;
      if (!idToken) throw new Error('No idToken from Google Sign-In');
      const credential = GoogleAuthProvider.credential(idToken);
      await signInWithCredential(auth, credential);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === statusCodes.SIGN_IN_CANCELLED) return;
      Alert.alert('로그인 실패', code ?? String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={loading}
      style={{
        borderWidth: 1,
        borderColor: tokens.color.text,
        paddingVertical: tokens.spacing.lg,
        borderRadius: tokens.radius.md,
        alignItems: 'center',
        opacity: loading ? 0.5 : 1,
      }}
    >
      <Text style={{ fontSize: tokens.font.body, fontWeight: tokens.font.weightBold, color: tokens.color.text }}>
        {loading ? '로그인 중...' : 'Google로 계속하기'}
      </Text>
    </Pressable>
  );
}
