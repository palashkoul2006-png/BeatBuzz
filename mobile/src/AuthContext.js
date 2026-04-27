import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { get, loadCookie, clearCookie } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);   // { username }
  const [loading, setLoading] = useState(true);

  // On app start: restore cookie, then check session
  useEffect(() => {
    (async () => {
      await loadCookie();
      try {
        const res  = await get('/api/session_user');
        const data = await res.json();
        if (data.username) setUser({ username: data.username });
      } catch (_) {}
      setLoading(false);
    })();
  }, []);

  const login = (username) => setUser({ username });

  const logout = async () => {
    try { await get('/logout'); } catch (_) {}
    await clearCookie();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
