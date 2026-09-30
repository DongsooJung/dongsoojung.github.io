import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { HomeMap } from '@/screens/HomeMap';
import { NearbyList } from '@/screens/NearbyList';
import { Profile } from '@/screens/Profile';
import { tokens } from '@/theme/tokens';

export type MainTabsParamList = {
  Map: undefined;
  Nearby: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabsParamList>();

export function BottomTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: tokens.color.text,
        tabBarInactiveTintColor: tokens.color.textMuted,
        tabBarStyle: {
          borderTopColor: tokens.color.border,
          backgroundColor: tokens.color.background,
        },
        headerStyle: { backgroundColor: tokens.color.background },
        headerTitleStyle: { color: tokens.color.text },
      }}
    >
      <Tab.Screen name="Map" component={HomeMap} />
      <Tab.Screen name="Nearby" component={NearbyList} />
      <Tab.Screen name="Profile" component={Profile} />
    </Tab.Navigator>
  );
}
