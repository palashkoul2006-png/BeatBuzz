import React, { useState } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing, radius, font, shadow } from '../../theme';
import { get } from '../../api';
import Avatar from '../../components/Avatar';

export default function SearchScreen({ navigation }) {
  const [query, setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true); setSearched(true);
    try {
      const res  = await get(`/api/search_v2?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={s.flex} edges={['top']}>
      <StatusBar style="light" />
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={s.searchBar}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={s.input}
            placeholder="Search users..."
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={search}
            returnKeyType="search"
            autoFocus
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); setResults([]); setSearched(false); }}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={s.searchBtn} onPress={search}>
          <Text style={s.searchBtnText}>Go</Text>
        </TouchableOpacity>
      </View>

      {loading
        ? <View style={s.center}><ActivityIndicator color={colors.accent} /></View>
        : (
          <FlatList
            data={results}
            keyExtractor={i => i.username}
            contentContainerStyle={{ padding: spacing.md }}
            ListEmptyComponent={searched ? <Text style={s.empty}>No users found for "{query}"</Text> : <Text style={s.empty}>Search for people to connect 🎵</Text>}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[s.row, shadow.card]}
                onPress={() => navigation.navigate('UserProfile', { username: item.username })}
              >
                <Avatar username={item.username} size={46} />
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={s.name}>{item.full_name}</Text>
                  <Text style={s.sub}>@{item.username} · {item.zodiac_sign || '♒'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          />
        )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex:        { flex: 1, backgroundColor: colors.bg },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
  back:        { padding: 4 },
  searchBar:   { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border },
  input:       { flex: 1, color: colors.text, fontSize: font.md, paddingVertical: 12, marginLeft: spacing.xs },
  searchBtn:   { backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10 },
  searchBtnText:{ color: colors.white, fontWeight: '700', fontSize: font.sm },
  row:         { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  name:        { color: colors.white, fontWeight: '700', fontSize: font.md },
  sub:         { color: colors.textMuted, fontSize: font.sm, marginTop: 2 },
  empty:       { color: colors.textMuted, textAlign: 'center', marginTop: spacing.xxl, fontSize: font.md },
});
