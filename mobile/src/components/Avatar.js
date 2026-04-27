import React, { useState } from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { BASE_URL } from '../config';
import { colors } from '../theme';

export default function Avatar({ username, size = 40, style, timestamp }) {
  const [error, setError] = useState(false);
  const uri = `${BASE_URL}/api/profile_pic/${encodeURIComponent(username || 'unknown')}${timestamp ? `?v=${encodeURIComponent(timestamp)}` : ''}`;

  if (error || !username) {
    const initials = (username || '?').slice(0, 2).toUpperCase();
    return (
      <View style={[s.fallback, { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.accentSoft }, style]}>
        <Text style={[s.initials, { fontSize: size * 0.35 }]}>{initials}</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={[{ width: size, height: size, borderRadius: size / 2 }, style]}
      onError={() => setError(true)}
    />
  );
}

const s = StyleSheet.create({
  fallback:  { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.accent },
  initials:  { color: colors.accent, fontWeight: '800' },
});
