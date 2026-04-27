import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

import ExploreScreen        from '../screens/main/ExploreScreen';
import PostsScreen          from '../screens/main/PostsScreen';
import ChatScreen           from '../screens/main/ChatScreen';
import ConversationScreen   from '../screens/main/ConversationScreen';
import NotificationsScreen  from '../screens/main/NotificationsScreen';
import ProfileScreen        from '../screens/main/ProfileScreen';
import SearchScreen         from '../screens/main/SearchScreen';
import UserProfileScreen    from '../screens/main/UserProfileScreen';
import StoryViewerScreen    from '../screens/main/StoryViewerScreen';
import ConnectionsScreen    from '../screens/main/ConnectionsScreen';

const Tab   = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// ─── Nested Stack for Explore tab ───────────────────────────────────────────
function ExploreStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ExploreHome"  component={ExploreScreen} />
      <Stack.Screen name="UserProfile"  component={UserProfileScreen} />
      <Stack.Screen name="StoryViewer"  component={StoryViewerScreen} />
      <Stack.Screen name="Search"       component={SearchScreen} />
    </Stack.Navigator>
  );
}

// ─── Nested Stack for Chat tab ───────────────────────────────────────────────
function ChatStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ChatList"      component={ChatScreen} />
      <Stack.Screen name="Conversation"  component={ConversationScreen} />
    </Stack.Navigator>
  );
}

// ─── Nested Stack for Profile tab ───────────────────────────────────────────
function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProfileHome"  component={ProfileScreen} />
      <Stack.Screen name="Connections"  component={ConnectionsScreen} />
    </Stack.Navigator>
  );
}

// ─── Bottom Tabs ─────────────────────────────────────────────────────────────
export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor:  colors.border,
          borderTopWidth:  1,
          height: 60,
          paddingBottom: 8,
        },
        tabBarActiveTintColor:   colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        tabBarIcon: ({ color, size }) => {
          const icons = {
            Explore:       'compass',
            Posts:         'images',
            Chat:          'chatbubbles',
            Notifications: 'notifications',
            Profile:       'person',
          };
          return <Ionicons name={icons[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Explore"       component={ExploreStack} />
      <Tab.Screen name="Posts"         component={PostsScreen} />
      <Tab.Screen name="Chat"          component={ChatStack} />
      <Tab.Screen name="Notifications" component={NotificationsScreen} />
      <Tab.Screen name="Profile"       component={ProfileStack} />
    </Tab.Navigator>
  );
}
