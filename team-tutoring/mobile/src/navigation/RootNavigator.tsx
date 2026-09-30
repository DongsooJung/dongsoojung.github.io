import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Onboarding } from '@/screens/Onboarding';
import { SignIn } from '@/screens/Auth/SignIn';
import { BottomTabs } from '@/navigation/BottomTabs';

export type RootStackParamList = {
  Onboarding: undefined;
  SignIn: undefined;
  Main: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const [isAuthed] = useState(false);

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isAuthed ? (
        <Stack.Screen name="Main" component={BottomTabs} />
      ) : (
        <>
          <Stack.Screen name="Onboarding" component={Onboarding} />
          <Stack.Screen name="SignIn" component={SignIn} />
        </>
      )}
    </Stack.Navigator>
  );
}
