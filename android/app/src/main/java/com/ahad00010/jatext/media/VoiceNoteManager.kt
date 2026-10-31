package com.ahad00010.jatext.media

import android.content.Context
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaRecorder
import android.os.Build
import java.io.File
import java.nio.ByteOrder
import kotlin.math.abs
import kotlin.math.sqrt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class VoiceNoteRecorderController(private val context: Context) {
    private var recorder: MediaRecorder? = null
    private var outputFile: File? = null
    private var startedAtMs: Long = 0L

    val isRecording: Boolean
        get() = recorder != null

    @Suppress("DEPRECATION")
    fun startRecording(): File {
        stopAndDiscard()
        val dir = File(context.cacheDir, "voice_notes").apply { mkdirs() }
        val file = File(dir, "voice_${System.currentTimeMillis()}.m4a")
        val mr = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(context)
        } else {
            MediaRecorder()
        }
        mr.setAudioSource(MediaRecorder.AudioSource.MIC)
        mr.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
        mr.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
        mr.setAudioSamplingRate(44100)
        mr.setAudioEncodingBitRate(96000)
        mr.setOutputFile(file.absolutePath)
        mr.prepare()
        mr.start()
        recorder = mr
        outputFile = file
        startedAtMs = System.currentTimeMillis()
        return file
    }

    fun pollNormalizedAmplitude(): Float {
        val mr = recorder ?: return 0.08f
        return try {
            val raw = mr.maxAmplitude
            (raw.toFloat() / 18000f).coerceIn(0.08f, 1.0f)
        } catch (_: Throwable) {
            0.12f
        }
    }

    fun elapsedMillis(): Long =
        if (startedAtMs > 0L) System.currentTimeMillis() - startedAtMs else 0L

    fun stopRecording(): File? {
        val mr = recorder ?: return null
        val f = outputFile
        recorder = null
        outputFile = null
        startedAtMs = 0L
        try {
            mr.stop()
        } catch (_: Throwable) {
        }
        try {
            mr.release()
        } catch (_: Throwable) {
        }
        return f?.takeIf { it.exists() && it.length() > 256L }
    }

    fun stopAndDiscard() {
        val f = outputFile
        val mr = recorder
        recorder = null
        outputFile = null
        startedAtMs = 0L
        if (mr != null) {
            try {
                mr.stop()
            } catch (_: Throwable) {
            }
            try {
                mr.release()
            } catch (_: Throwable) {
            }
        }
        try {
            f?.delete()
        } catch (_: Throwable) {
        }
    }
}

object VoiceNoteMusicDetector {

