package foundation.macha.codecs

import android.content.Context
import android.media.MediaCodecList
import android.view.Display
import android.view.WindowManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * What this device can actually decode, asked of the platform.
 *
 * This exists because the client used to assert it. `capabilities.ts` claimed
 * `ac3` and `eac3` on every Android device on the grounds that they were
 * "the platform's own guaranteed decoders", and on 2026-09-21 the Blackview
 * A85 turned out to have neither: the node Direct Played those titles, media3
 * selected no audio track, and two films played in silence with a healthy
 * picture and nothing logged anywhere.
 *
 * The stopgap was to stop claiming them, which is safe but wrong the other
 * way — a device that does have an AC-3 decoder then pays for a transform it
 * never needed. This asks instead.
 *
 * `REGULAR_CODECS` rather than `ALL_CODECS` deliberately: it is the set the
 * framework will select from by default, which is what media3's
 * `MediaCodecUtil` consults, so this answers the question that actually
 * governs playback rather than a wider one about what the hardware could be
 * persuaded to do.
 */
class MachaCodecsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MachaCodecs")

    /**
     * Decoder MIME types mapped to the profile ids each one advertises.
     *
     * Profiles are returned raw. Their meaning is codec-specific and the
     * numbers collide across codecs — `2` is `AV1ProfileMain10` and also
     * `HEVCProfileMain10`, while `16` is `AVCProfileHigh10` — so nothing here
     * interprets them. `codecProbe.ts` holds the table, keyed by MIME type,
     * where it can be tested without a device.
     *
     * The keys are also the complete decodable-type list, so this is the only
     * call: a type with no advertised profiles is present with an empty list,
     * which is the ordinary case for audio.
     *
     * Bit depth is the reason this returns profiles at all. The client
     * hardcoded `videoBitDepth: 8` from the day the file was written, and on
     * this device that is true of HEVC (`Main`, `MainStill`) and false of AV1
     * (`Main10HDR10`, `Main10HDRPlus`) — a distinction no single declared
     * number can carry, and one nobody could have known without asking.
     */
    Function("decodableProfiles") {
      val out = mutableMapOf<String, MutableSet<Int>>()
      for (info in MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos) {
        if (info.isEncoder) continue
        for (type in info.supportedTypes) {
          val profiles = out.getOrPut(type.lowercase()) { mutableSetOf() }
          // A codec can refuse to describe a type it just listed; that is a
          // gap in the answer, not a reason to abandon the whole enumeration.
          val capabilities = runCatching { info.getCapabilitiesForType(type) }.getOrNull() ?: continue
          capabilities.profileLevels?.forEach { profiles.add(it.profile) }
        }
      }
      out.mapValues { (_, profiles) -> profiles.toList() }
    }

    /**
     * The HDR types the **display** can present, as `Display.HdrCapabilities`
     * constants: 1 Dolby Vision, 2 HDR10, 3 HLG, 4 HDR10+.
     *
     * A decoder and a panel are different questions and the client was
     * conflating them in both directions — claiming no HDR at all because the
     * phone is "not a reference display", which is a panel argument applied to
     * a decode field. The television client resolved it by intersecting the
     * two, and this is the same idea: decode says what can be read, this says
     * what can be shown, and only the intersection is worth claiming.
     *
     * Empty is a real answer meaning an SDR panel. An exception is not — the
     * call needs a window, so a headless or torn-down context returns nothing
     * and the caller treats that as unknown rather than as "no HDR".
     */
    Function("displayHdrTypes") {
      // Expressed as one nullable chain rather than early returns: the
      // Function builder infers the lambda's type, and a bare `return@Function
      // null` leaves it with nothing to infer from.
      val manager = appContext.reactContext?.getSystemService(Context.WINDOW_SERVICE) as? WindowManager
      @Suppress("DEPRECATION")
      val display: Display? = manager?.defaultDisplay
      @Suppress("DEPRECATION")
      val types: List<Int>? = display?.hdrCapabilities?.supportedHdrTypes?.toList()
      types
    }
  }
}
