package com.ahad00010.jatext.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CameraAlt
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.ahad00010.jatext.ui.components.JaWebIconButton
import com.ahad00010.jatext.ui.components.JaWebPrimaryButton
import com.ahad00010.jatext.ui.theme.LocalJaTextPalette
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.qrcode.QRCodeReader
import java.util.EnumMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

@Composable
fun QrScannerModal(
    onDismiss: () -> Unit,
    onQrScanned: (String) -> Unit,
) {
    val context = LocalContext.current
    val palette = LocalJaTextPalette.current
    val lifecycleOwner = LocalLifecycleOwner.current

    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED
        )
    }

    val permLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasCameraPermission = granted
    }

    LaunchedEffect(Unit) {
        if (!hasCameraPermission) {
            permLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    BackHandler { onDismiss() }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            decorFitsSystemWindows = false,
        ),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFF07070B)),
        ) {
            if (hasCameraPermission) {
                CameraXQrPreview(
                    lifecycleOwner = lifecycleOwner,
                    onCodeDetected = { code ->
                        onQrScanned(code)
                    },
                )

                // Dark vignette + crisp rounded scan reticle
                val accentColor = palette.accent
                Canvas(modifier = Modifier.fillMaxSize()) {
                    val boxSide = (size.minDimension * 0.66f).coerceIn(210.dp.toPx(), 290.dp.toPx())
                    val left = (size.width - boxSide) / 2f
                    val top = (size.height - boxSide) / 2f - 18.dp.toPx()
                    val cornerRadius = 26.dp.toPx()

                    with(drawContext.canvas.nativeCanvas) {
                        val checkPoint = saveLayer(null, null)
                        drawRect(color = Color.Black.copy(alpha = 0.62f))
                        drawRoundRect(
                            color = Color.Transparent,
                            topLeft = Offset(left, top),
                            size = androidx.compose.ui.geometry.Size(boxSide, boxSide),
                            cornerRadius = CornerRadius(cornerRadius, cornerRadius),
                            blendMode = BlendMode.Clear,
                        )
                        restoreToCount(checkPoint)
                    }

                    drawRoundRect(
                        color = Color.White.copy(alpha = 0.25f),
                        topLeft = Offset(left, top),
                        size = androidx.compose.ui.geometry.Size(boxSide, boxSide),
                        cornerRadius = CornerRadius(cornerRadius, cornerRadius),
                        style = Stroke(width = 1.5.dp.toPx()),
                    )

                    // Glowing accent corner brackets
                    val arm = 32.dp.toPx()
                    val strokeW = 4.dp.toPx()
                    val right = left + boxSide
                    val bottom = top + boxSide

                    // Top-left
                    drawLine(accentColor, Offset(left, top + arm), Offset(left, top + 12f), strokeW, StrokeCap.Round)
                    drawLine(accentColor, Offset(left + 12f, top), Offset(left + arm, top), strokeW, StrokeCap.Round)
                    // Top-right
                    drawLine(accentColor, Offset(right - arm, top), Offset(right - 12f, top), strokeW, StrokeCap.Round)
                    drawLine(accentColor, Offset(right, top + 12f), Offset(right, top + arm), strokeW, StrokeCap.Round)
                    // Bottom-left
                    drawLine(accentColor, Offset(left, bottom - arm), Offset(left, bottom - 12f), strokeW, StrokeCap.Round)
                    drawLine(accentColor, Offset(left + 12f, bottom), Offset(left + arm, bottom), strokeW, StrokeCap.Round)
                    // Bottom-right
                    drawLine(accentColor, Offset(right - arm, bottom), Offset(right - 12f, bottom), strokeW, StrokeCap.Round)
                    drawLine(accentColor, Offset(right, bottom - arm), Offset(right, bottom - 12f), strokeW, StrokeCap.Round)
                }
            } else {
                Column(
                    modifier = Modifier
                        .align(Alignment.Center)
                        .padding(horizontal = 28.dp)
                        .clip(RoundedCornerShape(22.dp))
                        .background(palette.bgSecondary)
                        .border(1.dp, palette.border, RoundedCornerShape(22.dp))
                        .padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Icon(
                        imageVector = Icons.Rounded.CameraAlt,
                        contentDescription = null,
                        tint = palette.accent,
                        modifier = Modifier.size(38.dp),
                    )
                    Spacer(Modifier.height(12.dp))
                    Text(
                        text = "Camera access required",
                        color = palette.textPrimary,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = "Allow camera access so JaText can scan the QR code displayed on jatext.vercel.app/chats.",
                        color = palette.textSecondary,
                        fontSize = 13.5.sp,
                        textAlign = TextAlign.Center,
                        lineHeight = 19.sp,
                    )
                    Spacer(Modifier.height(16.dp))
                    JaWebPrimaryButton(
                        text = "Allow Camera",
                        onClick = { permLauncher.launch(Manifest.permission.CAMERA) },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }

            // Top header bar
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .padding(horizontal = 16.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                JaWebIconButton(
                    icon = Icons.Rounded.Close,
                    contentDescription = "Close scanner",
                    size = 40.dp,
                    iconSize = 20.dp,
                    containerColor = Color.Black.copy(alpha = 0.52f),
                    borderColor = Color.White.copy(alpha = 0.16f),
                    iconTint = Color.White,
                    onClick = onDismiss,
                )
                Spacer(Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Scan QR code",
                        color = Color.White,
                        fontSize = 17.sp,
                        fontWeight = FontWeight.ExtraBold,
                    )
                    Text(
                        text = "Open jatext.vercel.app/chats on your computer",
                        color = Color.White.copy(alpha = 0.76f),
                        fontSize = 12.5.sp,
                    )
                }
            }

            // Bottom instruction pill
            Row(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .navigationBarsPadding()
                    .padding(horizontal = 24.dp, vertical = 28.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(Color.Black.copy(alpha = 0.65f))
                    .border(1.dp, Color.White.copy(alpha = 0.15f), RoundedCornerShape(999.dp))
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
            ) {
                Icon(
                    imageVector = Icons.Rounded.Lock,
                    contentDescription = null,
                    tint = palette.success,
                    modifier = Modifier.size(15.dp),
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = "Point your camera at the JaText QR code",
                    color = Color.White,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                )
            }
        }
    }
}

