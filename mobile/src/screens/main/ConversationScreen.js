import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Image, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing, radius, font } from '../../theme';
import { get, api } from '../../api';
import { useAuth } from '../../AuthContext';
import Avatar from '../../components/Avatar';
import { BASE_URL } from '../../config';
import { useFocusEffect } from '@react-navigation/native';

export default function ConversationScreen({ navigation, route }) {
  const { username, fullName }    = route.params;
  const { user }                  = useAuth();
  const [messages, setMessages]   = useState([]);
  const [text, setText]           = useState('');
  const [loading, setLoading]     = useState(true);
  const listRef                   = useRef(null);
  const intervalRef               = useRef(null);

  const load = useCallback(async () => {
    try {
      const res  = await get(`/api/messages/${username}`);
      const data = await res.json();
      setMessages(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [username]);

  useFocusEffect(
    useCallback(() => {
      load();
      intervalRef.current = setInterval(load, 3000); // Poll every 3s
      return () => clearInterval(intervalRef.current);
    }, [load])
  );

  const prevLength = useRef(0);

  useEffect(() => {
    if (messages.length > prevLength.current) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      prevLength.current = messages.length;
    }
  }, [messages]);

  const send = async () => {
    const msg = text.trim();
    if (!msg) return;
    setText('');
    try {
      const res = await api(`/api/messages/${encodeURIComponent(username)}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: msg }),
      });
      const data = await res.json();
      if (data.error) {
        // Restore the typed text and show the error
        setText(msg);
        Alert.alert('BeatBuzz', data.error);
        return;
      }
      load();
    } catch (e) { console.error(e); }
  };

  if (loading) return <View style={s.center}><ActivityIndicator color={colors.accent} size="large" /></View>;

  return (
    <SafeAreaView style={s.flex} edges={['top', 'bottom']}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Avatar username={username} size={36} style={{ marginLeft: spacing.sm }} />
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={s.headerName}>{fullName || username}</Text>
            <Text style={s.headerSub}>@{username}</Text>
          </View>
        </View>

        {/* Messages */}
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.sm }}
          renderItem={({ item }) => {
            const isMe = item.sender_username === user?.username || item.from_username === user?.username;
            let msgText = item.message_text || item.message || '';
            let storyId = null;
            
            const isDeleted = item.is_deleted_for_everyone === 1;

            const match = msgText.match(/\[STORY:(\d+)\]/);
            if (match) {
              storyId = match[1];
              msgText = msgText.replace(match[0], '').trim();
            }

            const handleDelete = () => {
              const options = [
                { text: 'Cancel', style: 'cancel' },
                { 
                  text: 'Delete for me', 
                  style: 'destructive', 
                  onPress: () => {
                    api(`/api/messages/${item.id}/delete`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ type: 'me' })
                    }).then(load);
                  }
                }
              ];

              if (isMe && !isDeleted) {
                options.push({
                  text: 'Delete for everyone',
                  style: 'destructive',
                  onPress: () => {
                    api(`/api/messages/${item.id}/delete`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ type: 'everyone' })
                    }).then(load);
                  }
                });
              }

              Alert.alert('Delete Message', 'Are you sure you want to delete this message?', options);
            };

            return (
              <View style={[s.msgWrap, isMe ? s.msgWrapMe : s.msgWrapOther]}>
                <TouchableOpacity 
                  activeOpacity={0.8}
                  onLongPress={handleDelete}
                  style={[s.bubble, isMe ? s.bubbleMe : s.bubbleOther, isDeleted && { opacity: 0.6 }]}
                >
                  {storyId && (
                    <Image 
                      source={{ uri: `${BASE_URL}/api/story_image/${storyId}` }} 
                      style={[s.storyThumb, { marginBottom: msgText ? 8 : 0 }]} 
                      resizeMode="cover" 
                    />
                  )}
                  {!!msgText && (
                    <Text style={[s.msgText, isMe && s.msgTextMe, isDeleted && { fontStyle: 'italic' }]}>{msgText}</Text>
                  )}
                </TouchableOpacity>
                <Text style={s.msgTime}>
                  {new Date(item.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            );
          }}
          ListEmptyComponent={<Text style={s.empty}>Say hello! 👋</Text>}
        />

        {/* Input */}
        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            placeholder="Type a message..."
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={setText}
            multiline
            onSubmitEditing={send}
          />
          <TouchableOpacity style={s.sendBtn} onPress={send}>
            <Ionicons name="send" size={18} color={colors.white} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex:          { flex: 1, backgroundColor: colors.bg },
  center:        { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  header:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerName:    { color: colors.white, fontWeight: '700', fontSize: font.md },
  headerSub:     { color: colors.textMuted, fontSize: font.xs },
  msgWrap:       { marginBottom: spacing.sm, maxWidth: '78%' },
  msgWrapMe:     { alignSelf: 'flex-end', alignItems: 'flex-end' },
  msgWrapOther:  { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble:        { borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 10 },
  bubbleMe:      { backgroundColor: colors.accent, borderBottomRightRadius: 4 },
  bubbleOther:   { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
  msgText:       { color: colors.text, fontSize: font.md, lineHeight: 20 },
  msgTextMe:     { color: colors.white },
  msgTime:       { color: colors.textMuted, fontSize: 10, marginTop: 2, marginHorizontal: 4 },
  empty:         { color: colors.textMuted, textAlign: 'center', marginTop: spacing.xxl },
  inputRow:      { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm },
  input:         { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 10, color: colors.text, fontSize: font.md, maxHeight: 100 },
  sendBtn:       { backgroundColor: colors.accent, borderRadius: radius.full, width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  storyThumb:    { width: 140, height: 200, borderRadius: radius.md, backgroundColor: colors.card },
});
