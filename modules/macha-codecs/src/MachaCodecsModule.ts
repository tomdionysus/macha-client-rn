import { NativeModule, requireOptionalNativeModule } from 'expo';

declare class MachaCodecsModule extends NativeModule<{}> {
  /**
   * Decoder MIME types, lowercased, mapped to the raw profile ids each
   * advertises. Keys are the full decodable-type list; an empty array means
   * the type is decodable but describes no profiles.
   */
  decodableProfiles(): Record<string, number[]>;

  /**
   * HDR types the display can present, as `Display.HdrCapabilities`
   * constants: 1 Dolby Vision, 2 HDR10, 3 HLG, 4 HDR10+. `null` when the
   * platform could not be asked — distinct from `[]`, an SDR panel.
   */
  displayHdrTypes(): number[] | null;

  /**
   * Largest standard 16:9 frame decodable at 24 fps, per lowercased MIME type,
   * preferring hardware decoders. Types that cannot manage 360p are absent.
   */
  videoDecoderSizes(): Record<string, { width: number; height: number }>;
}

/**
 * `null` where the native module is absent (it is Android-only), so iOS and web
 * fall back to their declared codec lists instead of throwing on import.
 */
export default requireOptionalNativeModule<MachaCodecsModule>('MachaCodecs');
