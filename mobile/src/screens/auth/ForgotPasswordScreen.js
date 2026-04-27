import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing, radius, font, shadow } from '../../theme';
import { api } from '../../api';

export default function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handle = async () => {
    if (!email.trim()) return Alert.alert('BeatBuzz', 'Enter your email.');
    setLoading(true);
    try {
      const res  = await api('/api/forgot_password_otp_request', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      Alert.alert('📬', data.message || 'If the account exists, an OTP has been sent.');
    } catch (_) {
      Alert.alert('Error', 'Cannot connect to server.');
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
          <Text style={s.emoji}>🔑</Text>
          <Text style={s.title}>Forgot Password</Text>
          <Text style={s.sub}>Enter your email to receive a reset OTP</Text>
        </View>
        <View style={[s.card, shadow.card]}>
          <Text style={s.label}>Email</Text>
          <View style={s.inputWrap}>
            <TextInput
              style={s.input}
              placeholder="Enter your email"
              placeholderTextColor={colors.textMuted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>
          <TouchableOpacity style={s.btn} onPress={handle} disabled={loading}>
            {loading ? <ActivityIndicator color={colors.white} /> : <Text style={s.btnText}>Send OTP</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex:      { flex: 1, backgroundColor: colors.bg },
  scroll:    { flexGrow: 1, padding: spacing.lg, paddingTop: spacing.xxl },
  back:      { marginBottom: spacing.lg },
  backText:  { color: colors.accent, fontSize: font.md },
  header:    { alignItems: 'center', marginBottom: spacing.xl },
  emoji:     { fontSize: 48, marginBottom: spacing.sm },
  title:     { color: colors.white, fontSize: font.xxl, fontWeight: '800' },
  sub:       { color: colors.textSub, fontSize: font.sm, marginTop: 8, textAlign: 'center' },
  card:      { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  label:     { color: colors.textSub, fontSize: font.sm, marginBottom: spacing.xs, fontWeight: '600' },
  inputWrap: { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md, paddingHorizontal: spacing.md },
  input:     { color: colors.text, fontSize: font.md, paddingVertical: 14 },
  btn:       { backgroundColor: colors.accent, borderRadius: radius.lg, paddingVertical: 15, alignItems: 'center' },
  btnText:   { color: colors.white, fontSize: font.md, fontWeight: '700' },
});
