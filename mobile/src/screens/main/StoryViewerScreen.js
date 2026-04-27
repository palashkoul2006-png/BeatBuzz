import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet,
  Dimensions, Animated, TextInput, Alert, ActivityIndicator, Modal, ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing, radius, font } from '../../theme';
import { get, api } from '../../api';
import { useAuth } from '../../AuthContext';
import { BASE_URL } from '../../config';
import Avatar from '../../components/Avatar';

const { width: W } = Dimensions.get('window');
const STORY_DURATION = 5000;

export default function StoryViewerScreen({ navigation, route }) {
  const { targetUsername }    = route.params;
  const { user }              = useAuth();
  const [stories, setStories] = useState([]);
  const [idx, setIdx]         = useState(0);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [viewsModal, setViewsModal] = useState(false);
  const [viewers, setViewers] = useState([]);
  const [replies, setReplies] = useState([]);
  const progress              = useRef(new Animated.Value(0)).current;
  const timerRef              = useRef(null);
  const isMe                  = targetUsername === user?.username;

  useEffect(() => {
    get(`/api/stories/${targetUsername}`)
      .then(r => r.json())
      .then(data => { setStories(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { setLoading(false); navigation.goBack(); });
  }, [targetUsername]);

  useEffect(() => {
    if (!stories.length) return;
    startProgress();
    markViewed();
    return () => { clearTimeout(timerRef.current); progress.stopAnimation(); };
  }, [idx, stories]);

  const startProgress = () => {
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: STORY_DURATION, useNativeDriver: false }).start(({ finished }) => {
      if (finished) nextStory();
    });
  };

  const markViewed = () => {
    if (!isMe && stories[idx]) {
      api(`/api/stories/${stories[idx].id}/view`, { method: 'POST' }).catch(() => {});
    }
  };

  const nextStory = () => {
    if (idx < stories.length - 1) setIdx(i => i + 1);
    else navigation.goBack();
  };
  const prevStory = () => {
    if (idx > 0) setIdx(i => i - 1);
  };

  const likeStory = () => {
    if (!stories[idx]) return;
    
    const currentStatus = stories[idx].is_liked;
    
    // Optimistic UI update
    setStories(prev => {
      const newStories = [...prev];
      newStories[idx] = { ...newStories[idx], is_liked: currentStatus ? 0 : 1 };
      return newStories;
    });

    api(`/api/stories/${stories[idx].id}/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: currentStatus ? 'unlike' : 'like' }),
    });
  };

  const sendReply = () => {
    if (!comment.trim() || !stories[idx]) return;
    api(`/api/stories/${stories[idx].id}/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'comment', message: comment.trim() }),
    });
    setComment('');
  };

  const openViewsAndReplies = async () => {
    progress.stopAnimation();
    setViewsModal(true);
    try {
      const vRes = await get(`/api/stories/${stories[idx].id}/viewers`);
      const vData = await vRes.json();
      setViewers(Array.isArray(vData) ? vData : []);

      const rRes = await get(`/api/stories/${stories[idx].id}/replies`);
      const rData = await rRes.json();
      setReplies(Array.isArray(rData) ? rData : []);
    } catch (e) {
      console.error(e);
    }
  };

  const closeViewsModal = () => {
    setViewsModal(false);
    startProgress();
  };

  if (loading || !stories.length) {
    return (
      <View style={s.full}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  const story = stories[idx];

  return (
    <View style={s.full}>
      <StatusBar style="light" />
      <Image source={{ uri: `${BASE_URL}/api/story_image/${story.id}` }} style={s.image} resizeMode="cover" />

      {/* Progress bars */}
      <SafeAreaView style={s.progressContainer} edges={['top']}>
        <View style={s.progressRow}>
          {stories.map((_, i) => (
            <View key={i} style={s.progressBg}>
              <Animated.View style={[s.progressFg, {
                width: i < idx ? '100%' : i === idx ? progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) : '0%',
              }]} />
            </View>
          ))}
        </View>
        {/* Header */}
        <View style={s.storyHeader}>
          <Avatar username={targetUsername} size={36} />
          <Text style={s.storyUser}>{targetUsername}</Text>
          <TouchableOpacity style={s.closeBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Caption */}
      {story.caption ? (
        <View style={s.captionWrap}>
          <Text style={s.caption}>{story.caption}</Text>
        </View>
      ) : null}

      {/* Navigation taps */}
      <View style={s.tapArea}>
        <TouchableOpacity style={s.tapLeft} onPress={prevStory} activeOpacity={1} />
        <TouchableOpacity style={s.tapRight} onPress={nextStory} activeOpacity={1} />
      </View>

      {/* Bottom interaction */}
      {!isMe ? (
        <View style={s.bottomBar}>
          <TextInput
            style={s.replyInput}
            placeholder="Reply to story..."
            placeholderTextColor="rgba(255,255,255,0.5)"
            value={comment}
            onChangeText={setComment}
            onFocus={() => progress.stopAnimation()}
            onBlur={startProgress}
            onSubmitEditing={sendReply}
          />
          <TouchableOpacity style={s.likeBtn} onPress={likeStory}>
            {story.is_liked ? (
              <Ionicons name="heart" size={28} color={colors.danger} />
            ) : (
              <Ionicons name="heart-outline" size={28} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={s.bottomMeBar}>
          <TouchableOpacity style={s.viewsBtn} onPress={openViewsAndReplies}>
            <Ionicons name="chevron-up" size={20} color="#fff" />
            <Text style={s.viewsText}>Views & Replies</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Views & Replies Modal */}
      <Modal visible={viewsModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Story Activity</Text>
              <TouchableOpacity onPress={closeViewsModal}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={{ padding: spacing.md }}>
              <Text style={s.sectionTitle}>Views & Likes</Text>
              {viewers.length === 0 && <Text style={s.emptyText}>No views yet.</Text>}
              {viewers.map((v, i) => (
                <View key={i} style={s.activityRow}>
                  <Avatar username={v.viewer_username} size={40} />
                  <Text style={s.activityUser}>{v.full_name || v.viewer_username}</Text>
                  {v.is_liked ? <Ionicons name="heart" size={20} color={colors.danger} /> : <Ionicons name="eye" size={20} color={colors.textMuted} />}
                </View>
              ))}

              <Text style={[s.sectionTitle, { marginTop: spacing.lg }]}>Replies</Text>
              {replies.length === 0 && <Text style={s.emptyText}>No replies yet.</Text>}
              {replies.map((r, i) => (
                <View key={i} style={s.activityRow}>
                  <Avatar username={r.sender_username} size={40} />
                  <View style={{ flex: 1, marginLeft: spacing.sm }}>
                    <Text style={s.activityUser}>{r.full_name || r.sender_username}</Text>
                    <Text style={s.activityMsg}>{r.message_text}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  full:             { flex: 1, backgroundColor: '#000' },
  image:            { width: W, height: '100%', position: 'absolute' },
  progressContainer:{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  progressRow:      { flexDirection: 'row', paddingHorizontal: spacing.sm, gap: 3, marginBottom: spacing.xs },
  progressBg:       { flex: 1, height: 3, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 2 },
  progressFg:       { height: '100%', backgroundColor: '#fff', borderRadius: 2 },
  storyHeader:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, marginTop: spacing.xs },
  storyUser:        { flex: 1, color: '#fff', fontWeight: '700', fontSize: font.md, marginLeft: spacing.sm, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },
  closeBtn:         {},
  captionWrap:      { position: 'absolute', bottom: 80, left: spacing.md, right: spacing.md, alignItems: 'center' },
  caption:          { color: '#fff', fontSize: font.md, fontWeight: '500', textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 8 },
  tapArea:          { position: 'absolute', top: 80, left: 0, right: 0, bottom: 80, flexDirection: 'row' },
  tapLeft:          { flex: 1 },
  tapRight:         { flex: 1 },
  bottomBar:        { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm },
  replyInput:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', paddingHorizontal: spacing.md, paddingVertical: 10, color: '#fff', fontSize: font.md },
  likeBtn:          { backgroundColor: 'rgba(0,0,0,0.5)', padding: 8, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' },
  bottomMeBar:      { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', paddingBottom: spacing.lg },
  viewsBtn:         { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' },
  viewsText:        { color: '#fff', fontSize: font.md, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },
  modalOverlay:     { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent:     { height: '60%', backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl },
  modalHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle:       { color: colors.text, fontSize: font.lg, fontWeight: '700' },
  sectionTitle:     { color: colors.text, fontSize: font.md, fontWeight: '700', marginBottom: spacing.sm },
  emptyText:        { color: colors.textMuted, fontSize: font.sm, fontStyle: 'italic', marginBottom: spacing.md },
  activityRow:      { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  activityUser:     { flex: 1, color: colors.text, fontSize: font.md, fontWeight: '600', marginLeft: spacing.sm },
  activityMsg:      { color: colors.textMuted, fontSize: font.sm, marginTop: 2 },
});
