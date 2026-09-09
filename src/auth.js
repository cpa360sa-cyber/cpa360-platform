import { supabase } from "./supabase.js";

// where Supabase should send the user back after an email link
const redirectTo = () => location.origin + location.pathname;

export const signIn = (email, password) =>
  supabase.auth.signInWithPassword({ email, password });

export const signUp = (email, password) =>
  supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo() } });

export const sendMagicLink = (email) =>
  supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });

export const sendReset = (email) =>
  supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() });

export const setPassword = (password) =>
  supabase.auth.updateUser({ password });

export const signOut = () => supabase.auth.signOut();

export const getSession = () =>
  supabase.auth.getSession().then((r) => r.data.session);

export const getUser = () =>
  supabase.auth.getUser().then((r) => r.data.user);

// cb(event, session) — events include SIGNED_IN, SIGNED_OUT, PASSWORD_RECOVERY
export const onAuth = (cb) =>
  supabase.auth.onAuthStateChange((event, session) => cb(event, session));
