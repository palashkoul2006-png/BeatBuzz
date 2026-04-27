import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Image, ActivityIndicator,
  TouchableOpacity, Alert, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing, radius, font, shadow } from '../../theme';
import { get, api } from '../../api';
import { useAuth } from '../../AuthContext';
import Avatar from '../../components/Avatar';
import { BASE_URL } from '../../config';

export default function UserProfileScreen({ navigation, route }) {
  const { username }              = route.params;
  const { user }                  = useAuth();
  const [profile, setProfile]     = useState(null);
  const [posts, setPosts]         = useState([]);
  const [vibeStatus, setVibeStatus] = useState('none');
  const [loading, setLoading]     = useState(true);
  const [fullImage, setFullImage] = useState(null);

  const load = useCallback(async () => {
    try {
      const [profRes, postsRes, vibeRes] = await Promise.all([
        get(`/api/get_profile/${encodeURIComponent(username)}`),
        get('/api/posts'),
        get(`/api/vibe_status/${encodeURIComponent(username)}`),
      ]);
      setProfile(await profRes.json());
      const allPosts = await postsRes.json();
      setPosts(Array.isArray(allPosts) ? allPosts.filter(p => p.author_username === username) : []);
      const vs = await vibeRes.json();
      setVibeStatus(vs.status || 'none');
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [username]);

  useEffect(() => { load(); }, [load]);

  const sendVibe = async () => {
    try {
      const res  = await api('/api/send_vibe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_username: username }),
      });
      const data = await res.json();
      if (data.success) setVibeStatus('pending');
      else Alert.alert('BeatBuzz', data.message || 'Could not send vibe.');
    } catch (_) { Alert.alert('Error', 'Network error'); }
  };

  const unvibe = () => {
    Alert.alert(
      'Unvibe?',
      `Are you sure you want to unvibe @${username}? This will remove your connection.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unvibe', style: 'destructive',
          onPress: async () => {
            try {
              const res = await api('/api/unvibe', {
                method: 'DELETE', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to_username: username }),
              });
              const data = await res.json();
              if (data.success) setVibeStatus('none');
              else Alert.alert('BeatBuzz', data.message || 'Could not unvibe.');
            } catch (_) { Alert.alert('Error', 'Network error'); }
          },
        },
      ]
    );
  };

  const withdrawVibe = () => {
    Alert.alert(
      'Withdraw Vibe?',
      `Cancel your vibe request to @${username}?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Withdraw', style: 'destructive',
          onPress: async () => {
            try {
              const res = await api('/api/withdraw_vibe', {
                method: 'DELETE', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to_username: username }),
              });
              const data = await res.json();
              if (data.success) setVibeStatus('none');
              else Alert.alert('BeatBuzz', data.message || 'Could not withdraw.');
            } catch (_) { Alert.alert('Error', 'Network error'); }
          },
        },
      ]
    );
  };

  if (loading) return <View style={s.center}><ActivityIndicator color={colors.accent} size="large" /></View>;
  if (!profile) return <View style={s.center}><Text style={{ color: colors.textSub }}>Profile not found.</Text></View>;

  return (
    <SafeAreaView style={s.flex} edges={['top']}>
      <StatusBar style="light" />
      <View style={s.navbar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.navTitle}>@{username}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView>
        <TouchableOpacity 
          style={s.cover} 
          activeOpacity={0.9} 
          onPress={() => profile?.cover_pic_url && setFullImage(`${BASE_URL}/api/cover_pic/${encodeURIComponent(username)}?v=${encodeURIComponent(profile.cover_pic_url)}`)}
        >
          {profile?.cover_pic_url && (
            <Image source={{ uri: `${BASE_URL}/api/cover_pic/${encodeURIComponent(username)}?v=${encodeURIComponent(profile.cover_pic_url)}` }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
          )}
        </TouchableOpacity>
        <View style={s.profileHeader}>
          <View style={s.avatarWrap}>
            <TouchableOpacity onPress={() => setFullImage(`${BASE_URL}/api/profile_pic/${encodeURIComponent(username)}?v=${encodeURIComponent(profile?.profile_pic_url || Date.now())}`)} activeOpacity={0.9}>
              <Avatar username={username} size={84} timestamp={profile?.profile_pic_url} />
            </TouchableOpacity>
          </View>
          <View style={s.infoWrap}>
            <View style={s.titleRow}>
              <View style={s.nameArea}>
                <Text style={s.name}>{profile.full_name}</Text>
                <Text style={s.sub}>{profile.zodiac_sign || '♒'} · {profile.branch || ''}</Text>
              </View>
              {username !== user?.username && (
                vibeStatus === 'accepted' ? (
                  <TouchableOpacity style={s.unvibeBtn} onPress={unvibe}>
                    <Text style={s.unvibeBtnText}>✓ Vibing · Unvibe</Text>
                  </TouchableOpacity>
                ) : vibeStatus === 'pending' ? (
                  <TouchableOpacity style={s.pendBadge} onPress={withdrawVibe}>
                    <Text style={s.pendText}>Vibe Sent · Withdraw</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={s.vibeBtn} onPress={sendVibe}>
                    <Text style={s.vibeBtnText}>🎵 Vibe</Text>
                  </TouchableOpacity>
                )
              )}
            </View>
          </View>
        </View>

        <Text style={s.bio}>{profile.bio || 'No bio yet.'}</Text>

        <View style={s.infoGrid}>
          {[
            { icon: 'school', label: profile.branch },
            { icon: 'home', label: profile.hometown },
            { icon: 'calendar', label: `Year ${profile.year}` },
            { icon: 'people', label: profile.clubs_part_of },
          ].filter(i => i.label).map((item, i) => (
            <View key={i} style={s.infoItem}>
              <Ionicons name={item.icon + '-outline'} size={16} color={colors.textMuted} />
              <Text style={s.infoText}>{item.label}</Text>
            </View>
          ))}
        </View>

        {posts.length > 0 && (
          <View style={s.postsSection}>
            <Text style={s.postsTitle}>Posts ({posts.length})</Text>
            <View style={s.postsGrid}>
              {posts.slice(0, 6).map(p => (
                <TouchableOpacity 
                  key={p.id} 
                  style={s.thumb}
                  activeOpacity={0.8}
                  onPress={() => navigation.navigate('Posts', { targetPostId: p.id })}
                >
                  {p.image_filename || p.image_url
                    ? <Image source={{ uri: `${BASE_URL}/api/image/${p.id}` }} style={s.thumbImg} resizeMode="cover" />
                    : <View style={s.textThumb}><Text style={s.textThumbTxt} numberOfLines={3}>{p.caption}</Text></View>}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Full Screen Image Modal */}
      <Modal visible={!!fullImage} transparent animationType="fade" onRequestClose={() => setFullImage(null)}>
        <View style={{ flex: 1, backgroundColor: '#000000F0', justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity style={{ position: 'absolute', top: 50, right: 20, zIndex: 1, padding: 10 }} onPress={() => setFullImage(null)}>
            <Ionicons name="close" size={32} color="#fff" />
          </TouchableOpacity>
          {fullImage && <Image source={{ uri: fullImage }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const THUMB = 110;
const s = StyleSheet.create({
  flex:        { flex: 1, backgroundColor: colors.bg },
  center:      { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  navbar:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  navTitle:    { color: colors.white, fontWeight: '700', fontSize: font.md },
  cover:       { width: '100%', aspectRatio: 16/9, backgroundColor: colors.accentSoft },
  profileHeader: { flexDirection: 'row', paddingHorizontal: spacing.md, marginBottom: spacing.md },
  avatarWrap:    { position: 'relative', marginTop: -42, marginRight: spacing.md },
  infoWrap:      { flex: 1, paddingTop: spacing.sm },
  titleRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  nameArea:      { flex: 1, paddingRight: spacing.sm },
  name:        { color: colors.white, fontWeight: '800', fontSize: font.lg },
  sub:         { color: colors.textMuted, fontSize: font.sm, marginTop: 2 },
  vibeBtn:     { backgroundColor: colors.accent, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 8 },
  vibeBtnText: { color: colors.white, fontWeight: '700', fontSize: font.sm },
  vibedBadge:  { backgroundColor: colors.success + '22', borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 8, borderWidth: 1, borderColor: colors.success },
  vibedText:   { color: colors.success, fontWeight: '700', fontSize: font.sm },
  pendBadge:   { backgroundColor: colors.warning + '22', borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 8, borderWidth: 1, borderColor: colors.warning },
  pendText:    { color: colors.warning, fontWeight: '700', fontSize: font.sm },
  unvibeBtn:   { backgroundColor: colors.success + '22', borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 8, borderWidth: 1, borderColor: colors.success },
  unvibeBtnText: { color: colors.success, fontWeight: '700', fontSize: font.sm },
  bio:         { color: colors.text, fontSize: font.md, paddingHorizontal: spacing.md, marginBottom: spacing.md, lineHeight: 22 },
  infoGrid:    { paddingHorizontal: spacing.md, gap: spacing.sm, marginBottom: spacing.md },
  infoItem:    { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  infoText:    { color: colors.textSub, fontSize: font.sm },
  postsSection:{ paddingHorizontal: spacing.md },
  postsTitle:  { color: colors.white, fontWeight: '700', fontSize: font.lg, marginBottom: spacing.sm },
  postsGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  thumb:       { width: THUMB, height: THUMB, borderRadius: radius.sm, overflow: 'hidden' },
  thumbImg:    { width: '100%', height: '100%' },
  textThumb:   { width: '100%', height: '100%', backgroundColor: colors.purple + '33', padding: 6, justifyContent: 'center' },
  textThumbTxt:{ color: colors.white, fontSize: 10 },
});
