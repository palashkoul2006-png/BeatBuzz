import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView, Platform,
  KeyboardAvoidingView, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing, radius, font, shadow } from '../../theme';
import { api } from '../../api';
import { useAuth } from '../../AuthContext';
import { BASE_URL } from '../../config';

const ZODIAC = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
const BRANCHES = ['Computer Science','IT','Mechanical','Civil','Electronics','Electrical','Chemical','Data Science','AI/ML','Other'];
const YEARS = ['1','2','3','4'];

export default function ProfileSetupScreen({ navigation, route }) {
  const { login }                   = useAuth();
  const { email }                   = route.params || {};
  const [fullName, setFullName]     = useState('');
  const [branch, setBranch]         = useState('');
  const [year, setYear]             = useState('');
  const [hometown, setHometown]     = useState('');
  const [bio, setBio]               = useState('');
  const [zodiac, setZodiac]         = useState('');
  const [clubs, setClubs]           = useState('');
  const [domain, setDomain]         = useState('');
  const [position, setPosition]     = useState('');
  const [profilePic, setProfilePic] = useState(null);
  const [loading, setLoading]       = useState(false);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) setProfilePic(result.assets[0]);
  };

  const handleSubmit = async () => {
    if (!fullName.trim() || !branch || !year || !hometown.trim() || !bio.trim() || !zodiac) {
      return Alert.alert('BeatBuzz', 'Please fill all required fields (*).');
    }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('email', email);
      fd.append('full_name', fullName.trim());
      fd.append('branch', branch);
      fd.append('year', year);
      fd.append('hometown', hometown.trim());
      fd.append('bio', bio.trim());
      fd.append('zodiac_sign', zodiac);
      fd.append('clubs_part_of', clubs.trim());
      fd.append('domain', domain.trim());
      fd.append('position', position.trim());
      if (profilePic) {
        const uri  = profilePic.uri;
        const name = uri.split('/').pop();
        const type = profilePic.mimeType || 'image/jpeg';
        fd.append('profile_pic', { uri, name, type });
      }

      const res = await api('/submit_profile', { method: 'POST', body: fd });
      if (res.status === 200 || res.status === 302) {
        // Profile saved — check session
        const sessRes  = await api('/api/session_user');
        const sessData = await sessRes.json();
        if (sessData.username) {
          login(sessData.username);
        } else {
          Alert.alert('Done!', 'Profile created. Please log in.', [
            { text: 'OK', onPress: () => navigation.navigate('Login') },
          ]);
        }
      } else {
        const text = await res.text();
        Alert.alert('Error', text.replace(/<[^>]+>/g, '') || 'Profile save failed.');
      }
    } catch (e) {
      Alert.alert('Error', 'Cannot connect to server.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const Picker = ({ label, options, value, onSelect }) => (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={s.label}>{label} *</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {options.map(opt => (
          <TouchableOpacity
            key={opt}
            style={[s.chip, value === opt && s.chipActive]}
            onPress={() => onSelect(opt)}
          >
            <Text style={[s.chipText, value === opt && s.chipTextActive]}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Text style={s.heading}>Setup Your Profile</Text>
        <Text style={s.sub}>Tell the world who you are 🎵</Text>

        {/* Profile pic */}
        <TouchableOpacity style={s.picWrap} onPress={pickImage}>
          {profilePic
            ? <Image source={{ uri: profilePic.uri }} style={s.pic} />
            : <View style={s.picPlaceholder}><Text style={s.picText}>+ Photo</Text></View>}
        </TouchableOpacity>

        <Text style={s.label}>Full Name *</Text>
        <View style={s.inputWrap}>
          <TextInput style={s.input} placeholder="Your full name" placeholderTextColor={colors.textMuted}
            value={fullName} onChangeText={setFullName} />
        </View>

        <Picker label="Branch" options={BRANCHES} value={branch} onSelect={setBranch} />
        <Picker label="Year"   options={YEARS}    value={year}   onSelect={setYear} />
        <Picker label="Zodiac" options={ZODIAC}   value={zodiac} onSelect={setZodiac} />

        <Text style={s.label}>Hometown *</Text>
        <View style={s.inputWrap}>
          <TextInput style={s.input} placeholder="Your hometown" placeholderTextColor={colors.textMuted}
            value={hometown} onChangeText={setHometown} />
        </View>

        <Text style={s.label}>Bio *</Text>
        <View style={[s.inputWrap, { height: 100 }]}>
          <TextInput style={[s.input, { height: 90 }]} placeholder="Tell the world about you..."
            placeholderTextColor={colors.textMuted} value={bio} onChangeText={setBio}
            multiline numberOfLines={4} textAlignVertical="top" />
        </View>

        <Text style={s.label}>Clubs / Societies</Text>
        <View style={s.inputWrap}>
          <TextInput style={s.input} placeholder="e.g. GDSC, NSS" placeholderTextColor={colors.textMuted}
            value={clubs} onChangeText={setClubs} />
        </View>

        <Text style={s.label}>Domain of Interest</Text>
        <View style={s.inputWrap}>
          <TextInput style={s.input} placeholder="e.g. Web Dev, AI/ML" placeholderTextColor={colors.textMuted}
            value={domain} onChangeText={setDomain} />
        </View>

        <Text style={s.label}>Position / Role</Text>
        <View style={s.inputWrap}>
          <TextInput style={s.input} placeholder="e.g. President, Member" placeholderTextColor={colors.textMuted}
            value={position} onChangeText={setPosition} />
        </View>

        <TouchableOpacity style={s.btn} onPress={handleSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color={colors.white} /> : <Text style={s.btnText}>Save Profile</Text>}
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex:            { flex: 1, backgroundColor: colors.bg },
  scroll:          { padding: spacing.lg, paddingTop: spacing.xxl },
  heading:         { color: colors.white, fontSize: font.xxl, fontWeight: '800', marginBottom: 4 },
  sub:             { color: colors.textSub, fontSize: font.sm, marginBottom: spacing.lg },
  picWrap:         { alignSelf: 'center', marginBottom: spacing.lg },
  pic:             { width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: colors.accent },
  picPlaceholder:  { width: 100, height: 100, borderRadius: 50, backgroundColor: colors.card, borderWidth: 2, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  picText:         { color: colors.accent, fontWeight: '700' },
  label:           { color: colors.textSub, fontSize: font.sm, marginBottom: spacing.xs, fontWeight: '600' },
  inputWrap:       { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md, paddingHorizontal: spacing.md },
  input:           { color: colors.text, fontSize: font.md, paddingVertical: 14 },
  chip:            { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, marginRight: spacing.sm },
  chipActive:      { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  chipText:        { color: colors.textSub, fontSize: font.sm, fontWeight: '600' },
  chipTextActive:  { color: colors.accent },
  btn:             { backgroundColor: colors.accent, borderRadius: radius.lg, paddingVertical: 16, alignItems: 'center', marginTop: spacing.md },
  btnText:         { color: colors.white, fontSize: font.md, fontWeight: '700' },
});
