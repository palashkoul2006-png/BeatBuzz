import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, radius, font, shadow } from '../../theme';
import { get } from '../../api';
import Avatar from '../../components/Avatar';

export default function ChatScreen({ navigation }) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [refreshing, setRefreshing]       = useState(false);

  const load = useCallback(async () => {
    try {
      const res  = await get('/api/chats');
      const data = await res.json();
      setConversations(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) return <View style={s.center}><ActivityIndicator color={colors.accent} size="large" /></View>;

  return (
    <SafeAreaView style={s.flex} edges={['top']}>
      <StatusBar style="light" />
      <View style={s.header}>
        <Text style={s.title}>Messages</Text>
      </View>
      <FlatList
        data={conversations}
        keyExtractor={i => String(i.other_username)}
        contentContainerStyle={{ padding: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListEmptyComponent={<Text style={s.empty}>No conversations yet. Start a vibe! 🎵</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[s.row, shadow.card]}
            onPress={() => navigation.navigate('Conversation', { username: item.other_username, fullName: item.full_name })}
            activeOpacity={0.8}
          >
            <View style={s.avatarWrap}>
              <Avatar username={item.other_username} size={50} />
              {item.online && <View style={s.onlineDot} />}
            </View>
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={s.name}>{item.full_name || item.other_username}</Text>
              <Text style={s.preview} numberOfLines={1}>{item.last_text || 'Start a conversation'}</Text>
            </View>
            {item.unread_count > 0 && (
              <View style={s.badge}><Text style={s.badgeText}>{item.unread_count}</Text></View>
            )}
          </TouchableOpacity>
        )}
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
  avatarWrap: { position: 'relative' },
  onlineDot:  { position: 'absolute', bottom: 2, right: 2, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.success, borderWidth: 2, borderColor: colors.surface },
  name:       { color: colors.white, fontWeight: '700', fontSize: font.md },
  preview:    { color: colors.textMuted, fontSize: font.sm, marginTop: 2 },
  badge:      { backgroundColor: colors.accent, borderRadius: radius.full, minWidth: 22, height: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText:  { color: colors.white, fontSize: 11, fontWeight: '700' },
  empty:      { color: colors.textMuted, textAlign: 'center', marginTop: spacing.xxl, fontSize: font.md },
});
