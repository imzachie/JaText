package com.ahad00010.jatext;

import android.content.ClipData;
import android.content.ClipDescription;
import android.content.ContentResolver;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.AttributeSet;
import android.util.Base64;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import androidx.core.view.ContentInfoCompat;
import androidx.core.view.OnReceiveContentListener;
import androidx.core.view.ViewCompat;
import androidx.core.view.inputmethod.EditorInfoCompat;
import androidx.core.view.inputmethod.InputConnectionCompat;
import androidx.core.view.inputmethod.InputContentInfoCompat;
import com.getcapacitor.CapacitorWebView;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/**
 * Custom CapacitorWebView enabling rich image/GIF/sticker insertion from Gboard,
 * Samsung Keyboard, and Android system clipboard paste chips via InputConnectionCompat
 * and ViewCompat.setOnReceiveContentListener.
 */
public class JaTextWebView extends CapacitorWebView {

    public static final String[] SUPPORTED_IMAGE_MIMES = new String[] {
        "image/*",
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/gif",
        "image/webp"
    };

    private static final int MAX_PASTE_IMAGE_BYTES = 20 * 1024 * 1024;

    public JaTextWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
        installReceiveContentSupport(this);
    }

    public static void installReceiveContentSupport(View targetView) {
        if (targetView == null) return;
        ViewCompat.setOnReceiveContentListener(
            targetView,
            SUPPORTED_IMAGE_MIMES,
            new OnReceiveContentListener() {
                @Override
                public ContentInfoCompat onReceiveContent(View view, ContentInfoCompat payload) {
                    if (payload == null) return null;
                    ClipData clip = payload.getClip();
                    if (clip == null || clip.getItemCount() == 0) {
                        return payload;
                    }
                    boolean handledImage = false;
                    boolean hasTextItems = false;
                    ClipDescription desc = clip.getDescription();
                    String hintMime = (desc != null && desc.getMimeTypeCount() > 0)
                        ? desc.getMimeType(0)
                        : null;

                    for (int i = 0; i < clip.getItemCount(); i++) {
                        ClipData.Item item = clip.getItemAt(i);
                        if (item == null) continue;
                        Uri uri = item.getUri();
                        if (uri != null && item.getText() == null) {
                            handledImage = true;
                            final Context appCtx = view.getContext().getApplicationContext();
                            final Uri targetUri = uri;
                            final String mimeHint = hintMime;
                            new Thread(() -> readAndEmitUri(appCtx, targetUri, mimeHint, null), "JaTextPasteUri").start();
                        } else if (item.getText() != null) {
                            hasTextItems = true;
                        }
                    }

                    if (handledImage && !hasTextItems) {
                        return null;
                    }
                    return payload;
                }
            }
        );
    }

    @Override
    public InputConnection onCreateInputConnection(EditorInfo outAttrs) {
        InputConnection ic = super.onCreateInputConnection(outAttrs);
        if (ic == null || outAttrs == null) {
            return ic;
        }
        EditorInfoCompat.setContentMimeTypes(outAttrs, SUPPORTED_IMAGE_MIMES);
        final Context appCtx = getContext().getApplicationContext();
        return InputConnectionCompat.createWrapper(
            ic,
            outAttrs,
            new InputConnectionCompat.OnCommitContentListener() {
                @Override
                public boolean onCommitContent(
                    InputContentInfoCompat inputContentInfo,
                    int flags,
                    Bundle opts
                ) {
                    if (inputContentInfo == null) return false;
                    if (
                        Build.VERSION.SDK_INT >= Build.VERSION_CODES.N_MR1 &&
                        (flags & InputConnectionCompat.INPUT_CONTENT_GRANT_READ_URI_PERMISSION) != 0
                    ) {
                        try {
                            inputContentInfo.requestPermission();
                        } catch (Throwable err) {
                            return false;
                        }
                    }
                    final Uri contentUri = inputContentInfo.getContentUri();
                    if (contentUri == null) {
                        return false;
                    }
                    ClipDescription desc = inputContentInfo.getDescription();
                    final String mimeHint = (desc != null && desc.getMimeTypeCount() > 0)
                        ? desc.getMimeType(0)
                        : null;
                    final InputContentInfoCompat heldRef = inputContentInfo;
                    new Thread(
                        () -> readAndEmitUri(appCtx, contentUri, mimeHint, heldRef),
                        "JaTextGboardCommit"
                    ).start();
                    return true;
                }
            }
        );
    }

    private static void readAndEmitUri(
        Context ctx,
        Uri uri,
        String mimeHint,
        InputContentInfoCompat permissionRef
    ) {
        try {
            ContentResolver resolver = ctx.getContentResolver();
            String resolvedMime = resolver.getType(uri);
            if (resolvedMime == null || resolvedMime.trim().isEmpty() || resolvedMime.contains("*")) {
                resolvedMime = mimeHint;
            }
            byte[] bytes;
            try (InputStream in = resolver.openInputStream(uri)) {
                if (in == null) return;
                ByteArrayOutputStream out = new ByteArrayOutputStream(65536);
                byte[] buf = new byte[16384];
                int total = 0;
                int n;
                while ((n = in.read(buf)) != -1) {
                    total += n;
                    if (total > MAX_PASTE_IMAGE_BYTES) {
                        return;
                    }
                    out.write(buf, 0, n);
                }
                bytes = out.toByteArray();
            }
            if (bytes.length < 8) return;

            String finalMime = detectImageMime(bytes, resolvedMime);
            String ext = extensionForMime(finalMime);
            String fileName = "pasted-" + System.currentTimeMillis() + "." + ext;
            String base64 = Base64.encodeToString(bytes, Base64.NO_WRAP);
            JaTextNativePlugin.emitRichContentPaste(base64, finalMime, fileName);
        } catch (Throwable ignored) {
            // Ignore unreadable external URI.
        } finally {
            if (permissionRef != null) {
                try {
                    permissionRef.releasePermission();
                } catch (Throwable ignored) {}
            }
        }
    }

    private static String detectImageMime(byte[] b, String fallback) {
        if (
            b.length >= 8 &&
            (b[0] & 0xFF) == 0x89 &&
            b[1] == 0x50 &&
            b[2] == 0x4E &&
            b[3] == 0x47
        ) {
            return "image/png";
        }
        if (b.length >= 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8) {
            return "image/jpeg";
        }
        if (b.length >= 6 && b[0] == 'G' && b[1] == 'I' && b[2] == 'F') {
            return "image/gif";
        }
        if (
            b.length >= 12 &&
            b[0] == 'R' &&
            b[1] == 'I' &&
            b[2] == 'F' &&
            b[3] == 'F' &&
            b[8] == 'W' &&
            b[9] == 'E' &&
            b[10] == 'B' &&
            b[11] == 'P'
        ) {
            return "image/webp";
        }
        if (fallback != null && fallback.startsWith("image/") && !fallback.contains("*")) {
            return fallback;
        }
        return "image/png";
    }

    private static String extensionForMime(String mime) {
        if ("image/jpeg".equalsIgnoreCase(mime) || "image/jpg".equalsIgnoreCase(mime)) return "jpg";
        if ("image/gif".equalsIgnoreCase(mime)) return "gif";
        if ("image/webp".equalsIgnoreCase(mime)) return "webp";
        return "png";
    }
}
