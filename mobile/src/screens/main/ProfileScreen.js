import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Image, Alert, ActivityIndicator, TextInput, RefreshControl, FlatList, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing, radius, font, shadow } from '../../theme';
import { get, api, patch } from '../../api';
import { useAuth } from '../../AuthContext';
import Avatar from '../../components/Avatar';
import { BASE_URL } from '../../config';

export default function ProfileScreen({ navigation }) {
  const { user, logout }              = useAuth();
  const [profile, setProfile]         = useState(null);
  const [posts, setPosts]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [editField, setEditField]     = useState(null);
  const [editValue, setEditValue]     = useState('');
  const [saving, setSaving]           = useState(false);
  const [uploadingPic, setUploadingPic] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [fullImage, setFullImage]     = useState(null);

  const load = useCallback(async () => {
    try {
      const [profRes, postsRes] = await Promise.all([
        get('/api/my_profile'),
        get('/api/posts'),
      ]);
      const prof  = await profRes.json();
      const pdata = await postsRes.json();
      setProfile(prof);
      setPosts(Array.isArray(pdata) ? pdata.filter(p => p.author_username === user?.username) : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const saveField = async () => {
    if (!editField || !editValue.trim()) return;
    setSaving(true);
    try {
      const res  = await patch('/api/profile', { field: editField, value: editValue.trim() });
      const data = await res.json();
      if (data.ok || res.status === 200) { setEditField(null); load(); }
      else Alert.alert('Error', data.error || 'Save failed.');
    } catch (_) { Alert.alert('Error', 'Network error'); }
    finally { setSaving(false); }
  };

  const changePic = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Permission', 'Allow photo access.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
    if (result.canceled) return;
    setUploadingPic(true);
    try {
      const asset = result.assets[0];
      const fd    = new FormData();
      fd.append('profile_pic', { uri: asset.uri, name: asset.uri.split('/').pop(), type: asset.mimeType || 'image/jpeg' });
      const res = await api('/api/update_profile_pic', { method: 'POST', body: fd });
      if (res.status === 200) load();
      else Alert.alert('Error', 'Failed to update picture.');
    } catch (_) { Alert.alert('Error', 'Network error'); }
    finally { setUploadingPic(false); }
  };

  const changeCover = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Permission', 'Allow photo access.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 0.85 });
    if (result.canceled) return;
    setUploadingCover(true);
    try {
      const asset = result.assets[0];
      const fd    = new FormData();
      fd.append('cover_pic', { uri: asset.uri, name: asset.uri.split('/').pop(), type: asset.mimeType || 'image/jpeg' });
      const res = await api('/api/cover/pic', { method: 'POST', body: fd });
      if (res.status === 200) load();
      else Alert.alert('Error', 'Failed to update cover picture.');
    } catch (_) { Alert.alert('Error', 'Network error'); }
    finally { setUploadingCover(false); }
  };

  if (loading) return <View style={s.center}><ActivityIndicator color={colors.accent} size="large" /></View>;
  if (!profile) return <View style={s.center}><Text style={{ color: colors.textSub }}>Profile not found.</Text></View>;

  const fields = [
    { key: 'full_name',     label: 'Full Name',    value: profile.full_name },
    { key: 'bio',           label: 'Bio',          value: profile.bio },
    { key: 'branch',        label: 'Branch',       value: profile.branch },
    { key: 'hometown',      label: 'Hometown',     value: profile.hometown },
    { key: 'zodiac_sign',   label: 'Zodiac',       value: profile.zodiac_sign },
    { key: 'clubs_part_of', label: 'Clubs',        value: profile.clubs_part_of },
    { key: 'domain',        label: 'Domain',       value: profile.domain },
    { key: 'position',      label: 'Position',     value: profile.position },
  ];

  return (
    <SafeAreaView style={s.flex} edges={['top']}>
      <StatusBar style="light" />
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}>
        {/* Cover & Avatar */}
        <TouchableOpacity 
          style={s.cover} 
          activeOpacity={0.9} 
          onPress={() => profile?.cover_pic_url && setFullImage(`${BASE_URL}/api/cover_pic/${encodeURIComponent(user?.username)}?v=${encodeURIComponent(profile.cover_pic_url)}`)}
        >
          {profile?.cover_pic_url && (
            <Image source={{ uri: `${BASE_URL}/api/cover_pic/${encodeURIComponent(user?.username)}?v=${encodeURIComponent(profile.cover_pic_url)}` }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
          )}
          <TouchableOpacity style={s.editCoverBadge} onPress={changeCover}>
            {uploadingCover ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="camera" size={16} color="#fff" />}
          </TouchableOpacity>
        </TouchableOpacity>
        <View style={s.profileHeader}>
          <View style={s.avatarWrap}>
            <TouchableOpacity onPress={() => setFullImage(`${BASE_URL}/api/profile_pic/${encodeURIComponent(user?.username)}?v=${encodeURIComponent(profile?.profile_pic_url || Date.now())}`)} activeOpacity={0.9}>
              <Avatar username={user?.username} size={88} timestamp={profile?.profile_pic_url} />
            </TouchableOpacity>
            <TouchableOpacity style={s.editPicBadge} onPress={changePic}>
              {uploadingPic ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="camera" size={14} color="#fff" />}
            </TouchableOpacity>
          </View>
          <View style={s.infoWrap}>
            <View style={s.titleRow}>
              <View style={s.nameArea}>
                <Text style={s.name}>{profile.full_name}</Text>
                <Text style={s.username}>@{user?.username}</Text>
              </View>
              <TouchableOpacity style={s.logoutBtn} onPress={logout}>
                <Ionicons name="log-out-outline" size={18} color={colors.accent} />
                <Text style={s.logoutText}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Stats */}
        <View style={s.stats}>
          {[
            { label: 'Posts', value: posts.length },
            { label: 'Year', value: profile.year },
            { label: 'Branch', value: profile.branch || '—' },
          ].map(({ label, value }) => (
            <View key={label} style={s.stat}>
              <Text style={s.statVal}>{value || '—'}</Text>
              <Text style={s.statLabel}>{label}</Text>
            </View>
          ))}
        </View>

        {/* Connections button */}
        <TouchableOpacity style={s.connectionsBtn} onPress={() => navigation.navigate('Connections')}>
          <Ionicons name="people-outline" size={18} color={colors.accent} />
          <Text style={s.connectionsBtnText}>Manage Connections</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        {/* Profile Fields */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Profile Info</Text>
          {fields.map(({ key, label, value }) => (
            <View key={key} style={s.fieldRow}>
              {editField === key ? (
                <View style={s.editInline}>
                  <TextInput
                    style={s.editInput}
                    value={editValue}
                    onChangeText={setEditValue}
                    autoFocus
                    multiline={key === 'bio'}
                  />
                  <TouchableOpacity style={s.saveBtn} onPress={saveField} disabled={saving}>
                    {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.saveBtnText}>Save</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity style={s.cancelBtn} onPress={() => setEditField(null)}>
                    <Text style={s.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>{label}</Text>
                    <Text style={s.fieldValue}>{value || '—'}</Text>
                  </View>
                  <TouchableOpacity onPress={() => { setEditField(key); setEditValue(value || ''); }}>
                    <Ionicons name="pencil" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                </>
              )}
            </View>
          ))}
        </View>

        {/* My Posts Grid */}
        {posts.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>My Posts</Text>
            <View style={s.postsGrid}>
              {posts.slice(0, 6).map(p => (
                <TouchableOpacity 
                  key={p.id} 
                  style={s.postThumb} 
                  activeOpacity={0.8}
                  onPress={() => navigation.navigate('Posts', { targetPostId: p.id })}
                >
                  {p.image_filename || p.image_url
                    ? <Image source={{ uri: `${require('../../config').BASE_URL}/api/image/${p.id}` }} style={s.thumbImg} resizeMode="cover" />
                    : <View style={s.textThumb}><Text style={s.textThumbText} numberOfLines={3}>{p.caption}</Text></View>}
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
  flex:           { flex: 1, backgroundColor: colors.bg },
  center:         { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  cover:          { width: '100%', aspectRatio: 16/9, backgroundColor: colors.accentSoft },
  editCoverBadge: { position: 'absolute', bottom: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 16, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  profileHeader:  { flexDirection: 'row', paddingHorizontal: spacing.md, marginBottom: spacing.md },
  avatarWrap:     { position: 'relative', marginTop: -44, marginRight: spacing.md },
  editPicBadge:   { position: 'absolute', bottom: 0, right: 0, backgroundColor: colors.accent, borderRadius: 14, width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg },
  infoWrap:       { flex: 1, paddingTop: spacing.sm },
  titleRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  nameArea:       { flex: 1, paddingRight: spacing.sm },
  name:           { color: colors.white, fontWeight: '800', fontSize: font.lg },
  username:       { color: colors.textMuted, fontSize: font.sm },
  logoutBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.accent },
  logoutText:     { color: colors.accent, fontSize: font.sm, fontWeight: '700' },
  stats:          { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, marginTop: spacing.sm },
  stat:           { alignItems: 'center' },
  statVal:        { color: colors.white, fontWeight: '800', fontSize: font.lg },
  statLabel:      { color: colors.textMuted, fontSize: font.xs, marginTop: 2 },
  connectionsBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  connectionsBtnText: { flex: 1, color: colors.accent, fontWeight: '600', fontSize: font.md },
  section:        { padding: spacing.md },
  sectionTitle:   { color: colors.white, fontWeight: '700', fontSize: font.lg, marginBottom: spacing.sm },
  fieldRow:       { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center' },
  fieldLabel:     { color: colors.textMuted, fontSize: font.xs, fontWeight: '600', marginBottom: 2 },
  fieldValue:     { color: colors.text, fontSize: font.md },
  editInline:     { flex: 1 },
  editInput:      { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.sm, color: colors.text, borderWidth: 1, borderColor: colors.accent, marginBottom: spacing.xs },
  saveBtn:        { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 8, alignItems: 'center', marginBottom: 4 },
  saveBtnText:    { color: colors.white, fontWeight: '700' },
  cancelBtn:      { alignItems: 'center' },
  cancelBtnText:  { color: colors.textMuted, fontSize: font.sm },
  postsGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  postThumb:      { width: THUMB, height: THUMB, borderRadius: radius.sm, overflow: 'hidden' },
  thumbImg:       { width: '100%', height: '100%' },
  textThumb:      { width: '100%', height: '100%', backgroundColor: colors.purple + '33', padding: spacing.xs, justifyContent: 'center' },
  textThumbText:  { color: colors.white, fontSize: font.xs },
});
