import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView, Image,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing, radius, font, shadow } from '../../theme';
import { api } from '../../api';
import { useAuth } from '../../AuthContext';

export default function LoginScreen({ navigation }) {
  const { login }               = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      return Alert.alert('BeatBuzz', 'Please enter username and password.');
    }
    setLoading(true);
    try {
      const res = await api('/login', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }) 
      });
      const text = await res.text();
      if (res.status === 200 && (res.url?.includes('explore') || text.includes('explore') || !text.includes('❌'))) {
        login(username.trim());
      } else {
        Alert.alert('Login Failed', text.replace(/<[^>]+>/g, '').trim() || 'Invalid credentials');
      }
    } catch (e) {
      Alert.alert('Error', 'Cannot connect to server. Check your network.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        {/* Hero */}
        <View style={s.hero}>
          <Image source={require('../../../assets/icon.png')} style={s.logoImage} resizeMode="contain" />
          <Text style={s.appName}>BeatBuzz</Text>
          <Text style={s.tagline}>Your vibe, amplified.</Text>
        </View>

        {/* Card */}
        <View style={[s.card, shadow.card]}>
          <Text style={s.title}>Sign in</Text>

          <Text style={s.label}>Username</Text>
          <View style={s.inputWrap}>
            <TextInput
              style={s.input}
              placeholder="Enter username"
              placeholderTextColor={colors.textMuted}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <Text style={s.label}>Password</Text>
          <View style={s.inputWrap}>
            <TextInput
              style={[s.input, { flex: 1 }]}
              placeholder="Enter password"
              placeholderTextColor={colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPw}
            />
            <TouchableOpacity onPress={() => setShowPw(v => !v)} style={s.eye}>
              <Text style={{ color: colors.textSub, fontSize: font.md }}>{showPw ? '🙈' : '👁'}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={s.btnPrimary} onPress={handleLogin} disabled={loading}>
            {loading
              ? <ActivityIndicator color={colors.white} />
              : <Text style={s.btnText}>Sign in</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={s.btnSecondary} onPress={() => navigation.navigate('Register')}>
            <Text style={s.btnSecText}>Create Account</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
            <Text style={s.link}>Forgot password?</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex:       { flex: 1, backgroundColor: colors.bg },
  scroll:     { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  hero:       { alignItems: 'center', marginBottom: spacing.xl },
  logoImage:  {
    width: 80, height: 80, 
    marginBottom: spacing.sm,
  },
  appName:    { color: colors.white,  fontSize: font.xxxl, fontWeight: '800', letterSpacing: 1 },
  tagline:    { color: colors.textSub, fontSize: font.md, marginTop: 4 },
  card:       {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border,
  },
  title:      { color: colors.white, fontSize: font.xl, fontWeight: '700', marginBottom: spacing.lg },
  label:      { color: colors.textSub, fontSize: font.sm, marginBottom: spacing.xs, fontWeight: '600' },
  inputWrap:  {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.md, paddingHorizontal: spacing.md,
  },
  input:      { color: colors.text, fontSize: font.md, paddingVertical: 14, flex: 1 },
  eye:        { padding: spacing.xs },
  btnPrimary: {
    backgroundColor: colors.accent, borderRadius: radius.lg,
    paddingVertical: 15, alignItems: 'center', marginTop: spacing.sm,
  },
  btnText:    { color: colors.white, fontSize: font.md, fontWeight: '700' },
  btnSecondary: {
    backgroundColor: 'transparent', borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    paddingVertical: 14, alignItems: 'center', marginTop: spacing.sm,
  },
  btnSecText: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  link:       { color: colors.accent, textAlign: 'center', marginTop: spacing.md, fontSize: font.sm },
});
