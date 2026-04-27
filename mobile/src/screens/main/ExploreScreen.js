import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ScrollView, Image, RefreshControl, Alert, Modal,
  TextInput, ActivityIndicator, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing, radius, font, shadow } from '../../theme';
import { get, api } from '../../api';
import { useAuth } from '../../AuthContext';
import { BASE_URL } from '../../config';
import Avatar from '../../components/Avatar';

const { width: W } = Dimensions.get('window');

export default function ExploreScreen({ navigation }) {
  const { user }                      = useAuth();
  const [profiles, setProfiles]       = useState([]);
  const [stories, setStories]         = useState([]);
  const [myProfile, setMyProfile]     = useState(null);
  const [refreshing, setRefreshing]   = useState(false);
  const [loading, setLoading]         = useState(true);

  // Story upload modal
  const [uploadModal, setUploadModal] = useState(false);
  const [storyImage, setStoryImage]   = useState(null);
  const [caption, setCaption]         = useState('');
  const [posting, setPosting]         = useState(false);

  const load = useCallback(async () => {
    try {
      const [profRes, storyRes, meRes] = await Promise.all([
        get('/api/all_profiles'),
        get('/api/stories_feed'),
        get('/api/user_profile'),
      ]);
      const pData = await profRes.json();
      const sData = await storyRes.json();
      const mData = await meRes.json();
      
      setProfiles(Array.isArray(pData) ? pData : []);
      setStories(Array.isArray(sData) ? sData : []);
      setMyProfile(!mData.error ? mData : null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const sendVibe = async (toUsername, setStatus) => {
    try {
      const res  = await api('/api/send_vibe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ to_username: toUsername }),
      });
      const data = await res.json();
      if (data.success) setStatus('pending');
      else Alert.alert('BeatBuzz', data.message || 'Could not send vibe.');
    } catch (_) {
      Alert.alert('Error', 'Network error');
    }
  };

  const withdrawVibe = async (toUsername, setStatus) => {
    Alert.alert(
      'Withdraw Vibe?',
      `Cancel your vibe request to @${toUsername}?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Withdraw', style: 'destructive',
          onPress: async () => {
            try {
              const res = await api('/api/withdraw_vibe', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to_username: toUsername }),
              });
              const data = await res.json();
              if (data.success) setStatus('none');
              else Alert.alert('BeatBuzz', data.message || 'Could not withdraw.');
            } catch (_) { Alert.alert('Error', 'Network error'); }
          },
        },
      ]
    );
  };

  const pickStoryImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Permission', 'Allow photo access.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled) {
      setStoryImage(result.assets[0]);
      setUploadModal(true);
    }
  };

  const postStory = async () => {
    if (!storyImage) return;
    setPosting(true);
    try {
      const fd   = new FormData();
      const uri  = storyImage.uri;
      const name = uri.split('/').pop();
      fd.append('image', { uri, name, type: storyImage.mimeType || 'image/jpeg' });
      fd.append('caption', caption.trim());
      const res  = await api('/api/stories', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) { setUploadModal(false); setStoryImage(null); setCaption(''); load(); }
      else Alert.alert('Error', 'Failed to post story.');
    } catch (_) {
      Alert.alert('Error', 'Network error');
    } finally {
      setPosting(false);
    }
  };

  // ─── Story Bubble ──────────────────────────────────────────────────────────
  const StoryBubble = ({ item }) => {
    const isMe    = item.username === user?.username;
    const hasRing = item.unseen_count > 0;
    return (
      <TouchableOpacity
        style={s.storyItem}
        onPress={() => {
          if (isMe) pickStoryImage();
          else navigation.navigate('StoryViewer', { targetUsername: item.username, stories: [] });
        }}
      >
        <View style={[s.storyRing, hasRing && s.storyRingUnseen]}>
          <Avatar username={item.username} size={54} />
          {isMe && (
            <View style={s.addBadge}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>+</Text></View>
          )}
        </View>
        <Text style={s.storyName} numberOfLines={1}>
          {isMe ? 'You' : item.full_name?.split(' ')[0]}
        </Text>
      </TouchableOpacity>
    );
  };

  // ─── Profile Card ──────────────────────────────────────────────────────────
  const ProfileCard = ({ item }) => {
    const [vibeStatus, setVibeStatus] = useState('none');

    useEffect(() => {
      get(`/api/vibe_status/${encodeURIComponent(item.username)}`)
        .then(r => r.json())
        .then(d => setVibeStatus(d.status || 'none'))
        .catch(() => {});
    }, [item.username]);

    const handleUnvibe = () => {
      Alert.alert(
        'Unvibe?',
        `Are you sure you want to unvibe @${item.username}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Unvibe', style: 'destructive',
            onPress: async () => {
              try {
                const res = await api('/api/unvibe', {
                  method: 'DELETE',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ to_username: item.username }),
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

    return (
      <TouchableOpacity
        style={[s.card, shadow.card]}
        onPress={() => navigation.navigate('UserProfile', { username: item.username })}
        activeOpacity={0.85}
      >
        <Avatar username={item.username} size={70} style={s.cardPic} />
        <Text style={s.cardName} numberOfLines={1}>{item.full_name}</Text>
        <Text style={s.cardZodiac}>{item.zodiac_sign || '♒'}</Text>
        <Text style={s.cardBio} numberOfLines={2}>{item.bio || 'No bio yet.'}</Text>

        {vibeStatus === 'accepted' ? (
          <TouchableOpacity style={s.unvibeBtn} onPress={handleUnvibe}>
            <Text style={s.unvibeBtnText}>✓ Vibing · Unvibe</Text>
          </TouchableOpacity>
        ) : vibeStatus === 'pending' ? (
          <TouchableOpacity style={s.pendBadge} onPress={() => withdrawVibe(item.username, setVibeStatus)}>
            <Text style={s.pendText}>Vibe Sent · Withdraw</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={s.vibeBtn} onPress={() => sendVibe(item.username, setVibeStatus)}>
            <Text style={s.vibeBtnText}>🎵 Vibe</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={s.center}><ActivityIndicator color={colors.accent} size="large" /></View>
    );
  }

  return (
    <SafeAreaView style={s.flex} edges={['top']}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={s.header}>
        <Text style={s.logo}>BeatBuzz</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Search')}>
          <Ionicons name="search" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={profiles}
        keyExtractor={i => i.username}
        numColumns={2}
        columnWrapperStyle={{ justifyContent: 'space-between', paddingHorizontal: spacing.md }}
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        renderItem={({ item }) => <ProfileCard item={item} />}
        ListHeaderComponent={() => (
          <View>
            {/* Stories Bar */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.storiesBar} contentContainerStyle={{ paddingHorizontal: spacing.md }}>
              {/* My story bubble */}
              <TouchableOpacity 
                style={s.storyItem} 
                onPress={() => {
                  const myStory = stories.find(s => s.username === user?.username);
                  if (myStory) {
                    navigation.navigate('StoryViewer', { targetUsername: user?.username, stories: [] });
                  } else {
                    pickStoryImage();
                  }
                }}
                onLongPress={pickStoryImage}
              >
                <View style={[s.storyRing, stories.some(s => s.username === user?.username) ? s.storyRingUnseen : {}]}>
                  <Avatar username={user?.username} size={54} />
                  <View style={s.addBadge}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>+</Text></View>
                </View>
                <Text style={s.storyName}>You</Text>
              </TouchableOpacity>
              {stories.filter(s => s.username !== user?.username).map(item => (
                <StoryBubble key={item.username} item={item} />
              ))}
            </ScrollView>
            <Text style={s.sectionTitle}>Explore Profiles</Text>
          </View>
        )}
      />

      {/* Story Upload Modal */}
      <Modal visible={uploadModal} transparent animationType="slide" onRequestClose={() => setUploadModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <TouchableOpacity style={s.modalClose} onPress={() => setUploadModal(false)}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={s.modalTitle}>New Story</Text>
            {storyImage && <Image source={{ uri: storyImage.uri }} style={s.preview} resizeMode="contain" />}
            <TextInput
              style={s.captionInput}
              placeholder="Add a caption..."
              placeholderTextColor={colors.textMuted}
              value={caption}
              onChangeText={setCaption}
            />
            <TouchableOpacity style={s.postBtn} onPress={postStory} disabled={posting}>
              {posting ? <ActivityIndicator color="#fff" /> : <Text style={s.postBtnText}>Post Story</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const CARD_W = (W - spacing.md * 3) / 2;
const s = StyleSheet.create({
  flex:            { flex: 1, backgroundColor: colors.bg },
  center:          { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  logo:            { color: colors.accent, fontSize: font.xl, fontWeight: '900', letterSpacing: 0.5 },
  storiesBar:      { paddingVertical: spacing.md },
  storyItem:       { alignItems: 'center', marginRight: spacing.md, width: 66 },
  storyRing:       { borderRadius: 32, borderWidth: 2, borderColor: colors.border, position: 'relative' },
  storyRingUnseen: { borderColor: colors.accent },
  storyName:       { color: colors.textSub, fontSize: 11, marginTop: 4, textAlign: 'center' },
  addBadge:        {
    position: 'absolute', bottom: -2, right: -4,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.bg,
  },
  sectionTitle: { color: colors.white, fontSize: font.lg, fontWeight: '700', paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  card:         {
    width: CARD_W, backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.md, alignItems: 'center',
  },
  cardPic:      { marginBottom: spacing.sm },
  cardName:     { color: colors.white, fontWeight: '700', fontSize: font.md, textAlign: 'center' },
  cardZodiac:   { color: colors.accent, fontSize: font.sm, marginVertical: 2 },
  cardBio:      { color: colors.textSub, fontSize: font.xs, textAlign: 'center', marginBottom: spacing.sm },
  vibeBtn:      { backgroundColor: colors.accent, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 7 },
  vibeBtnText:  { color: colors.white, fontWeight: '700', fontSize: font.sm },
  vibedBadge:   { backgroundColor: colors.success + '22', borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 7, borderWidth: 1, borderColor: colors.success },
  vibedText:    { color: colors.success, fontWeight: '700', fontSize: font.sm },
  pendBadge:    { backgroundColor: colors.warning + '22', borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 7, borderWidth: 1, borderColor: colors.warning },
  pendText:     { color: colors.warning, fontWeight: '700', fontSize: font.sm },
  unvibeBtn:    { backgroundColor: colors.success + '22', borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 7, borderWidth: 1, borderColor: colors.success },
  unvibeBtnText:{ color: colors.success, fontWeight: '700', fontSize: font.sm },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalCard:    { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: spacing.xxl },
  modalClose:   { alignSelf: 'flex-end', marginBottom: spacing.sm },
  modalTitle:   { color: colors.white, fontSize: font.lg, fontWeight: '700', textAlign: 'center', marginBottom: spacing.md },
  preview:      { width: '100%', height: 260, borderRadius: radius.md, marginBottom: spacing.md, backgroundColor: colors.card },
  captionInput: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, color: colors.text, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  postBtn:      { backgroundColor: colors.blue, borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center' },
  postBtnText:  { color: colors.white, fontWeight: '700', fontSize: font.md },
});
