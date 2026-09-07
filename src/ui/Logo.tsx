import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { MACHA_LOGO_SVG } from './machaLogo';

export function MachaLogo({ size = 40, opacity = 1, style }: { size?: number; opacity?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ width: size, height: size, opacity }, style]} pointerEvents="none">
      <SvgXml xml={MACHA_LOGO_SVG} width={size} height={size} />
    </View>
  );
}

/**
 * The subtle centred mark behind ordinary application screens. It is excluded
 * from playback, where anything drawn over the picture is a defect.
 */
export function Watermark() {
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: '38%', left: 0, right: 0, alignItems: 'center' }}>
      <MachaLogo size={260} opacity={0.035} />
    </View>
  );
}
