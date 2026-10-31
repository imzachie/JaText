package com.ahad00010.jatext.webrtc

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.SystemClock
import com.ahad00010.jatext.CallKeepAliveService
import com.ahad00010.jatext.JaTextSoundManager
import com.ahad00010.jatext.NativeRuntimeBridge
import com.ahad00010.jatext.ScreenCaptureService
import com.ahad00010.jatext.data.CallInvitePayload
import com.ahad00010.jatext.data.CallSignalEnvelope
import com.ahad00010.jatext.data.GroupCallInvitePayload
import com.ahad00010.jatext.data.GroupSignalEnvelope
import com.ahad00010.jatext.data.GroupSummary
import com.ahad00010.jatext.data.JaTextJson
import com.ahad00010.jatext.data.JaUser
import com.ahad00010.jatext.data.SdpPayload
import java.nio.ByteBuffer
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.Camera2Enumerator
import org.webrtc.CameraVideoCapturer
import org.webrtc.DataChannel
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.JavaI420Buffer
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpReceiver
import org.webrtc.RtpSender
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoFrame
import org.webrtc.VideoSource
import org.webrtc.VideoTrack
import org.webrtc.audio.JavaAudioDeviceModule

data class CallReactionBubble(
    val id: String,
    val emoji: String,
    val createdAt: Long = System.currentTimeMillis(),
)

data class RemoteParticipantState(
    val user: JaUser,
    val videoTrack: VideoTrack? = null,
    val muted: Boolean = false,
    val cameraOff: Boolean = true,
    val screenSharing: Boolean = false,
    val connectionState: String = "connecting",
)

data class NativeCallUiState(
    val active: Boolean = false,
    val isGroup: Boolean = false,
    val callId: String = "",
    val peer: JaUser? = null,
    val group: GroupSummary? = null,
    val mode: String = "voice",
    val phase: String = "idle", // incoming | outgoing | connecting | connected | dismissed
    val isMuted: Boolean = false,
    val isDeafened: Boolean = false,
    val isCameraOff: Boolean = true,
    val isScreenSharing: Boolean = false,
    val isSpeakerphone: Boolean = true,
    val frontCamera: Boolean = true,
    val minimized: Boolean = false,
    val fullscreenTargetId: String? = null, // "local" or remote userId when viewing shared screen / video fullscreen
    val startedAtMs: Long? = null,
    val localVideoTrack: VideoTrack? = null,
    val localScreenPreview: Bitmap? = null,
    val participants: List<RemoteParticipantState> = emptyList(),
    val reactions: List<CallReactionBubble> = emptyList(),
    val statusBanner: String? = null, // e.g. "Call dismissed" or "GC VC Ended"
)

