import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signInFailureMessage } from '../api/failureMessages';
import { useMacha } from '../providers/MachaProvider';
import { usePlayback } from '../providers/PlaybackProvider';
import { Button } from '../ui/controls';
import { MachaLogo } from '../ui/Logo';
import { colors, radius, space, type as typography } from '../ui/theme';

/**
 * Sign in as a named user. Every viewer already holds a session (empty
 * credentials authenticate `anonymous`), so this swaps it for a named one, and
 * is reached from the header and Settings rather than gating the app.
 */
export default function LoginScreen() {
  const { signIn } = useMacha();
  const { stop } = usePlayback();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const passwordField = useRef<TextInput>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | undefined>(undefined);

  const submit = useCallback(async () => {
    setBusy(true);
    setMessage(undefined);
    try {
      // Stop playback first: sign-in replaces the token, and a playback session
      // opened under the old one can no longer be closed, so the node holds it
      // against `max_video_transcodes` until `session_idle` (30 min).
      await stop();
      await signIn({ username: username.trim(), password });
      setPassword('');
      router.back();
    } catch (error) {
      // One message for every refusal: a node answers an unknown username and a
      // wrong password identically, and the wording must not reveal which.
      setMessage(signInFailureMessage(error));
      setPassword('');
    } finally {
      setBusy(false);
    }
  }, [password, router, signIn, stop, username]);

  const ready = username.trim().length > 0 && password.length > 0;

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xxl }]}
        keyboardShouldPersistTaps="handled">
        <MachaLogo size={72} opacity={0.9} style={styles.logo} />
        <Text style={styles.title}>Log in</Text>
        <Text style={styles.lede}>
          Sign in to reach everything your account allows. Browsing without one is a supported way to use Macha, not a
          lesser one.
        </Text>

        <Text style={styles.label}>Username</Text>
        <TextInput
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
          returnKeyType="next"
          onSubmitEditing={() => passwordField.current?.focus()}
          editable={!busy}
          style={styles.input}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          ref={passwordField}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={() => ready && !busy && void submit()}
          editable={!busy}
          style={styles.input}
        />

        {message ? <Text style={styles.error}>{message}</Text> : null}

        <Button label="Log in" onPress={() => void submit()} busy={busy} disabled={!ready} style={styles.submit} />
        <Button label="Continue as guest" variant="quiet" onPress={() => router.back()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: space.xl,
  },
  logo: {
    alignSelf: 'center',
  },
  title: {
    ...typography.display,
    fontSize: 28,
    color: colors.text,
    textAlign: 'center',
    marginTop: space.md,
  },
  lede: {
    ...typography.body,
    color: colors.textDim,
    textAlign: 'center',
    marginTop: space.md,
    marginBottom: space.xxl,
    lineHeight: 21,
  },
  label: {
    ...typography.micro,
    color: colors.textFaint,
    marginBottom: space.sm,
  },
  input: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: 50,
    marginBottom: space.lg,
  },
  error: {
    ...typography.body,
    color: colors.danger,
    marginBottom: space.lg,
  },
  submit: {
    marginTop: space.sm,
    marginBottom: space.md,
  },
});
