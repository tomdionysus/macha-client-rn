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
}

/**
 * `null` wherever the native module is not present.
 *
 * Optional rather than required on purpose: this module is Android-only, and
 * a missing probe must fall back to the declared list rather than throw on
 * import. iOS and web have no `MediaCodecList` and keep their static claims.
 */
export default requireOptionalNativeModule<MachaCodecsModule>('MachaCodecs');
