import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView, Image,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing, radius, font, shadow } from '../../theme';
import { api } from '../../api';

export default function RegisterScreen({ navigation }) {
  const [username, setUsername] = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);

  const handleRegister = async () => {
    if (!username.trim() || !email.trim() || !password.trim()) {
      return Alert.alert('BeatBuzz', 'Please fill in all fields.');
    }
    if (password.length < 6) {
      return Alert.alert('BeatBuzz', 'Password must be at least 6 characters.');
    }
    setLoading(true);
    try {
      const res  = await api('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), email: email.trim(), password }),
      });
      const data = await res.json();
      if (data.ok) {
        Alert.alert('✅ Success', 'OTP sent to your email!', [
          { text: 'Verify', onPress: () => navigation.navigate('OtpVerify', { username: username.trim(), email: email.trim() }) },
        ]);
      } else {
        Alert.alert('Registration Failed', data.message || 'Something went wrong.');
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
        <TouchableOpacity style={s.back} onPress={() => navigation.goBack()}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>

        <View style={s.header}>
          <Image source={require('../../../assets/icon.png')} style={s.logoImage} resizeMode="contain" />
          <Text style={s.title}>Create Account</Text>
          <Text style={s.sub}>Join the BeatBuzz community</Text>
        </View>

        <View style={[s.card, shadow.card]}>
          {[
            { label: 'Username',      value: username,  setter: setUsername,  placeholder: 'Choose a username',  secure: false },
            { label: 'Email',         value: email,     setter: setEmail,     placeholder: 'Enter your email',    secure: false, keyboardType: 'email-address' },
          ].map(({ label, value, setter, placeholder, keyboardType }) => (
            <View key={label}>
              <Text style={s.label}>{label}</Text>
              <View style={s.inputWrap}>
                <TextInput
                  style={s.input}
                  placeholder={placeholder}
                  placeholderTextColor={colors.textMuted}
                  value={value}
                  onChangeText={setter}
                  autoCapitalize="none"
                  keyboardType={keyboardType || 'default'}
                />
              </View>
            </View>
          ))}

          <Text style={s.label}>Password</Text>
          <View style={s.inputWrap}>
            <TextInput
              style={[s.input, { flex: 1 }]}
              placeholder="Create a password"
              placeholderTextColor={colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPw}
            />
            <TouchableOpacity onPress={() => setShowPw(v => !v)} style={s.eye}>
              <Text style={{ color: colors.textSub }}>{showPw ? '🙈' : '👁'}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={s.btnPrimary} onPress={handleRegister} disabled={loading}>
            {loading
              ? <ActivityIndicator color={colors.white} />
              : <Text style={s.btnText}>Register</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={s.link}>Already have an account? Sign in</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex:      { flex: 1, backgroundColor: colors.bg },
  scroll:    { flexGrow: 1, padding: spacing.lg, paddingTop: spacing.xxl },
  back:      { marginBottom: spacing.md },
  backText:  { color: colors.accent, fontSize: font.md },
  header:    { alignItems: 'center', marginBottom: spacing.xl },
  logoImage: {
    width: 64, height: 64, 
    marginBottom: spacing.sm,
  },
  title:     { color: colors.white, fontSize: font.xxl, fontWeight: '800' },
  sub:       { color: colors.textSub, fontSize: font.sm, marginTop: 4 },
  card:      {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border,
  },
  label:     { color: colors.textSub, fontSize: font.sm, marginBottom: spacing.xs, fontWeight: '600' },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.md, paddingHorizontal: spacing.md,
  },
  input:     { color: colors.text, fontSize: font.md, paddingVertical: 14, flex: 1 },
  eye:       { padding: spacing.xs },
  btnPrimary:{ backgroundColor: colors.accent, borderRadius: radius.lg, paddingVertical: 15, alignItems: 'center', marginTop: spacing.sm },
  btnText:   { color: colors.white, fontSize: font.md, fontWeight: '700' },
  link:      { color: colors.accent, textAlign: 'center', marginTop: spacing.md, fontSize: font.sm },
});
