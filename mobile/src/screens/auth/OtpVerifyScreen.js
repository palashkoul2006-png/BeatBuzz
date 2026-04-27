import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing, radius, font, shadow } from '../../theme';
import { api } from '../../api';
import { useAuth } from '../../AuthContext';

export default function OtpVerifyScreen({ navigation, route }) {
  const { login }                   = useAuth();
  const { username, email }         = route.params || {};
  const [otp, setOtp]               = useState(['', '', '', '', '', '']);
  const [loading, setLoading]       = useState(false);
  const [resending, setResending]   = useState(false);
  const inputs                      = useRef([]);

  const handleChange = (text, idx) => {
    const digits = text.replace(/[^0-9]/g, '');
    const next   = [...otp];
    next[idx]    = digits.slice(-1);
    setOtp(next);
    if (digits && idx < 5) inputs.current[idx + 1]?.focus();
    if (!digits && idx > 0) inputs.current[idx - 1]?.focus();
  };

  const handleVerify = async () => {
    const code = otp.join('');
    if (code.length < 6) return Alert.alert('BeatBuzz', 'Enter all 6 digits of the OTP.');
    setLoading(true);
    try {
      const res  = await api('/api/verify_otp', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username, email, otp: code }),
      });
      const data = await res.json();
      if (data.ok) {
        Alert.alert('✅ Verified!', 'Email verified. Set up your profile.', [
          { text: 'Continue', onPress: () => navigation.navigate('ProfileSetup', { email }) },
        ]);
      } else {
        Alert.alert('Invalid OTP', data.message || 'Wrong or expired OTP.');
      }
    } catch (e) {
      Alert.alert('Error', 'Cannot connect to server.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      const res  = await api('/api/resend_otp', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username, email }),
      });
      const data = await res.json();
      Alert.alert(data.ok ? '✅ Sent' : 'Error', data.message);
    } catch (_) {
      Alert.alert('Error', 'Cannot connect to server.');
    } finally {
      setResending(false);
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
          <Text style={s.emoji}>📧</Text>
          <Text style={s.title}>Verify Email</Text>
          <Text style={s.sub}>Enter the 6-digit OTP sent to {email || 'your email'}</Text>
        </View>

        <View style={[s.card, shadow.card]}>
          <View style={s.otpRow}>
            {otp.map((digit, i) => (
              <TextInput
                key={i}
                ref={r => inputs.current[i] = r}
                style={[s.otpBox, digit ? s.otpFilled : null]}
                value={digit}
                onChangeText={t => handleChange(t, i)}
                keyboardType="numeric"
                maxLength={1}
                selectTextOnFocus
              />
            ))}
          </View>

          <TouchableOpacity style={s.btnPrimary} onPress={handleVerify} disabled={loading}>
            {loading
              ? <ActivityIndicator color={colors.white} />
              : <Text style={s.btnText}>Verify OTP</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={s.resend} onPress={handleResend} disabled={resending}>
            <Text style={s.resendText}>
              {resending ? 'Resending...' : "Didn't receive OTP? Resend"}
            </Text>
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
  otpRow:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.lg },
  otpBox:    {
    width: 46, height: 56, borderRadius: radius.md,
    borderWidth: 2, borderColor: colors.border,
    backgroundColor: colors.card,
    textAlign: 'center', fontSize: font.xl, color: colors.white,
    fontWeight: '700',
  },
  otpFilled: { borderColor: colors.accent },
  btnPrimary:{ backgroundColor: colors.accent, borderRadius: radius.lg, paddingVertical: 15, alignItems: 'center' },
  btnText:   { color: colors.white, fontSize: font.md, fontWeight: '700' },
  resend:    { marginTop: spacing.md, alignItems: 'center' },
  resendText:{ color: colors.accent, fontSize: font.sm },
});