class NativeCallEngine(
    private val appContext: Context,
    private val sendDmWireSignal: suspend (receiverId: String, plainBody: String, silent: Boolean) -> Unit,
    private val sendGroupWireSignal: suspend (groupId: String, plainBody: String, silent: Boolean) -> Unit,
    private val recordCallHistory: (peer: JaUser?, group: GroupSummary?, mode: String, direction: String, status: String, durationSec: Int) -> Unit,
) : NativeRuntimeBridge.ScreenCaptureListener {

    companion object {
        const val CALL_INVITE_PREFIX = "__JATEXT_CALL__:"
        const val CALL_SIGNAL_PREFIX = "__JATEXT_CALL_SIG__:"
        const val GROUP_CALL_INVITE_PREFIX = "__JATEXT_CALL_GRP__:"
        const val GROUP_CALL_SIGNAL_PREFIX = "__JATEXT_CALL_SIG__:GRP:"
        private const val RING_TIMEOUT_MS = 60_000L
    }

    val eglBase: EglBase by lazy { EglBase.create() }
    private val deviceSessionId = "${System.currentTimeMillis().toString(36)}-${UUID.randomUUID().toString().take(6)}"
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private var factoryInitialized = false
    private var peerConnectionFactory: PeerConnectionFactory? = null

    private var localAudioSource: AudioSource? = null
    private var localAudioTrack: AudioTrack? = null
    private var cameraCapturer: CameraVideoCapturer? = null
    private var surfaceTextureHelper: SurfaceTextureHelper? = null
    private var localVideoSource: VideoSource? = null
    private var localVideoTrack: VideoTrack? = null
    private var screenVideoSource: VideoSource? = null
    private var screenVideoTrack: VideoTrack? = null

    private val peerConnections = ConcurrentHashMap<String, PeerConnection>()
    private val dataChannels = ConcurrentHashMap<String, DataChannel>()
    private val videoSenders = ConcurrentHashMap<String, RtpSender>()
    private val pendingOffersByPeer = ConcurrentHashMap<String, SdpPayload>()
    private val handledSignalKeys = LinkedHashSet<String>()
    private val endedOrDeclinedCallIds = LinkedHashSet<String>()

    private var ringTimeoutJob: Job? = null
    private var myJoinSeq: Long = 0L

    private val _uiState = MutableStateFlow(NativeCallUiState())
    val uiState: StateFlow<NativeCallUiState> = _uiState.asStateFlow()

    private val iceServers = listOf(
        PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer(),
        PeerConnection.IceServer.builder("stun:stun1.l.google.com:19302").createIceServer(),
        PeerConnection.IceServer.builder("stun:stun.cloudflare.com:3478").createIceServer(),
    )

    init {
        NativeRuntimeBridge.addScreenCaptureListener(this)
    }

    private fun ensureFactory(): PeerConnectionFactory {
        peerConnectionFactory?.let { return it }
        if (!factoryInitialized) {
            PeerConnectionFactory.initialize(
                PeerConnectionFactory.InitializationOptions.builder(appContext)
                    .setEnableInternalTracer(false)
                    .createInitializationOptions()
            )
            factoryInitialized = true
        }
        val adm = JavaAudioDeviceModule.builder(appContext)
            .setUseHardwareAcousticEchoCanceler(true)
            .setUseHardwareNoiseSuppressor(true)
            .createAudioDeviceModule()
        val encoderFactory = DefaultVideoEncoderFactory(eglBase.eglBaseContext, true, true)
        val decoderFactory = DefaultVideoDecoderFactory(eglBase.eglBaseContext)
        val created = PeerConnectionFactory.builder()
            .setAudioDeviceModule(adm)
            .setVideoEncoderFactory(encoderFactory)
            .setVideoDecoderFactory(decoderFactory)
            .createPeerConnectionFactory()
        adm.release()
        peerConnectionFactory = created
        return created
    }

    /* ==================== Local Audio / Camera / Screen Tracks ==================== */

    private fun ensureLocalMedia(withVideo: Boolean) {
        val factory = ensureFactory()
        if (localAudioTrack == null) {
            val constraints = MediaConstraints().apply {
                mandatory.add(MediaConstraints.KeyValuePair("googEchoCancellation", "true"))
                mandatory.add(MediaConstraints.KeyValuePair("googAutoGainControl", "true"))
                mandatory.add(MediaConstraints.KeyValuePair("googNoiseSuppression", "true"))
            }
            localAudioSource = factory.createAudioSource(constraints)
            localAudioTrack = factory.createAudioTrack("JATEXT_AUDIO_0", localAudioSource).apply {
                setEnabled(!_uiState.value.isMuted)
            }
        }
        if (withVideo && localVideoTrack == null) {
            startCameraTrack(front = _uiState.value.frontCamera)
        }
    }

    private fun startCameraTrack(front: Boolean) {
        try {
            val factory = ensureFactory()
            val enumerator = Camera2Enumerator(appContext)
            val deviceNames = enumerator.deviceNames
            val chosen = deviceNames.firstOrNull {
                if (front) enumerator.isFrontFacing(it) else enumerator.isBackFacing(it)
            } ?: deviceNames.firstOrNull() ?: return

            cameraCapturer?.let {
                try {
                    it.stopCapture()
                } catch (_: Throwable) {
                }
                it.dispose()
            }
            surfaceTextureHelper?.dispose()

            val sth = SurfaceTextureHelper.create("JaTextCamThread", eglBase.eglBaseContext)
            val source = localVideoSource ?: factory.createVideoSource(false).also { localVideoSource = it }
            val capturer = enumerator.createCapturer(chosen, null)
            capturer.initialize(sth, appContext, source.capturerObserver)
            capturer.startCapture(1280, 720, 30)

            surfaceTextureHelper = sth
            cameraCapturer = capturer
            val track = localVideoTrack ?: factory.createVideoTrack("JATEXT_VIDEO_0", source).also {
                localVideoTrack = it
            }
            track.setEnabled(true)
            _uiState.update { it.copy(isCameraOff = false, frontCamera = front, localVideoTrack = track) }
        } catch (_: Throwable) {
        }
    }

    /* ==================== 1:1 Outgoing / Incoming Calls ==================== */

    fun startDmCall(me: JaUser, peer: JaUser, mode: String) {
        if (_uiState.value.active && _uiState.value.phase != "dismissed") return
        val callId = "call-${System.currentTimeMillis()}-${UUID.randomUUID().toString().take(6)}"
        val withVideo = mode == "video"
        configureCallAudioMode(active = true, speakerphone = true)
        startKeepAliveService(peer.displayName.ifBlank { peer.username }, withVideo)
        ensureLocalMedia(withVideo)

        _uiState.value = NativeCallUiState(
            active = true,
            isGroup = false,
            callId = callId,
            peer = peer,
            mode = mode,
            phase = "outgoing",
            isCameraOff = !withVideo,
            isSpeakerphone = true,
            localVideoTrack = if (withVideo) localVideoTrack else null,
            participants = listOf(RemoteParticipantState(user = peer, cameraOff = !withVideo)),
        )

        recordCallHistory(peer, null, mode, "outgoing", "ringing", 0)
        armOneMinuteUnansweredTimeout()

        scope.launch {
            val invite = CallInvitePayload(
                v = 1,
                callId = callId,
                mode = mode,
                state = "ringing",
                ts = System.currentTimeMillis(),
            )
            sendDmWireSignal(peer.id, "$CALL_INVITE_PREFIX${JaTextJson.encodeToString(invite)}", false)

            val pc = getOrCreatePeerConnection(peer.id, peer, isGroup = false)
            val dc = pc.createDataChannel("jatext-call", DataChannel.Init())
            attachDataChannel(peer.id, dc)
            val sdp = createCompleteSdp(pc, isOffer = true) ?: return@launch
            val sig = CallSignalEnvelope(
                callId = callId,
                type = "offer",
                deviceSessionId = deviceSessionId,
                mode = mode,
                sdp = SdpPayload(type = "offer", sdp = sdp.description),
                cameraOff = !withVideo,
                ts = System.currentTimeMillis(),
            )
            sendDmWireSignal(peer.id, "$CALL_SIGNAL_PREFIX${JaTextJson.encodeToString(sig)}", true)
        }
    }

    fun acceptIncomingCall(me: JaUser, withVideo: Boolean) {
        val cur = _uiState.value
        if (!cur.active || cur.phase != "incoming") return
        JaTextSoundManager.cancelIncomingCallWakeup(appContext, true)
        ringTimeoutJob?.cancel()

        configureCallAudioMode(active = true, speakerphone = true)
        if (cur.isGroup && cur.group != null) {
            startKeepAliveService(cur.group.name, withVideo)
            ensureLocalMedia(withVideo)
            myJoinSeq = System.currentTimeMillis()
            _uiState.update {
                it.copy(
                    phase = "connected",
                    startedAtMs = System.currentTimeMillis(),
                    isCameraOff = !withVideo,
                    localVideoTrack = if (withVideo) localVideoTrack else null,
                )
            }
            scope.launch {
                // Dominant first-device claim so other logged-in devices stop ringing immediately!
                val claimSig = GroupSignalEnvelope(
                    callId = cur.callId,
                    groupId = cur.group.id,
                    fromId = me.id,
                    fromName = me.displayName,
                    fromUsername = me.username,
                    fromAvatarUrl = me.avatarUrl,
                    fromAvatarColor = me.avatarColor,
                    toId = me.id,
                    type = "claim-ring",
                    deviceSessionId = deviceSessionId,
                    joinSeq = myJoinSeq,
                    ts = System.currentTimeMillis(),
                )
                sendGroupWireSignal(cur.group.id, "$GROUP_CALL_SIGNAL_PREFIX${JaTextJson.encodeToString(claimSig)}", true)

                val joinSig = claimSig.copy(toId = "*", type = "join", cameraOff = !withVideo)
                sendGroupWireSignal(cur.group.id, "$GROUP_CALL_SIGNAL_PREFIX${JaTextJson.encodeToString(joinSig)}", true)
            }
            return
        }

        val peer = cur.peer ?: return
        startKeepAliveService(peer.displayName.ifBlank { peer.username }, withVideo)
        ensureLocalMedia(withVideo)
        _uiState.update {
            it.copy(
                phase = "connecting",
                isCameraOff = !withVideo,
                localVideoTrack = if (withVideo) localVideoTrack else null,
            )
        }
        scope.launch {
            // Dominant first-device pickup claim!
            val claim = CallSignalEnvelope(
                callId = cur.callId,
                type = "claim",
                deviceSessionId = deviceSessionId,
                ts = System.currentTimeMillis(),
            )
            sendDmWireSignal(me.id, "$CALL_SIGNAL_PREFIX${JaTextJson.encodeToString(claim)}", true)

            val pendingOffer = pendingOffersByPeer[peer.id]
            if (pendingOffer != null) {
                answerDmOffer(peer, cur.callId, pendingOffer, withVideo)
            }
        }
    }

    fun declineIncomingCall(me: JaUser) {
        val cur = _uiState.value
        JaTextSoundManager.cancelIncomingCallWakeup(appContext, true)
        ringTimeoutJob?.cancel()
        if (!cur.active) return
        endedOrDeclinedCallIds.add(cur.callId)

        if (!cur.isGroup && cur.peer != null) {
            val peer = cur.peer
            scope.launch {
                val declineSig = CallSignalEnvelope(
                    callId = cur.callId,
                    type = "decline",
                    deviceSessionId = deviceSessionId,
                    ts = System.currentTimeMillis(),
                )
                sendDmWireSignal(peer.id, "$CALL_SIGNAL_PREFIX${JaTextJson.encodeToString(declineSig)}", true)
                val endInvite = CallInvitePayload(
                    v = 1,
                    callId = cur.callId,
                    mode = cur.mode,
                    state = "declined",
                    ts = System.currentTimeMillis(),
                )
                sendDmWireSignal(peer.id, "$CALL_INVITE_PREFIX${JaTextJson.encodeToString(endInvite)}", false)
            }
            recordCallHistory(peer, null, cur.mode, "incoming", "declined", 0)
        } else if (cur.isGroup && cur.group != null) {
            scope.launch {
                val dec = GroupSignalEnvelope(
                    callId = cur.callId,
                    groupId = cur.group.id,
                    fromId = me.id,
                    fromName = me.displayName,
                    fromUsername = me.username,
                    toId = me.id,
                    type = "decline-ring",
                    deviceSessionId = deviceSessionId,
                    ts = System.currentTimeMillis(),
                )
                sendGroupWireSignal(cur.group.id, "$GROUP_CALL_SIGNAL_PREFIX${JaTextJson.encodeToString(dec)}", true)
            }
        }
        teardownAllResources()
        _uiState.value = NativeCallUiState()
    }

    fun retryDismissedCall(me: JaUser) {
        val cur = _uiState.value
        if (cur.phase != "dismissed") return
        val peer = cur.peer
        val grp = cur.group
        val mode = cur.mode
        teardownAllResources()
        _uiState.value = NativeCallUiState()
        if (peer != null) {
            startDmCall(me, peer, mode)
        } else if (grp != null) {
            startGroupCall(me, grp, mode)
        }
    }

    fun closeDismissedCall() {
        teardownAllResources()
        _uiState.value = NativeCallUiState()
    }

    fun hangUpCall(me: JaUser) {
        val cur = _uiState.value
        JaTextSoundManager.cancelIncomingCallWakeup(appContext, true)
        ringTimeoutJob?.cancel()
        if (!cur.active) return
        endedOrDeclinedCallIds.add(cur.callId)

        val durSec = cur.startedAtMs?.let { ((System.currentTimeMillis() - it) / 1000L).toInt().coerceAtLeast(0) } ?: 0
        broadcastDataChannelJson(JsonObject(mapOf("type" to JsonPrimitive(if (cur.isGroup) "leave" else "hangup"))))

        if (!cur.isGroup && cur.peer != null) {
            val peer = cur.peer
            scope.launch {
                val hang = CallSignalEnvelope(
                    callId = cur.callId,
                    type = "hangup",
                    deviceSessionId = deviceSessionId,
                    ts = System.currentTimeMillis(),
                )
                sendDmWireSignal(peer.id, "$CALL_SIGNAL_PREFIX${JaTextJson.encodeToString(hang)}", true)
                val endState = if (cur.startedAtMs != null) "ended" else "missed"
                val endInvite = CallInvitePayload(
                    v = 1,
                    callId = cur.callId,
                    mode = cur.mode,
                    state = endState,
                    durationSec = durSec,
                    ts = System.currentTimeMillis(),
                )
                sendDmWireSignal(peer.id, "$CALL_INVITE_PREFIX${JaTextJson.encodeToString(endInvite)}", false)
            }
            recordCallHistory(peer, null, cur.mode, "outgoing", "ended", durSec)
        } else if (cur.isGroup && cur.group != null) {
            val grp = cur.group
            val wasLastParticipant = cur.participants.isEmpty()
            scope.launch {
                val leaveSig = GroupSignalEnvelope(
                    callId = cur.callId,
                    groupId = grp.id,
                    fromId = me.id,
                    fromName = me.displayName,
                    fromUsername = me.username,
                    toId = "*",
                    type = if (wasLastParticipant) "ended" else "leave",
                    deviceSessionId = deviceSessionId,
                    durationSec = durSec,
                    ts = System.currentTimeMillis(),
                )
                sendGroupWireSignal(grp.id, "$GROUP_CALL_SIGNAL_PREFIX${JaTextJson.encodeToString(leaveSig)}", true)
                if (wasLastParticipant) {
                    val endedInvite = GroupCallInvitePayload(
                        v = 1,
                        callId = cur.callId,
                        groupId = grp.id,
                        groupName = grp.name,
                        mode = cur.mode,
                        hostId = me.id,
                        hostName = me.displayName,
                        state = "ended",
                        durationSec = durSec,
                        ts = System.currentTimeMillis(),
                    )
                    sendGroupWireSignal(grp.id, "$GROUP_CALL_INVITE_PREFIX${JaTextJson.encodeToString(endedInvite)}", false)
                }
            }
            recordCallHistory(null, grp, cur.mode, "outgoing", "ended", durSec)
        }

        teardownAllResources()
        _uiState.value = NativeCallUiState(
            statusBanner = if (cur.isGroup && cur.participants.isEmpty()) "GC VC Ended" else null
        )
        if (_uiState.value.statusBanner != null) {
            scope.launch {
                delay(2400L)
                _uiState.update { if (!it.active) it.copy(statusBanner = null) else it }
            }
        }
    }

    /* ==================== Group Calls ==================== */

    fun startGroupCall(me: JaUser, group: GroupSummary, mode: String) {
        if (_uiState.value.active && _uiState.value.phase != "dismissed") return
        val callId = "grpcall-${System.currentTimeMillis()}-${UUID.randomUUID().toString().take(6)}"
        val withVideo = mode == "video"
        myJoinSeq = System.currentTimeMillis()
        configureCallAudioMode(active = true, speakerphone = true)
        startKeepAliveService(group.name, withVideo)
        ensureLocalMedia(withVideo)

        _uiState.value = NativeCallUiState(
            active = true,
            isGroup = true,
            callId = callId,
            group = group,
            mode = mode,
            phase = "connected",
            startedAtMs = System.currentTimeMillis(),
            isCameraOff = !withVideo,
            isSpeakerphone = true,
            localVideoTrack = if (withVideo) localVideoTrack else null,
        )
        armOneMinuteUnansweredTimeout()

        scope.launch {
            val invite = GroupCallInvitePayload(
                v = 1,
                callId = callId,
                groupId = group.id,
                groupName = group.name,
                mode = mode,
                hostId = me.id,
                hostName = me.displayName.ifBlank { me.username },
                state = "active",
                ts = System.currentTimeMillis(),
            )
            sendGroupWireSignal(group.id, "$GROUP_CALL_INVITE_PREFIX${JaTextJson.encodeToString(invite)}", false)

            val joinSig = GroupSignalEnvelope(
                callId = callId,
                groupId = group.id,
                fromId = me.id,
                fromName = me.displayName,
                fromUsername = me.username,
                fromAvatarUrl = me.avatarUrl,
                fromAvatarColor = me.avatarColor,
                toId = "*",
                type = "join",
                deviceSessionId = deviceSessionId,
                joinSeq = myJoinSeq,
                cameraOff = !withVideo,
                ts = System.currentTimeMillis(),
            )
            sendGroupWireSignal(group.id, "$GROUP_CALL_SIGNAL_PREFIX${JaTextJson.encodeToString(joinSig)}", true)
        }
    }

    fun joinExistingGroupCall(me: JaUser, group: GroupSummary, invite: GroupCallInvitePayload, withVideo: Boolean) {
        JaTextSoundManager.cancelIncomingCallWakeup(appContext, true)
        myJoinSeq = System.currentTimeMillis()
        configureCallAudioMode(active = true, speakerphone = true)
        startKeepAliveService(group.name, withVideo)
        ensureLocalMedia(withVideo)
        _uiState.value = NativeCallUiState(
            active = true,
            isGroup = true,
            callId = invite.callId,
            group = group,
            mode = invite.mode,
            phase = "connected",
            startedAtMs = System.currentTimeMillis(),
            isCameraOff = !withVideo,
            isSpeakerphone = true,
            localVideoTrack = if (withVideo) localVideoTrack else null,
        )
        scope.launch {
            val joinSig = GroupSignalEnvelope(
                callId = invite.callId,
                groupId = group.id,
                fromId = me.id,
                fromName = me.displayName,
                fromUsername = me.username,
                fromAvatarUrl = me.avatarUrl,
                fromAvatarColor = me.avatarColor,
                toId = "*",
                type = "join",
                deviceSessionId = deviceSessionId,
                joinSeq = myJoinSeq,
                cameraOff = !withVideo,
                ts = System.currentTimeMillis(),
            )
            sendGroupWireSignal(group.id, "$GROUP_CALL_SIGNAL_PREFIX${JaTextJson.encodeToString(joinSig)}", true)
        }
    }

    /* ==================== Controls: Mute, Camera, Speaker, Soundboard, Screen Share ==================== */

    fun toggleMute() {
        val next = !_uiState.value.isMuted
        localAudioTrack?.setEnabled(!next)
        _uiState.update { it.copy(isMuted = next) }
        broadcastPeerState()
    }

    fun toggleDeafen() {
        val next = !_uiState.value.isDeafened
        _uiState.update { it.copy(isDeafened = next) }
    }

    fun toggleCamera() {
        val cur = _uiState.value
        val nextOff = !cur.isCameraOff
        if (!nextOff && localVideoTrack == null) {
            startCameraTrack(cur.frontCamera)
            localVideoTrack?.let { track ->
                peerConnections.forEach { (pid, pc) ->
                    if (!videoSenders.containsKey(pid)) {
                        videoSenders[pid] = pc.addTrack(track, listOf("JATEXT_STREAM"))
                    } else {
                        videoSenders[pid]?.setTrack(track, false)
                    }
                }
            }
        } else {
            localVideoTrack?.setEnabled(!nextOff)
        }
        _uiState.update { it.copy(isCameraOff = nextOff, localVideoTrack = localVideoTrack) }
        broadcastPeerState()
    }

    fun flipCamera() {
        val nextFront = !_uiState.value.frontCamera
        cameraCapturer?.switchCamera(null)
        _uiState.update { it.copy(frontCamera = nextFront) }
    }

    fun toggleSpeakerphone() {
        val next = !_uiState.value.isSpeakerphone
        configureCallAudioMode(active = true, speakerphone = next)
        _uiState.update { it.copy(isSpeakerphone = next) }
    }

    fun setMinimized(minimized: Boolean) {
        _uiState.update { it.copy(minimized = minimized) }
    }

    fun setFullscreenTarget(targetId: String?) {
        _uiState.update { it.copy(fullscreenTargetId = targetId) }
    }

    fun playSoundboard(effectId: String) {
        JaTextSoundManager.playSoundboardClip(appContext, effectId)
        broadcastDataChannelJson(
            JsonObject(
                mapOf(
                    "type" to JsonPrimitive("soundboard"),
                    "effectId" to JsonPrimitive(effectId),
                )
            )
        )
    }

    fun sendFloatingReaction(emoji: String) {
        val id = UUID.randomUUID().toString()
        addReactionBubble(id, emoji)
        broadcastDataChannelJson(
            JsonObject(
                mapOf(
                    "type" to JsonPrimitive("reaction"),
                    "emoji" to JsonPrimitive(emoji),
                    "id" to JsonPrimitive(id),
                )
            )
        )
    }

    fun startNativeScreenSharing(resultCode: Int, data: Intent) {
        val factory = ensureFactory()
        val src = screenVideoSource ?: factory.createVideoSource(true).also { screenVideoSource = it }
        val track = screenVideoTrack ?: factory.createVideoTrack("JATEXT_SCREEN_0", src).also {
            screenVideoTrack = it
        }
        track.setEnabled(true)
        peerConnections.forEach { (pid, pc) ->
            val existing = videoSenders[pid]
            if (existing != null) {
                existing.setTrack(track, false)
            } else {
                videoSenders[pid] = pc.addTrack(track, listOf("JATEXT_STREAM"))
            }
        }

        val svcIntent = Intent(appContext, ScreenCaptureService::class.java).apply {
            action = ScreenCaptureService.ACTION_START
            putExtra(ScreenCaptureService.EXTRA_RESULT_CODE, resultCode)
            putExtra(ScreenCaptureService.EXTRA_RESULT_DATA, data)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            appContext.startForegroundService(svcIntent)
        } else {
            appContext.startService(svcIntent)
        }
        _uiState.update { it.copy(isScreenSharing = true) }
        broadcastPeerState()
        renegotiateAllPeers()
    }

    fun stopNativeScreenSharing() {
        val svcIntent = Intent(appContext, ScreenCaptureService::class.java).apply {
            action = ScreenCaptureService.ACTION_STOP
        }
        try {
            appContext.startService(svcIntent)
        } catch (_: Throwable) {
        }
        val camTrack = if (!_uiState.value.isCameraOff) localVideoTrack else null
        videoSenders.values.forEach { sender ->
            try {
                sender.setTrack(camTrack, false)
            } catch (_: Throwable) {
            }
        }
        _uiState.update { it.copy(isScreenSharing = false, localScreenPreview = null) }
        broadcastPeerState()
    }

    override fun onScreenBitmapFrame(bitmap: Bitmap, width: Int, height: Int) {
        val src = screenVideoSource
        if (src != null && _uiState.value.isScreenSharing) {
            try {
                val i420 = bitmapToI420Buffer(bitmap)
                val frame = VideoFrame(i420, 0, SystemClock.elapsedRealtimeNanos())
                src.capturerObserver.onFrameCaptured(frame)
                frame.release()
            } catch (_: Throwable) {
            }
        }
        _uiState.update { prev ->
            prev.copy(localScreenPreview = bitmap)
        }
    }

    override fun onScreenAudioPcm(pcm16Le: ByteArray, length: Int, sampleRate: Int) {
        // Stream internal system audio chunks over reliable WebRTC DataChannel so remote Web & Android peers hear screen audio!
        if (!_uiState.value.isScreenSharing || length <= 0) return
        val b64 = android.util.Base64.encodeToString(pcm16Le, 0, length, android.util.Base64.NO_WRAP)
        broadcastDataChannelJson(
            JsonObject(
                mapOf(
                    "type" to JsonPrimitive("screen-audio"),
                    "pcmB64" to JsonPrimitive(b64),
                    "sr" to JsonPrimitive(sampleRate),
                )
            )
        )
    }

    override fun onScreenCaptureStopped() {
        _uiState.update { it.copy(isScreenSharing = false, localScreenPreview = null) }
        broadcastPeerState()
    }

    /* ==================== Signal Ingestion from Delta Sync ==================== */

    fun inspectDmWireSignal(me: JaUser, peer: JaUser, senderId: String, createdAt: Long, plainBody: String) {
        if (System.currentTimeMillis() - createdAt > 90_000L) return

        if (plainBody.startsWith(CALL_INVITE_PREFIX)) {
            val inv = try {
                JaTextJson.decodeFromString<CallInvitePayload>(plainBody.removePrefix(CALL_INVITE_PREFIX))
            } catch (_: Throwable) {
                return
            }
            if (inv.state == "ended" || inv.state == "declined" || inv.state == "missed") {
                if (_uiState.value.callId == inv.callId) {
                    JaTextSoundManager.cancelIncomingCallWakeup(appContext, true)
                    teardownAllResources()
                    _uiState.value = NativeCallUiState()
                }
                return
            }
            if (inv.state == "ringing" && senderId != me.id && !endedOrDeclinedCallIds.contains(inv.callId)) {
                if (!_uiState.value.active) {
                    JaTextSoundManager.startIncomingRingtoneLoop(appContext)
                    _uiState.value = NativeCallUiState(
                        active = true,
                        isGroup = false,
                        callId = inv.callId,
                        peer = peer,
                        mode = inv.mode,
                        phase = "incoming",
                        participants = listOf(RemoteParticipantState(user = peer, cameraOff = inv.mode != "video")),
                    )
                    armOneMinuteUnansweredTimeout()
                }
            }
            return
        }

        if (!plainBody.startsWith(CALL_SIGNAL_PREFIX) || plainBody.startsWith(GROUP_CALL_SIGNAL_PREFIX)) return
        val sigKey = "${senderId}:${createdAt}:${plainBody.hashCode()}"
        if (!handledSignalKeys.add(sigKey)) return

        val sig = try {
            JaTextJson.decodeFromString<CallSignalEnvelope>(plainBody.removePrefix(CALL_SIGNAL_PREFIX))
        } catch (_: Throwable) {
            return
        }
        if (endedOrDeclinedCallIds.contains(sig.callId)) return

        when (sig.type) {
            "claim" -> {
                if (sig.deviceSessionId != null && sig.deviceSessionId != deviceSessionId && _uiState.value.callId == sig.callId) {
                    // Another logged-in device answered first; stop ringing here!
                    JaTextSoundManager.cancelIncomingCallWakeup(appContext, true)
                    teardownAllResources()
                    _uiState.value = NativeCallUiState()
                }
            }
            "offer" -> {
                if (senderId == me.id) return
                val sdp = sig.sdp ?: return
                pendingOffersByPeer[peer.id] = sdp
                if (!_uiState.value.active) {
                    JaTextSoundManager.startIncomingRingtoneLoop(appContext)
                    _uiState.value = NativeCallUiState(
                        active = true,
                        isGroup = false,
                        callId = sig.callId,
                        peer = peer,
                        mode = sig.mode ?: "voice",
                        phase = "incoming",
                        participants = listOf(RemoteParticipantState(user = peer, cameraOff = sig.cameraOff ?: true)),
                    )
                    armOneMinuteUnansweredTimeout()
                } else if (_uiState.value.callId == sig.callId && _uiState.value.phase == "connecting") {
                    scope.launch {
                        answerDmOffer(peer, sig.callId, sdp, !_uiState.value.isCameraOff)
                    }
                }
            }
            "answer" -> {
                if (senderId == me.id || _uiState.value.callId != sig.callId) return
                val sdp = sig.sdp ?: return
                val pc = peerConnections[peer.id] ?: return
                ringTimeoutJob?.cancel()
                pc.setRemoteDescription(SimpleSdpObserver(), SessionDescription(SessionDescription.Type.ANSWER, sdp.sdp))
                _uiState.update {
                    it.copy(
                        phase = "connected",
                        startedAtMs = it.startedAtMs ?: System.currentTimeMillis(),
                    )
                }
            }
            "renegotiate-offer" -> {
                if (senderId == me.id || _uiState.value.callId != sig.callId) return
                val sdp = sig.sdp ?: return
                scope.launch {
                    val pc = getOrCreatePeerConnection(peer.id, peer, isGroup = false)
                    pc.setRemoteDescription(SimpleSdpObserver(), SessionDescription(SessionDescription.Type.OFFER, sdp.sdp))
                    val answer = createCompleteSdp(pc, isOffer = false) ?: return@launch
                    val reply = CallSignalEnvelope(
                        callId = sig.callId,
                        type = "renegotiate-answer",
                        deviceSessionId = deviceSessionId,
                        sdp = SdpPayload("answer", answer.description),
                        ts = System.currentTimeMillis(),
                    )
                    sendDmWireSignal(peer.id, "$CALL_SIGNAL_PREFIX${JaTextJson.encodeToString(reply)}", true)
                }
            }
            "renegotiate-answer" -> {
                val sdp = sig.sdp ?: return
                peerConnections[peer.id]?.setRemoteDescription(
                    SimpleSdpObserver(),
                    SessionDescription(SessionDescription.Type.ANSWER, sdp.sdp)
                )
            }
            "decline", "hangup" -> {
                if (_uiState.value.callId == sig.callId) {
                    JaTextSoundManager.cancelIncomingCallWakeup(appContext, true)
                    teardownAllResources()
                    _uiState.value = NativeCallUiState()
                }
            }
        }
    }

    fun inspectGroupWireSignal(me: JaUser, group: GroupSummary, createdAt: Long, plainBody: String) {
        if (System.currentTimeMillis() - createdAt > 90_000L) return

        if (plainBody.startsWith(GROUP_CALL_INVITE_PREFIX)) {
            val inv = try {
                JaTextJson.decodeFromString<GroupCallInvitePayload>(plainBody.removePrefix(GROUP_CALL_INVITE_PREFIX))
            } catch (_: Throwable) {
                return
            }
            if (inv.state == "ended") {
                if (_uiState.value.callId == inv.callId) {
                    JaTextSoundManager.cancelIncomingCallWakeup(appContext, true)
                    teardownAllResources()
                    _uiState.value = NativeCallUiState(statusBanner = "GC VC Ended")
                }
                return
            }
            if (inv.state == "active" && inv.hostId != me.id && !endedOrDeclinedCallIds.contains(inv.callId)) {
                if (!_uiState.value.active) {
                    JaTextSoundManager.startIncomingRingtoneLoop(appContext)
                    _uiState.value = NativeCallUiState(
                        active = true,
                        isGroup = true,
                        callId = inv.callId,
                        group = group,
                        mode = inv.mode,
                        phase = "incoming",
                    )
                    armOneMinuteUnansweredTimeout()
                }
            }
            return
        }

        if (!plainBody.startsWith(GROUP_CALL_SIGNAL_PREFIX)) return
        val sigKey = "${group.id}:${createdAt}:${plainBody.hashCode()}"
        if (!handledSignalKeys.add(sigKey)) return

        val sig = try {
            JaTextJson.decodeFromString<GroupSignalEnvelope>(plainBody.removePrefix(GROUP_CALL_SIGNAL_PREFIX))
        } catch (_: Throwable) {
            return
        }
        val cur = _uiState.value
        if (!cur.active || cur.callId != sig.callId) return

        if ((sig.type == "claim-ring" || sig.type == "decline-ring") &&
            sig.fromId == me.id &&
            sig.deviceSessionId != deviceSessionId &&
            cur.phase == "incoming"
        ) {
            JaTextSoundManager.cancelIncomingCallWakeup(appContext, true)
            teardownAllResources()
            _uiState.value = NativeCallUiState()
            return
        }

        if (sig.fromId == me.id) return
        if (sig.toId != "*" && sig.toId != me.id) return

        val remoteUser = JaUser(
            id = sig.fromId,
            displayName = sig.fromName.ifBlank { sig.fromUsername },
            username = sig.fromUsername,
            avatarUrl = sig.fromAvatarUrl,
            avatarColor = sig.fromAvatarColor,
        )

        when (sig.type) {
            "join" -> {
                if (cur.phase != "connected") return
                ringTimeoutJob?.cancel()
                upsertParticipant(remoteUser, cameraOff = sig.cameraOff ?: true)
                scope.launch {
                    val pc = getOrCreatePeerConnection(remoteUser.id, remoteUser, isGroup = true)
                    val dc = pc.createDataChannel("jatext-grp", DataChannel.Init())
                    attachDataChannel(remoteUser.id, dc)
                    val offer = createCompleteSdp(pc, isOffer = true) ?: return@launch
                    val offerSig = GroupSignalEnvelope(
                        callId = cur.callId,
                        groupId = group.id,
                        fromId = me.id,
                        fromName = me.displayName,
                        fromUsername = me.username,
                        fromAvatarUrl = me.avatarUrl,
                        fromAvatarColor = me.avatarColor,
                        toId = remoteUser.id,
                        type = "offer",
                        deviceSessionId = deviceSessionId,
                        joinSeq = myJoinSeq,
                        sdp = SdpPayload("offer", offer.description),
                        cameraOff = _uiState.value.isCameraOff,
                        screenSharing = _uiState.value.isScreenSharing,
                        ts = System.currentTimeMillis(),
                    )
                    sendGroupWireSignal(group.id, "$GROUP_CALL_SIGNAL_PREFIX${JaTextJson.encodeToString(offerSig)}", true)
                }
            }
            "offer" -> {
                if (cur.phase != "connected") return
                val sdp = sig.sdp ?: return
                ringTimeoutJob?.cancel()
                upsertParticipant(remoteUser, cameraOff = sig.cameraOff ?: true, screenSharing = sig.screenSharing ?: false)
                scope.launch {
                    val pc = getOrCreatePeerConnection(remoteUser.id, remoteUser, isGroup = true)
                    pc.setRemoteDescription(SimpleSdpObserver(), SessionDescription(SessionDescription.Type.OFFER, sdp.sdp))
                    val answer = createCompleteSdp(pc, isOffer = false) ?: return@launch
                    val ansSig = GroupSignalEnvelope(
                        callId = cur.callId,
                        groupId = group.id,
                        fromId = me.id,
                        fromName = me.displayName,
                        fromUsername = me.username,
                        fromAvatarUrl = me.avatarUrl,
                        fromAvatarColor = me.avatarColor,
                        toId = remoteUser.id,
                        type = "answer",
                        deviceSessionId = deviceSessionId,
                        joinSeq = myJoinSeq,
                        sdp = SdpPayload("answer", answer.description),
                        cameraOff = _uiState.value.isCameraOff,
                        screenSharing = _uiState.value.isScreenSharing,
                        ts = System.currentTimeMillis(),
                    )
                    sendGroupWireSignal(group.id, "$GROUP_CALL_SIGNAL_PREFIX${JaTextJson.encodeToString(ansSig)}", true)
                }
            }
            "answer" -> {
                val sdp = sig.sdp ?: return
                ringTimeoutJob?.cancel()
                upsertParticipant(remoteUser, cameraOff = sig.cameraOff ?: true, screenSharing = sig.screenSharing ?: false)
                peerConnections[remoteUser.id]?.setRemoteDescription(
                    SimpleSdpObserver(),
                    SessionDescription(SessionDescription.Type.ANSWER, sdp.sdp)
                )
            }
            "leave" -> {
                peerConnections.remove(remoteUser.id)?.close()
                dataChannels.remove(remoteUser.id)?.close()
                videoSenders.remove(remoteUser.id)
                _uiState.update { st -> st.copy(participants = st.participants.filterNot { it.user.id == remoteUser.id }) }
            }
            "ended" -> {
                JaTextSoundManager.cancelIncomingCallWakeup(appContext, true)
                teardownAllResources()
                _uiState.value = NativeCallUiState(statusBanner = "GC VC Ended")
            }
        }
    }

    /* ==================== Internal WebRTC Helpers ==================== */

    private suspend fun answerDmOffer(peer: JaUser, callId: String, offerSdp: SdpPayload, withVideo: Boolean) {
        val pc = getOrCreatePeerConnection(peer.id, peer, isGroup = false)
        pc.setRemoteDescription(SimpleSdpObserver(), SessionDescription(SessionDescription.Type.OFFER, offerSdp.sdp))
        val answer = createCompleteSdp(pc, isOffer = false) ?: return
        val ansSig = CallSignalEnvelope(
            callId = callId,
            type = "answer",
            deviceSessionId = deviceSessionId,
            sdp = SdpPayload(type = "answer", sdp = answer.description),
            cameraOff = !withVideo,
            ts = System.currentTimeMillis(),
        )
        sendDmWireSignal(peer.id, "$CALL_SIGNAL_PREFIX${JaTextJson.encodeToString(ansSig)}", true)
        _uiState.update {
            it.copy(
                phase = "connected",
                startedAtMs = it.startedAtMs ?: System.currentTimeMillis(),
            )
        }
    }

    private fun getOrCreatePeerConnection(peerId: String, peerUser: JaUser, isGroup: Boolean): PeerConnection {
        peerConnections[peerId]?.let { return it }
        val factory = ensureFactory()
        val rtcConfig = PeerConnection.RTCConfiguration(iceServers).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_ONCE
        }
        val pc = factory.createPeerConnection(
            rtcConfig,
            object : PeerConnection.Observer {
                override fun onSignalingChange(state: PeerConnection.SignalingState?) {}
                override fun onIceConnectionChange(state: PeerConnection.IceConnectionState?) {
                    val label = state?.name?.lowercase() ?: "connecting"
                    _uiState.update { st ->
                        val nextPhase = if (!isGroup && state == PeerConnection.IceConnectionState.CONNECTED) {
                            "connected"
                        } else {
                            st.phase
                        }
                        st.copy(
                            phase = nextPhase,
                            startedAtMs = if (nextPhase == "connected" && st.startedAtMs == null) {
                                System.currentTimeMillis()
                            } else {
                                st.startedAtMs
                            },
                            participants = st.participants.map { p ->
                                if (p.user.id == peerId) p.copy(connectionState = label) else p
                            }
                        )
                    }
                }
                override fun onIceConnectionReceivingChange(receiving: Boolean) {}
                override fun onIceGatheringChange(state: PeerConnection.IceGatheringState?) {}
                override fun onIceCandidate(candidate: IceCandidate?) {}
                override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) {}
                override fun onAddStream(stream: MediaStream?) {}
                override fun onRemoveStream(stream: MediaStream?) {}
                override fun onDataChannel(dc: DataChannel?) {
                    if (dc != null) attachDataChannel(peerId, dc)
                }
                override fun onRenegotiationNeeded() {}
                override fun onAddTrack(receiver: RtpReceiver?, streams: Array<out MediaStream>?) {
                    val track = receiver?.track()
                    if (track is VideoTrack) {
                        track.setEnabled(true)
                        upsertParticipant(peerUser, videoTrack = track, cameraOff = false)
                    }
                }
            }
        ) ?: throw IllegalStateException("Failed to create WebRTC PeerConnection")

        localAudioTrack?.let { pc.addTrack(it, listOf("JATEXT_STREAM")) }
        val activeVideo = if (_uiState.value.isScreenSharing) screenVideoTrack else localVideoTrack
        if (activeVideo != null) {
            videoSenders[peerId] = pc.addTrack(activeVideo, listOf("JATEXT_STREAM"))
        }
        peerConnections[peerId] = pc
        return pc
    }

    private fun attachDataChannel(peerId: String, dc: DataChannel) {
        dataChannels[peerId] = dc
        dc.registerObserver(object : DataChannel.Observer {
            override fun onBufferedAmountChange(prev: Long) {}
            override fun onStateChange() {
                if (dc.state() == DataChannel.State.OPEN) {
                    broadcastPeerState()
                }
            }
            override fun onMessage(buffer: DataChannel.Buffer) {
                try {
                    val bytes = ByteArray(buffer.data.remaining())
                    buffer.data.get(bytes)
                    val obj = JaTextJson.parseToJsonElement(String(bytes, Charsets.UTF_8)).jsonObject
                    when (obj["type"]?.jsonPrimitive?.contentOrNull) {
                        "peer-state" -> {
                            val muted = obj["muted"]?.jsonPrimitive?.booleanOrNull ?: false
                            val camOff = obj["cameraOff"]?.jsonPrimitive?.booleanOrNull ?: true
                            val sharing = obj["screenSharing"]?.jsonPrimitive?.booleanOrNull ?: false
                            _uiState.update { st ->
                                st.copy(
                                    participants = st.participants.map { p ->
                                        if (p.user.id == peerId) {
                                            p.copy(muted = muted, cameraOff = camOff, screenSharing = sharing)
                                        } else {
                                            p
                                        }
                                    }
                                )
                            }
                        }
                        "soundboard" -> {
                            val effect = obj["effectId"]?.jsonPrimitive?.contentOrNull ?: "bruh"
                            if (!_uiState.value.isDeafened) {
                                JaTextSoundManager.playSoundboardClip(appContext, effect)
                            }
                        }
                        "reaction" -> {
                            val emoji = obj["emoji"]?.jsonPrimitive?.contentOrNull ?: return
                            val id = obj["id"]?.jsonPrimitive?.contentOrNull ?: UUID.randomUUID().toString()
                            addReactionBubble(id, emoji)
                        }
                        "hangup" -> {
                            if (!_uiState.value.isGroup) {
                                teardownAllResources()
                                _uiState.value = NativeCallUiState()
                            }
                        }
                        "leave" -> {
                            peerConnections.remove(peerId)?.close()
                            dataChannels.remove(peerId)
                            _uiState.update { st ->
                                st.copy(participants = st.participants.filterNot { it.user.id == peerId })
                            }
                        }
                    }
                } catch (_: Throwable) {
                }
            }
        })
    }

    private suspend fun createCompleteSdp(pc: PeerConnection, isOffer: Boolean): SessionDescription? {
        val constraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveVideo", "true"))
        }
        val deferred = kotlinx.coroutines.CompletableDeferred<Boolean>()
        val observer = object : SdpObserver {
            override fun onCreateSuccess(desc: SessionDescription?) {
                if (desc == null) {
                    deferred.complete(false)
                    return
                }
                pc.setLocalDescription(object : SdpObserver {
                    override fun onCreateSuccess(p0: SessionDescription?) {}
                    override fun onSetSuccess() {
                        deferred.complete(true)
                    }
                    override fun onCreateFailure(err: String?) {
                        deferred.complete(false)
                    }
                    override fun onSetFailure(err: String?) {
                        deferred.complete(false)
                    }
                }, desc)
            }
            override fun onSetSuccess() {}
            override fun onCreateFailure(err: String?) {
                deferred.complete(false)
            }
            override fun onSetFailure(err: String?) {
                deferred.complete(false)
            }
        }
        if (isOffer) pc.createOffer(observer, constraints) else pc.createAnswer(observer, constraints)
        if (!deferred.await()) return null

        // Wait up to 1.8s for ICE candidates to gather into the complete SDP (matches web trickle-less signaling)
        var waited = 0L
        while (pc.iceGatheringState() != PeerConnection.IceGatheringState.COMPLETE && waited < 1800L) {
            delay(60L)
            waited += 60L
        }
        return pc.localDescription
    }

    private fun renegotiateAllPeers() {
        val cur = _uiState.value
        if (!cur.active) return
        if (!cur.isGroup && cur.peer != null) {
            val peer = cur.peer
            val pc = peerConnections[peer.id] ?: return
            scope.launch {
                val offer = createCompleteSdp(pc, isOffer = true) ?: return@launch
                val sig = CallSignalEnvelope(
                    callId = cur.callId,
                    type = "renegotiate-offer",
                    deviceSessionId = deviceSessionId,
                    sdp = SdpPayload("offer", offer.description),
                    ts = System.currentTimeMillis(),
                )
                sendDmWireSignal(peer.id, "$CALL_SIGNAL_PREFIX${JaTextJson.encodeToString(sig)}", true)
            }
        }
    }

    private fun broadcastPeerState() {
        val st = _uiState.value
        broadcastDataChannelJson(
            JsonObject(
                mapOf(
                    "type" to JsonPrimitive("peer-state"),
                    "muted" to JsonPrimitive(st.isMuted),
                    "cameraOff" to JsonPrimitive(st.isCameraOff && !st.isScreenSharing),
                    "screenSharing" to JsonPrimitive(st.isScreenSharing),
                    "speaking" to JsonPrimitive(false),
                )
            )
        )
    }

    private fun broadcastDataChannelJson(obj: JsonObject) {
        val bytes = obj.toString().toByteArray(Charsets.UTF_8)
        for (dc in dataChannels.values) {
            try {
                if (dc.state() == DataChannel.State.OPEN) {
                    dc.send(DataChannel.Buffer(ByteBuffer.wrap(bytes), false))
                }
            } catch (_: Throwable) {
            }
        }
    }

    private fun upsertParticipant(
        user: JaUser,
        videoTrack: VideoTrack? = null,
        cameraOff: Boolean? = null,
        screenSharing: Boolean? = null,
    ) {
        _uiState.update { st ->
            val idx = st.participants.indexOfFirst { it.user.id == user.id }
            val nextList = st.participants.toMutableList()
            if (idx >= 0) {
                val prev = nextList[idx]
                nextList[idx] = prev.copy(
                    user = user,
                    videoTrack = videoTrack ?: prev.videoTrack,
                    cameraOff = cameraOff ?: prev.cameraOff,
                    screenSharing = screenSharing ?: prev.screenSharing,
                )
            } else {
                nextList.add(
                    RemoteParticipantState(
                        user = user,
                        videoTrack = videoTrack,
                        cameraOff = cameraOff ?: true,
                        screenSharing = screenSharing ?: false,
                    )
                )
            }
            st.copy(participants = nextList)
        }
    }

    private fun addReactionBubble(id: String, emoji: String) {
        _uiState.update { st ->
            st.copy(reactions = (st.reactions + CallReactionBubble(id = id, emoji = emoji)).takeLast(8))
        }
        scope.launch {
            delay(3000L)
            _uiState.update { st -> st.copy(reactions = st.reactions.filterNot { it.id == id }) }
        }
    }

    private fun armOneMinuteUnansweredTimeout() {
        ringTimeoutJob?.cancel()
        ringTimeoutJob = scope.launch {
            delay(RING_TIMEOUT_MS)
            val cur = _uiState.value
            val unanswered = cur.active && (
                cur.phase == "outgoing" ||
                    cur.phase == "incoming" ||
                    (cur.isGroup && cur.participants.isEmpty() && (System.currentTimeMillis() - (cur.startedAtMs ?: 0L)) >= RING_TIMEOUT_MS - 500L)
                )
            if (unanswered) {
                JaTextSoundManager.cancelIncomingCallWakeup(appContext, false)
                teardownAllResources()
                _uiState.value = cur.copy(
                    phase = "dismissed",
                    statusBanner = "Call dismissed",
                    localVideoTrack = null,
                    localScreenPreview = null,
                )
            }
        }
    }

    private fun configureCallAudioMode(active: Boolean, speakerphone: Boolean) {
        try {
            val am = appContext.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
            if (!active) {
                am.mode = AudioManager.MODE_NORMAL
                @Suppress("DEPRECATION")
                am.isSpeakerphoneOn = false
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    am.clearCommunicationDevice()
                }
                return
            }
            am.mode = AudioManager.MODE_IN_COMMUNICATION
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val targetType = if (speakerphone) {
                    AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
                } else {
                    AudioDeviceInfo.TYPE_BUILTIN_EARPIECE
                }
                am.availableCommunicationDevices.firstOrNull { it.type == targetType }?.let {
                    am.setCommunicationDevice(it)
                }
            } else {
                @Suppress("DEPRECATION")
                am.isSpeakerphoneOn = speakerphone
            }
        } catch (_: Throwable) {
        }
    }

    private fun startKeepAliveService(title: String, withVideo: Boolean) {
        try {
            val intent = Intent(appContext, CallKeepAliveService::class.java).apply {
                action = CallKeepAliveService.ACTION_START
                putExtra(CallKeepAliveService.EXTRA_TITLE, title)
                putExtra(CallKeepAliveService.EXTRA_VIDEO, withVideo)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                appContext.startForegroundService(intent)
            } else {
                appContext.startService(intent)
            }
        } catch (_: Throwable) {
        }
    }

    private fun teardownAllResources() {
        ringTimeoutJob?.cancel()
        if (_uiState.value.isScreenSharing) {
            try {
                appContext.startService(
                    Intent(appContext, ScreenCaptureService::class.java).apply {
                        action = ScreenCaptureService.ACTION_STOP
                    }
                )
            } catch (_: Throwable) {
            }
        }
        try {
            appContext.startService(
                Intent(appContext, CallKeepAliveService::class.java).apply {
                    action = CallKeepAliveService.ACTION_STOP
                }
            )
        } catch (_: Throwable) {
        }

        dataChannels.values.forEach {
            try {
                it.close()
            } catch (_: Throwable) {
            }
        }
        dataChannels.clear()
        videoSenders.clear()
        peerConnections.values.forEach {
            try {
                it.close()
            } catch (_: Throwable) {
            }
        }
        peerConnections.clear()
        pendingOffersByPeer.clear()

        try {
            cameraCapturer?.stopCapture()
        } catch (_: Throwable) {
        }
        try {
            cameraCapturer?.dispose()
        } catch (_: Throwable) {
        }
        cameraCapturer = null
        try {
            surfaceTextureHelper?.dispose()
        } catch (_: Throwable) {
        }
        surfaceTextureHelper = null

        localVideoTrack?.dispose()
        localVideoTrack = null
        localVideoSource?.dispose()
        localVideoSource = null

        screenVideoTrack?.dispose()
        screenVideoTrack = null
        screenVideoSource?.dispose()
        screenVideoSource = null

        localAudioTrack?.dispose()
        localAudioTrack = null
        localAudioSource?.dispose()
        localAudioSource = null

        configureCallAudioMode(active = false, speakerphone = false)
    }

    private fun bitmapToI420Buffer(bitmap: Bitmap): JavaI420Buffer {
        val w = bitmap.width - (bitmap.width % 2)
        val h = bitmap.height - (bitmap.height % 2)
        val argb = IntArray(w * h)
        bitmap.getPixels(argb, 0, w, 0, 0, w, h)
        val i420 = JavaI420Buffer.allocate(w, h)
        val yBuf = i420.dataY
        val uBuf = i420.dataU
        val vBuf = i420.dataV
        val strideY = i420.strideY
        val strideU = i420.strideU
        val strideV = i420.strideV

        for (j in 0 until h) {
            for (i in 0 until w) {
                val px = argb[j * w + i]
                val r = (px shr 16) and 0xFF
                val g = (px shr 8) and 0xFF
                val b = px and 0xFF
                val y = (((66 * r + 129 * g + 25 * b + 128) shr 8) + 16).coerceIn(0, 255)
                yBuf.put(j * strideY + i, y.toByte())
                if (j % 2 == 0 && i % 2 == 0) {
                    val u = (((-38 * r - 74 * g + 112 * b + 128) shr 8) + 128).coerceIn(0, 255)
                    val v = (((112 * r - 94 * g - 18 * b + 128) shr 8) + 128).coerceIn(0, 255)
                    uBuf.put((j / 2) * strideU + (i / 2), u.toByte())
                    vBuf.put((j / 2) * strideV + (i / 2), v.toByte())
                }
            }
        }
        return i420
    }

    private open class SimpleSdpObserver : SdpObserver {
        override fun onCreateSuccess(p0: SessionDescription?) {}
        override fun onSetSuccess() {}
        override fun onCreateFailure(p0: String?) {}
        override fun onSetFailure(p0: String?) {}
    }
}