@Composable
private fun CameraXQrPreview(
    lifecycleOwner: androidx.lifecycle.LifecycleOwner,
    onCodeDetected: (String) -> Unit,
) {
    val context = LocalContext.current
    val detectedOnce = remember { AtomicBoolean(false) }
    val analysisExecutor = remember { Executors.newSingleThreadExecutor() }
    val previewView = remember {
        PreviewView(context).apply {
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
            scaleType = PreviewView.ScaleType.FILL_CENTER
        }
    }

    DisposableEffect(lifecycleOwner) {
        val mainExecutor = ContextCompat.getMainExecutor(context)
        val cameraProviderFuture = ProcessCameraProvider.getInstance(context)

        cameraProviderFuture.addListener(
            {
                val cameraProvider = runCatching { cameraProviderFuture.get() }.getOrNull() ?: return@addListener
                val preview = Preview.Builder().build().also {
                    it.setSurfaceProvider(previewView.surfaceProvider)
                }

                val reader = QRCodeReader()
                val hints = EnumMap<DecodeHintType, Any>(DecodeHintType::class.java).apply {
                    put(DecodeHintType.POSSIBLE_FORMATS, listOf(BarcodeFormat.QR_CODE))
                    put(DecodeHintType.TRY_HARDER, java.lang.Boolean.TRUE)
                    put(DecodeHintType.CHARACTER_SET, "UTF-8")
                }

                val analysis = ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()

                analysis.setAnalyzer(analysisExecutor) { imageProxy ->
                    try {
                        if (!detectedOnce.get()) {
                            val decoded = decodeQrFromImageProxy(imageProxy, reader, hints)
                            if (!decoded.isNullOrBlank() &&
                                decoded.startsWith("JATEXT_LINK_V1|") &&
                                detectedOnce.compareAndSet(false, true)
                            ) {
                                mainExecutor.execute {
                                    onCodeDetected(decoded)
                                }
                            }
                        }
                    } finally {
                        imageProxy.close()
                    }
                }

                try {
                    cameraProvider.unbindAll()
                    cameraProvider.bindToLifecycle(
                        lifecycleOwner,
                        CameraSelector.DEFAULT_BACK_CAMERA,
                        preview,
                        analysis,
                    )
                } catch (_: Throwable) {
                }
            },
            mainExecutor,
        )

        onDispose {
            runCatching {
                val provider = cameraProviderFuture.get()
                provider.unbindAll()
            }
            analysisExecutor.shutdown()
        }
    }

    AndroidView(
        factory = { previewView },
        modifier = Modifier.fillMaxSize(),
    )
}

private fun decodeQrFromImageProxy(
    imageProxy: ImageProxy,
    reader: QRCodeReader,
    hints: Map<DecodeHintType, Any>,
): String? {
    val plane = imageProxy.planes.firstOrNull() ?: return null
    val width = imageProxy.width
    val height = imageProxy.height
    if (width <= 0 || height <= 0) return null

    val buf = plane.buffer
    buf.rewind()
    val rowStride = plane.rowStride
    val pixelStride = plane.pixelStride
    val yBytes = ByteArray(width * height)

    if (rowStride == width && pixelStride == 1) {
        buf.get(yBytes, 0, yBytes.size)
    } else {
        val rowBuf = ByteArray(rowStride)
        for (y in 0 until height) {
            val pos = y * rowStride
            if (pos >= buf.limit()) break
            buf.position(pos)
            val len = minOf(rowStride, buf.remaining())
            buf.get(rowBuf, 0, len)
            if (pixelStride == 1) {
                System.arraycopy(rowBuf, 0, yBytes, y * width, minOf(width, len))
            } else {
                var x = 0
                while (x < width && x * pixelStride < len) {
                    yBytes[y * width + x] = rowBuf[x * pixelStride]
                    x++
                }
            }
        }
    }

    // Attempt 1: Native orientation
    tryDecodeLuminance(yBytes, width, height, reader, hints)?.let { return it }

    // Attempt 2: 90-degree clockwise rotation (portrait sensor orientation)
    val rotated = ByteArray(width * height)
    for (y in 0 until height) {
        val rowOffset = y * width
        for (x in 0 until width) {
            rotated[x * height + (height - 1 - y)] = yBytes[rowOffset + x]
        }
    }
    return tryDecodeLuminance(rotated, height, width, reader, hints)
}

private fun tryDecodeLuminance(
    luma: ByteArray,
    width: Int,
    height: Int,
    reader: QRCodeReader,
    hints: Map<DecodeHintType, Any>,
): String? {
    return try {
        val source = PlanarYUVLuminanceSource(luma, width, height, 0, 0, width, height, false)
        val bitmap = BinaryBitmap(HybridBinarizer(source))
        reader.decode(bitmap, hints).text
    } catch (_: Throwable) {
        null
    } finally {
        reader.reset()
    }
}
