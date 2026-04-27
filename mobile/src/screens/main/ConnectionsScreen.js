import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing, radius, font, shadow } from '../../theme';
import { get, api } from '../../api';
import Avatar from '../../components/Avatar';

export default function ConnectionsScreen({ navigation }) {
  const [pending, setPending]     = useState([]);
  const [accepted, setAccepted]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res  = await get('/api/notifications_history');
      const data = await res.json();
      if (Array.isArray(data)) {
        const vibes = data.filter(n => n.type === 'vibe');
        
        // Helper to remove duplicate notifications from the same user
        const uniqueByActor = (list) => {
          const seen = new Set();
          return list.filter(item => {
            if (seen.has(item.actor)) return false;
            seen.add(item.actor);
            return true;
          });
        };

        const pendingList = uniqueByActor(vibes.filter(v => v.status === 'pending'));
        const acceptedList = uniqueByActor(vibes.filter(v => v.status === 'accepted'));

        setPending(pendingList.map(v => ({ ...v, username: v.actor, notificationId: v.id })));
        setAccepted(acceptedList.map(v => ({ ...v, username: v.actor, notificationId: v.id })));
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const respond = async (item, action) => {
    try {
      const res  = await api('/api/respond_vibe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId: item.notificationId, action, actor: item.actor }),
      });
      const data = await res.json();
      if (data.success) load();
      else Alert.alert('Error', data.message || 'Action failed.');
    } catch (_) { Alert.alert('Error', 'Network error'); }
  };

  if (loading) return <View style={s.center}><ActivityIndicator color={colors.accent} size="large" /></View>;

  return (
    <SafeAreaView style={s.flex} edges={['top']}>
      <StatusBar style="light" />
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.title}>Connections</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={[...pending, ...accepted]}
        keyExtractor={i => String(i.notificationId || i.username || Math.random())}
        contentContainerStyle={{ padding: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListEmptyComponent={<Text style={s.empty}>No connections yet. Send some Vibes! 🎵</Text>}
        ListHeaderComponent={
          pending.length > 0 ? <Text style={s.section}>Pending Requests ({pending.length})</Text> : null
        }
        renderItem={({ item, index }) => {
          const isPending = item.status === 'pending';
          const uname     = item.username;
          const separator = index === pending.length && accepted.length > 0;
          return (
            <>
              {separator && <Text style={s.section}>Connected ({accepted.length})</Text>}
              <View style={[s.row, shadow.card]}>
                <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { username: uname })}>
                  <Avatar username={uname} size={48} />
                </TouchableOpacity>
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={s.name}>{item.full_name || uname}</Text>
                  <Text style={s.sub}>{isPending ? '🎵 Wants to vibe with you' : '✓ Vibing'}</Text>
                </View>
                {isPending && (
                  <View style={s.actions}>
                    <TouchableOpacity style={s.acceptBtn} onPress={() => respond(item, 'accept')}>
                      <Ionicons name="checkmark" size={18} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity style={s.rejectBtn} onPress={() => respond(item, 'reject')}>
                      <Ionicons name="close" size={18} color="#fff" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </>
          );
        }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex:       { flex: 1, backgroundColor: colors.bg },
  center:     { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  title:      { color: colors.white, fontSize: font.xl, fontWeight: '800' },
  section:    { color: colors.textMuted, fontSize: font.sm, fontWeight: '700', marginBottom: spacing.sm, marginTop: spacing.sm, textTransform: 'uppercase' },
  row:        { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  name:       { color: colors.white, fontWeight: '700', fontSize: font.md },
  sub:        { color: colors.textMuted, fontSize: font.sm, marginTop: 2 },
  actions:    { flexDirection: 'row', gap: spacing.xs },
  acceptBtn:  { backgroundColor: colors.success, borderRadius: radius.full, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  rejectBtn:  { backgroundColor: colors.danger, borderRadius: radius.full, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  empty:      { color: colors.textMuted, textAlign: 'center', marginTop: spacing.xxl, fontSize: font.md },
});
