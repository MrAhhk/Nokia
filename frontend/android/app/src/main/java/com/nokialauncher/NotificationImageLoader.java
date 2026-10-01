package com.nokialauncher;

import android.app.Notification;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.Icon;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Parcelable;
import android.util.Base64;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;

/** Best-effort previews: bounded work, bounded decode and no provider I/O on UI. */
final class NotificationImageLoader {
    interface ImageCallback { void accept(String value); }
    private final Context context;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ThreadPoolExecutor worker = new ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS,
        new ArrayBlockingQueue<>(8), new ThreadPoolExecutor.DiscardOldestPolicy());
    private volatile boolean closed;
    NotificationImageLoader(Context context) { this.context = context.getApplicationContext(); }

    static Uri imageUri(Notification notification) {
        if (notification == null || notification.extras == null) return null;
        try {
            Parcelable[] messages = notification.extras.getParcelableArray("android.messages");
            if (messages != null && messages.length > 0 && messages[messages.length - 1] instanceof Bundle) {
                Bundle message = (Bundle) messages[messages.length - 1];
                Object uri = message.get("uri");
                if (String.valueOf(message.get("type")).startsWith("image/") && uri instanceof Uri
                    && "content".equals(((Uri) uri).getScheme())) return (Uri) uri;
            }
        } catch (Exception ignored) {}
        return null;
    }
    private static Object picture(Notification notification) {
        if (notification == null || notification.extras == null) return null;
        try {
            Object picture = notification.extras.get(Notification.EXTRA_PICTURE);
            if (picture instanceof Bitmap) return picture;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                Object value = notification.extras.get(Notification.EXTRA_PICTURE_ICON);
                if (value instanceof Icon) return value;
            }
        } catch (RuntimeException ignored) {
            // Malformed or unparcelable extras are treated as having no preview.
        }
        return null;
    }
    static boolean hasImage(Notification notification) {
        return imageUri(notification) != null || picture(notification) != null;
    }
    void load(Notification notification, ImageCallback callback) {
        if (closed) return;
        try {
            worker.execute(() -> {
                String result = decode(notification);
                if (result != null && !closed) main.post(() -> { if (!closed) callback.accept(result); });
            });
        } catch (RejectedExecutionException ignored) {
            // Teardown raced this best-effort preview request.
        }
    }
    void close() { closed = true; worker.shutdownNow(); main.removeCallbacksAndMessages(null); }

    private String decode(Notification notification) {
        Bitmap bitmap = null;
        boolean owned = false;
        try {
            Uri uri = imageUri(notification);
            if (uri != null) {
                byte[] bytes;
                try (InputStream stream = context.getContentResolver().openInputStream(uri)) {
                    bytes = BoundedInputReader.read(stream, 4 * 1024 * 1024);
                }
                if (bytes == null) return null;
                BitmapFactory.Options options = new BitmapFactory.Options();
                options.inJustDecodeBounds = true;
                BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
                options.inSampleSize = 1;
                int edge = Math.max(options.outWidth, options.outHeight);
                if (edge <= 0) return null;
                while (edge / options.inSampleSize / 2 >= 256) options.inSampleSize *= 2;
                options.inJustDecodeBounds = false;
                bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
                owned = true;
            } else {
                Object picture = picture(notification);
                if (picture instanceof Bitmap) {
                    bitmap = (Bitmap) picture;
                } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && picture instanceof Icon) {
                    Icon icon = (Icon) picture;
                    int type = icon.getType();
                    if (type == Icon.TYPE_BITMAP || type == Icon.TYPE_ADAPTIVE_BITMAP) {
                        Drawable drawable = icon.loadDrawable(context);
                        if (drawable != null) {
                            int width = Math.max(1, drawable.getIntrinsicWidth());
                            int height = Math.max(1, drawable.getIntrinsicHeight());
                            double scale = Math.min(1.0, 256.0 / Math.max(width, height));
                            bitmap = Bitmap.createBitmap(Math.max(1, (int) (width * scale)),
                                Math.max(1, (int) (height * scale)), Bitmap.Config.ARGB_8888);
                            drawable.setBounds(0, 0, bitmap.getWidth(), bitmap.getHeight());
                            drawable.draw(new Canvas(bitmap));
                            owned = true;
                        }
                    } else if (type == Icon.TYPE_URI
                        || (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && type == Icon.TYPE_URI_ADAPTIVE_BITMAP)) {
                        Uri iconUri = icon.getUri();
                        if (iconUri != null && "content".equals(iconUri.getScheme())) {
                            byte[] bytes;
                            try (InputStream stream = context.getContentResolver().openInputStream(iconUri)) {
                                bytes = BoundedInputReader.read(stream, 4 * 1024 * 1024);
                            }
                            if (bytes != null) {
                                BitmapFactory.Options options = new BitmapFactory.Options();
                                options.inJustDecodeBounds = true;
                                BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
                                int edge = Math.max(options.outWidth, options.outHeight);
                                if (edge > 0) {
                                    options.inSampleSize = 1;
                                    while (edge / options.inSampleSize / 2 >= 256) options.inSampleSize *= 2;
                                    options.inJustDecodeBounds = false;
                                    bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
                                    owned = bitmap != null;
                                }
                            }
                        }
                    }
                }
            }
            if (bitmap == null || bitmap.isRecycled()) return null;
            double scale = Math.min(1.0, 256.0 / Math.max(bitmap.getWidth(), bitmap.getHeight()));
            Bitmap small = Bitmap.createScaledBitmap(bitmap, Math.max(1, (int)(bitmap.getWidth() * scale)),
                Math.max(1, (int)(bitmap.getHeight() * scale)), true);
            if (small != bitmap) { if (owned) bitmap.recycle(); bitmap = small; owned = true; }
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.JPEG, 65, output);
            if (output.size() > 32 * 1024) return null;
            return "data:image/jpeg;base64," + Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP);
        } catch (Exception ignored) {
            return null;
        } finally {
            if (owned && bitmap != null && !bitmap.isRecycled()) bitmap.recycle();
        }
    }
}
