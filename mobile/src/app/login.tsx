import { Redirect } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardReveal, useKeyboardAware } from '@/components/keyboard';
import { Banner, Button, Field, Foot, Icon, P, s } from '@/components/ui';
import { useApp } from '@/lib/app';
import { C } from '@/lib/theme';

const DEMO_EMAIL = 'driver@demo.id', DEMO_PASSWORD = 'demo1234';

export default function Login() {
  const { status, signIn } = useApp();
  // Hackathon demo build: prefilled with the public demo driver (server DEMO_MODE). Clear these for a real deployment.
  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);
  const { scrollRef, onScroll, bottomInset, reveal } = useKeyboardAware();
  if (status === 'signedIn') return <Redirect href="/" />;

  const ready = !!email.trim() && !!password;
  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true); setError(null);
    try { await signIn(email.trim(), password); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <SafeAreaView style={[s.safe, { backgroundColor: C.surface }]}>
      <KeyboardReveal value={reveal}>
        {/* Email and password sit in the top half so the keyboard rarely covers them. */}
        <ScrollView ref={scrollRef} onScroll={onScroll} scrollEventThrottle={16} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingTop: 28, paddingBottom: 24 + bottomInset }}>
          <View style={[s.row, { gap: 12, marginBottom: 20 }]}>
            <View style={[s.brandmark, { width: 44, height: 44, borderRadius: 14 }]}><Icon name="alt-route" color="#fff" size={24} /></View>
            <View><Text style={s.h1}>KiloMetric Driver</Text><P muted small>Sign in to view your assignments.</P></View>
          </View>
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} autoComplete="email" keyboardType="email-address" textContentType="username" returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => passwordRef.current?.focus()} />
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <Field label="Password" inputRef={passwordRef} value={password} onChangeText={setPassword} secureTextEntry={!show} autoCapitalize="none" autoCorrect={false} textContentType="password" returnKeyType="go" onSubmitEditing={submit} />
            <View style={{ marginBottom: 33 }}><Button kind="flat" title={show ? 'Hide' : 'Show'} onPress={() => setShow(!show)} /></View>
          </View>
          {error && <Banner tone="error">{error}</Banner>}
          <Button title="Sign in" icon="arrow-forward" onPress={submit} loading={busy} disabled={!ready} />
          <Foot>Demo driver account is filled in.</Foot>
        </ScrollView>
      </KeyboardReveal>
    </SafeAreaView>
  );
}
