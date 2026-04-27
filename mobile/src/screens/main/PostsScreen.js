import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Image, RefreshControl, Alert, Modal, TextInput,
  ActivityIndicator, Animated, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing, radius, font, shadow } from '../../theme';
import { get, api, post } from '../../api';
import { useAuth } from '../../AuthContext';
import Avatar from '../../components/Avatar';

const { width: W } = Dimensions.get('window');

export default function PostsScreen({ navigation, route }) {
  const { user }                      = useAuth();
  const [posts, setPosts]             = useState([]);
  const [refreshing, setRefreshing]   = useState(false);
  const [loading, setLoading]         = useState(true);
  const [createModal, setCreateModal] = useState(false);
  const [newCaption, setNewCaption]   = useState('');
  const [newImage, setNewImage]       = useState(null);
  const [posting, setPosting]         = useState(false);
  const [fullImage, setFullImage]     = useState(null);
  const [commModal, setCommModal]     = useState(false);
  const [selectedPost, setSelectedPost] = useState(null);
  const [comments, setComments]       = useState([]);
  const [commText, setCommText]       = useState('');
  const [likesModal, setLikesModal]   = useState(false);
  const [postLikes, setPostLikes]     = useState([]);
  const flatListRef                   = useRef(null);
  const targetPostId                  = route.params?.targetPostId;
  const openCommentsFlag              = route.params?.openComments;

  const loadPosts = useCallback(async () => {
    try {
      const res  = await get('/api/posts');
      const data = await res.json();
      setPosts(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  useEffect(() => {
    if (targetPostId && posts.length > 0) {
      const index = posts.findIndex(p => p.id === targetPostId);
      if (index !== -1) {
        setTimeout(() => {
          flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.1 });
          if (openCommentsFlag) {
            // Need to call the openComments function but it's defined below.
            // We can just set the state directly here.
            setSelectedPost(posts[index]);
            setCommModal(true);
            get(`/api/posts/${targetPostId}/comments`)
              .then(res => res.json())
              .then(data => setComments(Array.isArray(data) ? data : []))
              .catch(e => console.error(e));
          }
          // Clear the param so it doesn't keep scrolling if we change tabs back and forth
          navigation.setParams({ targetPostId: undefined, openComments: undefined });
        }, 500);
      }
    }
  }, [targetPostId, posts, navigation, openCommentsFlag]);

  const onRefresh = () => { setRefreshing(true); loadPosts(); };

  const toggleLike = async (post) => {
    const isLiked = post.liked_by_me;
    const method = isLiked ? 'DELETE' : 'POST';
    try {
      const res  = await api(`/api/posts/${post.id}/like`, { method });
      const data = await res.json();
      if (data.success) {
        setPosts(prev => prev.map(p => p.id === post.id
          ? { ...p, liked_by_me: !isLiked ? 1 : 0, likes_count: data.likes_count ?? p.likes_count }
          : p
        ));
      }
    } catch (e) { console.error(e); }
  };

  const openComments = async (post) => {
    setSelectedPost(post);
    setCommModal(true);
    try {
      const res  = await get(`/api/posts/${post.id}/comments`);
      const data = await res.json();
      setComments(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
  };

  const openLikes = async (post) => {
    setLikesModal(true);
    try {
      const res = await get(`/api/posts/${post.id}/likes`);
      const data = await res.json();
      setPostLikes(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
  };

  const sendComment = async () => {
    if (!commText.trim() || !selectedPost) return;
    try {
      const postRes = await api(`/api/posts/${selectedPost.id}/comments`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ comment: commText.trim() }),
      });
      const data = await postRes.json();
      if (data.success && data.comments_count !== undefined) {
        setPosts(prev => prev.map(p => p.id === selectedPost.id
          ? { ...p, comments_count: data.comments_count }
          : p
        ));
      }
      setCommText('');
      const res  = await get(`/api/posts/${selectedPost.id}/comments`);
      setComments(await res.json());
    } catch (e) { console.error(e); }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Permission', 'Allow photo access.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (!result.canceled) setNewImage(result.assets[0]);
  };

  const createPost = async () => {
    if (!newCaption.trim() && !newImage) return Alert.alert('BeatBuzz', 'Add an image or write something!');
    setPosting(true);
    try {
      const fd = new FormData();
      fd.append('caption', newCaption.trim());
      if (newImage) {
        const uri  = newImage.uri;
        const name = uri.split('/').pop();
        fd.append('image', { uri, name, type: newImage.mimeType || 'image/jpeg' });
      }
      const res  = await api('/api/posts', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success || data.post_id) {
        setCreateModal(false); setNewCaption(''); setNewImage(null);
        loadPosts();
      } else Alert.alert('Error', data.message || 'Post failed.');
    } catch (e) { Alert.alert('Error', 'Network error'); }
    finally { setPosting(false); }
  };

  const PostCard = ({ item }) => (
    <View style={[s.postCard, shadow.card]}>
      <View style={s.postHeader}>
        <Avatar username={item.author_username} size={38} />
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <Text style={s.postUser}>{item.full_name || item.author_username}</Text>
          <Text style={s.postTime}>{new Date(item.created_at).toLocaleDateString()}</Text>
        </View>
      </View>
      {item.image_filename || item.image_url
        ? (
            <TouchableOpacity onPress={() => setFullImage(`${require('../../config').BASE_URL}/api/image/${item.id}`)} activeOpacity={0.9}>
              <Image source={{ uri: `${require('../../config').BASE_URL}/api/image/${item.id}` }} style={s.postImage} resizeMode="cover" />
            </TouchableOpacity>
          )
        : null}
      {item.caption ? <Text style={s.postCaption}>{item.caption}</Text> : null}
      <View style={s.postActions}>
        <TouchableOpacity style={s.actionBtn} onPress={() => toggleLike(item)}>
          <Ionicons name={item.liked_by_me ? 'heart' : 'heart-outline'} size={22} color={item.liked_by_me ? colors.accent : colors.textSub} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => openLikes(item)}>
          <Text style={[s.actionCount, item.liked_by_me && { color: colors.accent }, { marginRight: spacing.sm }]}>{item.likes_count || 0}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.actionBtn} onPress={() => openComments(item)}>
          <Ionicons name="chatbubble-outline" size={20} color={colors.textSub} />
          <Text style={s.actionCount}>{item.comments_count || 0}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) return <View style={s.center}><ActivityIndicator color={colors.accent} size="large" /></View>;

  return (
    <SafeAreaView style={s.flex} edges={['top']}>
      <StatusBar style="light" />
      <View style={s.header}>
        <Text style={s.title}>Posts</Text>
        <TouchableOpacity style={s.fab} onPress={() => setCreateModal(true)}>
          <Ionicons name="add" size={24} color={colors.white} />
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatListRef}
        data={posts}
        keyExtractor={p => String(p.id)}
        renderItem={({ item }) => <PostCard item={item} />}
        contentContainerStyle={{ padding: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListEmptyComponent={<Text style={s.empty}>No posts yet. Be the first! 🎵</Text>}
      />

      {/* Create Post Modal */}
      <Modal visible={createModal} transparent animationType="slide" onRequestClose={() => setCreateModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalRow}>
              <Text style={s.modalTitle}>Create Post</Text>
              <TouchableOpacity onPress={() => setCreateModal(false)}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
            </View>
            <TouchableOpacity style={s.imagePickBtn} onPress={pickImage}>
              {newImage
                ? <Image source={{ uri: newImage.uri }} style={s.previewImg} resizeMode="cover" />
                : <View style={s.imagePlaceholder}><Ionicons name="image-outline" size={36} color={colors.textMuted} /><Text style={s.imagePlaceholderText}>Tap to add photo</Text></View>}
            </TouchableOpacity>
            <TextInput
              style={s.captionInput}
              placeholder="What's on your mind? ✨"
              placeholderTextColor={colors.textMuted}
              value={newCaption}
              onChangeText={setNewCaption}
              multiline
            />
            <TouchableOpacity style={s.postBtn} onPress={createPost} disabled={posting}>
              {posting ? <ActivityIndicator color="#fff" /> : <Text style={s.postBtnText}>Post 🎵</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Comments Modal */}
      <Modal visible={commModal} transparent animationType="slide" onRequestClose={() => setCommModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { maxHeight: '80%' }]}>
            <View style={s.modalRow}>
              <Text style={s.modalTitle}>Comments</Text>
              <TouchableOpacity onPress={() => setCommModal(false)}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
            </View>
            <FlatList
              data={comments}
              keyExtractor={(_, i) => String(i)}
              style={{ maxHeight: 300 }}
              renderItem={({ item }) => (
                <View style={s.commentItem}>
                  <Avatar username={item.username} size={30} />
                  <View style={{ flex: 1, marginLeft: spacing.sm }}>
                    <Text style={s.commUser}>{item.full_name || item.username}</Text>
                    <Text style={s.commText}>{item.comment_text}</Text>
                  </View>
                </View>
              )}
              ListEmptyComponent={<Text style={s.empty}>No comments yet.</Text>}
            />
            <View style={s.commInputRow}>
              <TextInput
                style={s.commInput}
                placeholder="Add a comment..."
                placeholderTextColor={colors.textMuted}
                value={commText}
                onChangeText={setCommText}
              />
              <TouchableOpacity style={s.sendBtn} onPress={sendComment}>
                <Ionicons name="send" size={18} color={colors.white} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Likes Modal */}
      <Modal visible={likesModal} transparent animationType="slide" onRequestClose={() => setLikesModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { maxHeight: '60%' }]}>
            <View style={s.modalRow}>
              <Text style={s.modalTitle}>Likes</Text>
              <TouchableOpacity onPress={() => setLikesModal(false)}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
            </View>
            <FlatList
              data={postLikes}
              keyExtractor={(_, i) => String(i)}
              renderItem={({ item }) => (
                <View style={s.commentItem}>
                  <Avatar username={item.username} size={30} />
                  <View style={{ flex: 1, marginLeft: spacing.sm, justifyContent: 'center' }}>
                    <Text style={s.commUser}>{item.full_name || item.username}</Text>
                  </View>
                </View>
              )}
              ListEmptyComponent={<Text style={s.empty}>No likes yet.</Text>}
            />
          </View>
        </View>
      </Modal>

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

const s = StyleSheet.create({
  flex:               { flex: 1, backgroundColor: colors.bg },
  center:             { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  header:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  title:              { color: colors.white, fontSize: font.xl, fontWeight: '800' },
  fab:                { backgroundColor: colors.accent, borderRadius: radius.full, width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  postCard:           { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md, overflow: 'hidden' },
  postHeader:         { flexDirection: 'row', alignItems: 'center', padding: spacing.md },
  postUser:           { color: colors.white, fontWeight: '700', fontSize: font.md },
  postTime:           { color: colors.textMuted, fontSize: font.xs, marginTop: 2 },
  postImage:          { width: '100%', height: 300 },
  postCaption:        { color: colors.text, fontSize: font.md, padding: spacing.md, paddingTop: spacing.sm },
  postActions:        { flexDirection: 'row', paddingHorizontal: spacing.md, paddingBottom: spacing.sm, gap: spacing.md },
  actionBtn:          { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionCount:        { color: colors.textSub, fontSize: font.sm },
  empty:              { color: colors.textMuted, textAlign: 'center', marginTop: spacing.xxl, fontSize: font.md },
  // Modal
  modalOverlay:       { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalCard:          { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: spacing.xxl },
  modalRow:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  modalTitle:         { color: colors.white, fontSize: font.lg, fontWeight: '700' },
  imagePickBtn:       { borderRadius: radius.md, overflow: 'hidden', marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
  imagePlaceholder:   { height: 160, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  imagePlaceholderText: { color: colors.textMuted, marginTop: spacing.xs },
  previewImg:         { width: '100%', height: 200 },
  captionInput:       { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.md, color: colors.text, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, minHeight: 80, textAlignVertical: 'top' },
  postBtn:            { backgroundColor: colors.accent, borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center' },
  postBtnText:        { color: colors.white, fontWeight: '700', fontSize: font.md },
  commentItem:        { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  commUser:           { color: colors.white, fontWeight: '700', fontSize: font.sm },
  commText:           { color: colors.text, fontSize: font.sm, marginTop: 2 },
  commInputRow:       { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, gap: spacing.sm },
  commInput:          { flex: 1, backgroundColor: colors.card, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 10, color: colors.text, fontSize: font.sm, borderWidth: 1, borderColor: colors.border },
  sendBtn:            { backgroundColor: colors.accent, borderRadius: radius.full, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
