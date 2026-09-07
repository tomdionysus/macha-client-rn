import { Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MachaProvider, useMacha } from '../providers/MachaProvider';
import { PlaybackProvider } from '../providers/PlaybackProvider';
import { BottomNav } from '../ui/BottomNav';
import { MiniPlayer } from '../ui/MiniPlayer';
import { colors } from '../ui/theme';

void SplashScreen.preventAutoHideAsync();

/** Routes that own the whole window and must not be overlaid by docked chrome. */
const FULL_BLEED_ROUTES = ['/play', '/connect'];

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <MachaProvider>
          <PlaybackProvider>
            <AppShell />
          </PlaybackProvider>
        </MachaProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AppShell() {
  const { hydrated } = useMacha();
  const pathname = usePathname();

  // The splash stays up until persisted client state is readable, so the first
  // frame is never a momentarily empty library that then fills in.
  useEffect(() => {
    if (hydrated) void SplashScreen.hideAsync();
  }, [hydrated]);

  if (!hydrated) return <View style={styles.root} />;

  const chromeVisible = !FULL_BLEED_ROUTES.some((route) => pathname.startsWith(route));

  return (
    <View style={styles.root}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}>
        <Stack.Screen name="index" options={{ animation: 'fade' }} />
        <Stack.Screen name="connect" options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="play" options={{ animation: 'slide_from_bottom' }} />
      </Stack>
      {chromeVisible ? (
        <View style={styles.chrome} pointerEvents="box-none">
          <MiniPlayer />
          <BottomNav />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  chrome: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
});
