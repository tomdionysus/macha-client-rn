package foundation.macha.codecs

import android.content.Context
import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.os.Build
import android.view.Display
import android.view.WindowManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * What this device can actually decode and display, asked of the platform
 * rather than assumed: decoder sets vary (some Android devices lack AC-3, for
 * instance), and a wrong claim plays silently or pays for a needless transform.
 *
 * Uses `REGULAR_CODECS`, the set media3's `MediaCodecUtil` selects from, not
 * `ALL_CODECS`.
 */
class MachaCodecsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MachaCodecs")

    /**
     * Decoder MIME types (lowercased) mapped to the raw profile ids each
     * advertises; profiles give per-codec bit depth. Ids collide across codecs
     * (`2` is both AV1 and HEVC Main10), so `codecProbe.ts` interprets them per
     * MIME type. Keys are the full decodable list; audio usually has no profiles.
     */
    Function("decodableProfiles") {
      val out = mutableMapOf<String, MutableSet<Int>>()
      for (info in MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos) {
        if (info.isEncoder) continue
        for (type in info.supportedTypes) {
          val profiles = out.getOrPut(type.lowercase()) { mutableSetOf() }
          // A codec can refuse to describe a type it just listed; skip it.
          val capabilities = runCatching { info.getCapabilitiesForType(type) }.getOrNull() ?: continue
          capabilities.profileLevels?.forEach { profiles.add(it.profile) }
        }
      }
      out.mapValues { (_, profiles) -> profiles.toList() }
    }

    /**
     * The largest standard 16:9 frame each video decoder type can decode at
     * 24 fps, as `{ width, height }` per lowercased MIME type. This is the
     * decoder's limit, not the screen's.
     *
     * Hardware decoders only where the type has one (detectable on API 29+):
     * software decoders over-claim, and media3 prefers hardware anyway.
     * `areSizeAndRateSupported` because a decoder may accept a size it cannot
     * decode in real time.
     */
    Function("videoDecoderSizes") {
      val frames = listOf(3840 to 2160, 2560 to 1440, 1920 to 1080, 1280 to 720, 1024 to 576, 854 to 480, 640 to 360)
      val byType = mutableMapOf<String, MutableList<Pair<Boolean, MediaCodecInfo.VideoCapabilities>>>()
      for (info in MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos) {
        if (info.isEncoder) continue
        val hardware = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && info.isHardwareAccelerated
        for (type in info.supportedTypes) {
          if (!type.lowercase().startsWith("video/")) continue
          val video = runCatching { info.getCapabilitiesForType(type).videoCapabilities }.getOrNull() ?: continue
          byType.getOrPut(type.lowercase()) { mutableListOf() }.add(hardware to video)
        }
      }
      byType.mapNotNull { (type, decoders) ->
        val preferred = decoders.filter { it.first }.ifEmpty { decoders }
        val frame = frames.firstOrNull { (width, height) ->
          preferred.any { (_, video) -> runCatching { video.areSizeAndRateSupported(width, height, 24.0) }.getOrDefault(false) }
        }
        frame?.let { (width, height) -> type to mapOf("width" to width, "height" to height) }
      }.toMap()
    }

    /**
     * The HDR types the **display** can present, as `Display.HdrCapabilities`
     * constants: 1 Dolby Vision, 2 HDR10, 3 HLG, 4 HDR10+. The client claims
     * only the intersection with what the decoders can read.
     *
     * Empty means an SDR panel; null (no window, e.g. headless) means unknown.
     */
    Function("displayHdrTypes") {
      // One nullable chain, not early returns: a bare `return@Function null`
      // leaves the builder nothing to infer the lambda's type from.
      val manager = appContext.reactContext?.getSystemService(Context.WINDOW_SERVICE) as? WindowManager
      @Suppress("DEPRECATION")
      val display: Display? = manager?.defaultDisplay
      @Suppress("DEPRECATION")
      val types: List<Int>? = display?.hdrCapabilities?.supportedHdrTypes?.toList()
      types
    }
  }
}