    /**
     * Decodes up to 12 seconds of PCM audio from a voice note file and inspects envelope
     * sustain (low silence ratio, steady RMS crest factor) + harmonic zero-crossing stability.
     * When music is detected, transcription is cancelled immediately and outputs "(Music)" only!
     */
    suspend fun analyzeAudioForMusic(audioFile: File): Boolean = withContext(Dispatchers.Default) {
        val extractor = MediaExtractor()
        var codec: MediaCodec? = null
        try {
            extractor.setDataSource(audioFile.absolutePath)
            var trackIndex = -1
            var format: MediaFormat? = null
            for (i in 0 until extractor.trackCount) {
                val tf = extractor.getTrackFormat(i)
                val mime = tf.getString(MediaFormat.KEY_MIME).orEmpty()
                if (mime.startsWith("audio/")) {
                    trackIndex = i
                    format = tf
                    break
                }
            }
            if (trackIndex < 0 || format == null) return@withContext false
            extractor.selectTrack(trackIndex)
            val mime = format.getString(MediaFormat.KEY_MIME) ?: return@withContext false
            val sampleRate = if (format.containsKey(MediaFormat.KEY_SAMPLE_RATE)) {
                format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
            } else {
                44100
            }
            val channels = if (format.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) {
                format.getInteger(MediaFormat.KEY_CHANNEL_COUNT).coerceAtLeast(1)
            } else {
                1
            }

            codec = MediaCodec.createDecoderByType(mime)
            codec.configure(format, null, null, 0)
            codec.start()

            val maxMonoSamples = sampleRate * 12
            val monoSamples = FloatArray(maxMonoSamples)
            var sampleCount = 0
            var inputDone = false
            var outputDone = false
            val info = MediaCodec.BufferInfo()

            while (!outputDone && sampleCount < maxMonoSamples) {
                if (!inputDone) {
                    val inIdx = codec.dequeueInputBuffer(5000)
                    if (inIdx >= 0) {
                        val inBuf = codec.getInputBuffer(inIdx)
                        if (inBuf != null) {
                            val sz = extractor.readSampleData(inBuf, 0)
                            if (sz < 0) {
                                codec.queueInputBuffer(inIdx, 0, 0, 0L, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                                inputDone = true
                            } else {
                                codec.queueInputBuffer(inIdx, 0, sz, extractor.sampleTime, 0)
                                extractor.advance()
                            }
                        }
                    }
                }
                val outIdx = codec.dequeueOutputBuffer(info, 5000)
                if (outIdx >= 0) {
                    val outBuf = codec.getOutputBuffer(outIdx)
                    if (outBuf != null && info.size >= 2) {
                        outBuf.position(info.offset)
                        outBuf.limit(info.offset + info.size)
                        val shortBuf = outBuf.order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
                        var idx = 0
                        val totalShorts = shortBuf.remaining()
                        while (idx + channels <= totalShorts && sampleCount < maxMonoSamples) {
                            var sum = 0f
                            for (c in 0 until channels) {
                                sum += shortBuf.get(idx + c) / 32768f
                            }
                            monoSamples[sampleCount++] = sum / channels
                            idx += channels
                        }
                    }
                    codec.releaseOutputBuffer(outIdx, false)
                    if ((info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
                        outputDone = true
                    }
                } else if (outIdx == MediaCodec.INFO_TRY_AGAIN_LATER && inputDone) {
                    break
                }
            }

            if (sampleCount < sampleRate * 2) return@withContext false

            // 50ms frame energy & zero-crossing variance analysis (speech pauses frequently; music sustains)
            val frameLen = (sampleRate / 20).coerceAtLeast(256)
            val frameRms = ArrayList<Float>()
            val frameZcr = ArrayList<Float>()
            var pos = 0
            while (pos + frameLen <= sampleCount) {
                var sq = 0.0
                var zc = 0
                for (i in 0 until frameLen) {
                    val s = monoSamples[pos + i]
                    sq += s * s
                    if (i > 0 && ((s >= 0f && monoSamples[pos + i - 1] < 0f) || (s < 0f && monoSamples[pos + i - 1] >= 0f))) {
                        zc++
                    }
                }
                frameRms.add(sqrt(sq / frameLen).toFloat())
                frameZcr.add(zc.toFloat() / frameLen.toFloat())
                pos += frameLen
            }
            if (frameRms.size < 30) return@withContext false

            val maxRms = frameRms.maxOrNull() ?: 0f
            if (maxRms < 0.015f) return@withContext false

            // Speech naturally contains syllable/word pauses (>18% low-energy frames),
            // whereas music maintains continuous energy (<10% quiet frames) + steady rhythmic envelope.
            val silenceThreshold = maxRms * 0.14f
            val quietFrames = frameRms.count { it < silenceThreshold }
            val quietRatio = quietFrames.toFloat() / frameRms.size.toFloat()

            val activeRms = frameRms.filter { it >= silenceThreshold }
            val meanActive = activeRms.average().toFloat().coerceAtLeast(0.001f)
            val stdActive = sqrt(activeRms.map { (it - meanActive) * (it - meanActive) }.average()).toFloat()
            val coeffVar = stdActive / meanActive

            val meanZcr = frameZcr.average().toFloat()
            // Continuous sustained audio with low dynamic variation and tonal/percussive spectrum -> Music!
            return@withContext (quietRatio < 0.085f && coeffVar < 0.46f && meanZcr in 0.025f..0.28f)
        } catch (_: Throwable) {
            false
        } finally {
            try {
                codec?.stop()
            } catch (_: Throwable) {
            }
            try {
                codec?.release()
            } catch (_: Throwable) {
            }
            try {
                extractor.release()
            } catch (_: Throwable) {
            }
        }
    }

    suspend fun buildWaveformSamples(audioFile: File, bars: Int = 36): List<Float> =
        withContext(Dispatchers.IO) {
            try {
                val bytes = audioFile.readBytes()
                if (bytes.size < 128) return@withContext List(bars) { 0.25f }
                val step = (bytes.size / bars).coerceAtLeast(1)
                List(bars) { idx ->
                    val start = (idx * step).coerceAtMost(bytes.size - 1)
                    val end = minOf(bytes.size, start + minOf(step, 512))
                    var acc = 0f
                    var n = 0
                    for (j in start until end) {
                        acc += abs(bytes[j].toInt()) / 128f
                        n++
                    }
                    val v = if (n > 0) acc / n else 0.25f
                    (0.18f + (v * 0.82f)).coerceIn(0.16f, 1.0f)
                }
            } catch (_: Throwable) {
                List(bars) { i -> 0.24f + ((i * 7) % 5) * 0.13f }
            }
        }
}
