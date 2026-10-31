package com.ahad00010.jatext.media

import android.content.Context
import android.content.Intent
import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaRecorder
import android.os.Build
import android.os.Bundle
import android.os.ParcelFileDescriptor
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Base64
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.Locale
import kotlin.coroutines.resume
import kotlin.math.abs
import kotlin.math.sqrt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONObject

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

    private fun extractEmbeddedTranscript(rawMimeHint: String?): String? {
        if (rawMimeHint.isNullOrBlank()) return null
        val marker = ";jvn="
        val idx = rawMimeHint.indexOf(marker)
        if (idx < 0) return null
        val b64 = rawMimeHint.substring(idx + marker.length).substringBefore(";").trim()
        if (b64.isEmpty()) return null
        return try {
            val decoded = String(
                Base64.decode(b64, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP),
                Charsets.UTF_8
            )
            val obj = JSONObject(decoded)
            obj.optString("t", "").trim().takeIf { it.isNotEmpty() }
        } catch (_: Throwable) {
            null
        }
    }

    /**
     * Strictly on-demand voice note transcription (triggered ONLY when holding down
     * a voice note and tapping "Transcribe"). Outputs "(Music)" when music is detected.
     */
    suspend fun transcribeVoiceNoteOnDemand(
        context: Context,
        audioFile: File,
        rawMimeHint: String? = null,
    ): String {
        if (analyzeAudioForMusic(audioFile)) {
            return "(Music)"
        }
        extractEmbeddedTranscript(rawMimeHint)?.let { return it }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return "On-device audio file transcription requires Android 13 or newer."
        }

        val (pcm16Bytes, targetRate) = decodeToMono16kPcm(audioFile)
            ?: return "No clear speech detected in this voice note."
        if (pcm16Bytes.size < 1600) {
            return "No clear speech detected in this voice note."
        }

        val result = withTimeoutOrNull(18_000L) {
            withContext(Dispatchers.Main) {
                if (!SpeechRecognizer.isRecognitionAvailable(context)) {
                    return@withContext null
                }
                val pipe = try {
                    ParcelFileDescriptor.createPipe()
                } catch (_: Throwable) {
                    return@withContext null
                }
                val readFd = pipe[0]
                val writeFd = pipe[1]

                val writerJob = launch(Dispatchers.IO) {
                    try {
                        ParcelFileDescriptor.AutoCloseOutputStream(writeFd).use { out ->
                            out.write(pcm16Bytes)
                            out.flush()
                        }
                    } catch (_: Throwable) {
                    }
                }

                try {
                    suspendCancellableCoroutine<String?> { cont ->
                        val sr = SpeechRecognizer.createSpeechRecognizer(context)
                        cont.invokeOnCancellation {
                            try {
                                sr.cancel()
                                sr.destroy()
                            } catch (_: Throwable) {
                            }
                            try {
                                readFd.close()
                            } catch (_: Throwable) {
                            }
                        }
                        var partialBest = ""
                        sr.setRecognitionListener(object : RecognitionListener {
                            override fun onReadyForSpeech(params: Bundle?) {}
                            override fun onBeginningOfSpeech() {}
                            override fun onRmsChanged(rmsdB: Float) {}
                            override fun onBufferReceived(buffer: ByteArray?) {}
                            override fun onEndOfSpeech() {}
                            override fun onEvent(eventType: Int, params: Bundle?) {}

                            override fun onPartialResults(partialResults: Bundle?) {
                                val list = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                                val top = list?.firstOrNull()?.trim().orEmpty()
                                if (top.isNotEmpty()) partialBest = top
                            }

                            override fun onResults(results: Bundle?) {
                                val list = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                                val top = list?.firstOrNull()?.trim().orEmpty().ifEmpty { partialBest }
                                try {
                                    sr.destroy()
                                } catch (_: Throwable) {
                                }
                                try {
                                    readFd.close()
                                } catch (_: Throwable) {
                                }
                                if (cont.isActive) cont.resume(top.takeIf { it.isNotEmpty() })
                            }

                            override fun onError(error: Int) {
                                try {
                                    sr.destroy()
                                } catch (_: Throwable) {
                                }
                                try {
                                    readFd.close()
                                } catch (_: Throwable) {
                                }
                                if (cont.isActive) cont.resume(partialBest.takeIf { it.isNotEmpty() })
                            }
                        })

                        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                            putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault().toLanguageTag())
                            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                            putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE, readFd)
                            putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_CHANNEL_COUNT, 1)
                            putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_ENCODING, AudioFormat.ENCODING_PCM_16BIT)
                            putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_SAMPLING_RATE, targetRate)
                        }
                        sr.startListening(intent)
                    }
                } finally {
                    writerJob.cancel()
                }
            }
        }
        return result?.trim()?.takeIf { it.isNotEmpty() }
            ?: "No clear speech detected in this voice note."
    }

    private suspend fun decodeToMono16kPcm(audioFile: File): Pair<ByteArray, Int>? =
        withContext(Dispatchers.Default) {
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
                if (trackIndex < 0 || format == null) return@withContext null
                extractor.selectTrack(trackIndex)
                val mime = format.getString(MediaFormat.KEY_MIME) ?: return@withContext null
                val srcRate = if (format.containsKey(MediaFormat.KEY_SAMPLE_RATE)) {
                    format.getInteger(MediaFormat.KEY_SAMPLE_RATE).coerceAtLeast(8000)
                } else {
                    44100
                }
                val channels = if (format.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) {
                    format.getInteger(MediaFormat.KEY_CHANNEL_COUNT).coerceAtLeast(1)
                } else {
                    1
                }
                val targetRate = 16000
                val maxSrcSamples = srcRate * 60
                val monoFloats = FloatArray(maxSrcSamples)
                var count = 0

                codec = MediaCodec.createDecoderByType(mime)
                codec.configure(format, null, null, 0)
                codec.start()

                var inputDone = false
                var outputDone = false
                val info = MediaCodec.BufferInfo()
                while (!outputDone && count < maxSrcSamples) {
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
                            val sb = outBuf.order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
                            var idx = 0
                            val rem = sb.remaining()
                            while (idx + channels <= rem && count < maxSrcSamples) {
                                var sum = 0f
                                for (c in 0 until channels) {
                                    sum += sb.get(idx + c) / 32768f
                                }
                                monoFloats[count++] = sum / channels
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
                if (count < 400) return@withContext null

                val outLen = ((count.toLong() * targetRate.toLong()) / srcRate.toLong()).toInt().coerceAtLeast(1)
                val pcmBuf = ByteBuffer.allocate(outLen * 2).order(ByteOrder.LITTLE_ENDIAN)
                val step = srcRate.toDouble() / targetRate.toDouble()
                for (i in 0 until outLen) {
                    val srcPos = (i * step).toInt().coerceIn(0, count - 1)
                    val s = (monoFloats[srcPos] * 32767f).toInt().coerceIn(-32768, 32767).toShort()
                    pcmBuf.putShort(s)
                }
                pcmBuf.array() to targetRate
            } catch (_: Throwable) {
                null
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
}
