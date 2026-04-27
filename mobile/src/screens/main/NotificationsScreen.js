import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing, radius, font, shadow } from '../../theme';
import { get } from '../../api';

import { useAuth } from '../../AuthContext';

const ICON_MAP = {
  like:    '❤️',
  comment: '💬',
  vibe:    '🎵',
  story:   '📖',
  default: '🔔',
};

export default function NotificationsScreen({ navigation }) {
  const { user }                  = useAuth();
  const [notifs, setNotifs]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res  = await get('/api/notifications_history');
      const data = await res.json();
      setNotifs(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const handlePress = (item) => {
    const t = item.type || '';
    const msg = item.message || '';
    
    // Extract hidden Post ID if present
    const postMatch = msg.match(/\[POST:(\d+)\]/);
    const postId = postMatch ? parseInt(postMatch[1], 10) : null;

    if (t === 'post_comment' && postId) {
      navigation.navigate('Posts', { targetPostId: postId, openComments: true });
    } else if (t.includes('vibe') || t === 'post') {
      navigation.navigate('Explore', { screen: 'UserProfile', params: { username: item.actor } });
    } else if (t.includes('story') || t.includes('like')) {
      navigation.navigate('Explore', { screen: 'StoryViewer', params: { targetUsername: user?.username, stories: [] } });
    } else if (t.includes('message') || t.includes('reply') || t.includes('comment')) {
      navigation.navigate('Chat', { screen: 'Conversation', params: { username: item.actor } });
    } else {
      navigation.navigate('Explore', { screen: 'UserProfile', params: { username: item.actor } });
    }
  };

  if (loading) return <View style={s.center}><ActivityIndicator color={colors.accent} size="large" /></View>;

  return (
    <SafeAreaView style={s.flex} edges={['top']}>
      <StatusBar style="light" />
      <View style={s.header}><Text style={s.title}>Notifications</Text></View>
      <FlatList
        data={notifs}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={{ padding: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListEmptyComponent={<Text style={s.empty}>All caught up! 🎉</Text>}
        renderItem={({ item }) => {
          const icon = ICON_MAP[item.type] || ICON_MAP.default;
          const date = new Date(item.created_at);
          const displayMessage = (item.message || '').replace(/ \[POST:\d+\]/g, '');
          
          return (
            <TouchableOpacity 
              style={[s.row, shadow.card]}
              onPress={() => handlePress(item)}
              activeOpacity={0.8}
            >
              <View style={s.iconCircle}><Text style={{ fontSize: 20 }}>{icon}</Text></View>
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text style={s.msg}>{displayMessage}</Text>
                <Text style={s.time}>{date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex:       { flex: 1, backgroundColor: colors.bg },
  center:     { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  header:     { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  title:      { color: colors.white, fontSize: font.xl, fontWeight: '800' },
  row:        { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  iconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  msg:        { color: colors.text, fontSize: font.md, lineHeight: 20 },
  time:       { color: colors.textMuted, fontSize: font.xs, marginTop: 4 },
  empty:      { color: colors.textMuted, textAlign: 'center', marginTop: spacing.xxl, fontSize: font.md },
});
