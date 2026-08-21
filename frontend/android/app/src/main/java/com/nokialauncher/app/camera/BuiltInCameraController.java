package com.nokialauncher.app.camera;

import android.Manifest;
import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.pm.PackageManager;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.SurfaceTexture;
import android.media.MediaPlayer;
import android.graphics.Matrix;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.view.Surface;
import android.view.TextureView;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.view.Gravity;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageCapture;
import androidx.camera.core.ImageCaptureException;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.video.FallbackStrategy;
import androidx.camera.video.FileOutputOptions;
import androidx.camera.video.MediaStoreOutputOptions;
import androidx.camera.video.PendingRecording;
import androidx.camera.video.Quality;
import androidx.camera.video.QualitySelector;
import androidx.camera.video.Recorder;
import androidx.camera.video.Recording;
import androidx.camera.video.VideoCapture;
import androidx.camera.video.VideoRecordEvent;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import androidx.exifinterface.media.ExifInterface;
import androidx.lifecycle.LifecycleOwner;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.google.common.util.concurrent.ListenableFuture;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.Arrays;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

public final class BuiltInCameraController {
    private static final String PREFS = "nokia_camera_catalog";
    private static final String PREF_MEDIA = "media";
    private static final String RELATIVE_IMAGES = Environment.DIRECTORY_DCIM + "/Nokia Launcher";
    private static final String RELATIVE_VIDEOS = Environment.DIRECTORY_MOVIES + "/Nokia Launcher";

    private final Activity activity;
    private final ExecutorService cameraExecutor = Executors.newSingleThreadExecutor();
    private final SharedPreferences preferences;
    private final ContentResolver contentResolver;

    private ProcessCameraProvider cameraProvider;
    private PreviewView previewView;
    private View mediaView;
    private ImageCapture imageCapture;
    private VideoCapture<Recorder> videoCapture;
    private Recording activeRecording;
    private PluginCall pendingStopCall;
    private Camera camera;
    private int lensFacing = CameraSelector.LENS_FACING_BACK;
    private int flashMode = ImageCapture.FLASH_MODE_AUTO;
    private int surfaceX;
    private int surfaceY;
    private int surfaceWidth;
    private int surfaceHeight;

    public BuiltInCameraController(Activity activity) {
        this.activity = activity;
        this.preferences = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        this.contentResolver = activity.getContentResolver();
    }

    public void startCamera(PluginCall call) {
        lensFacing = "front".equals(call.getString("lens", "back"))
            ? CameraSelector.LENS_FACING_FRONT
            : CameraSelector.LENS_FACING_BACK;
        updateBounds(call);
        activity.runOnUiThread(() -> attachPreviewAndBind(call));
    }

    public void updateSurfaceBounds(PluginCall call) {
        updateBounds(call);
        activity.runOnUiThread(() -> {
            View target = mediaView != null ? mediaView : previewView;
            if (target != null) applyBounds(target);
            JSObject result = new JSObject();
            result.put("updated", target != null);
            call.resolve(result);
        });
    }

    public void setLens(PluginCall call) {
        String requested = call.getString("lens", "back");
        lensFacing = "front".equals(requested)
            ? CameraSelector.LENS_FACING_FRONT
            : CameraSelector.LENS_FACING_BACK;
        if (cameraProvider == null || previewView == null) {
            call.reject("camera_not_started");
            return;
        }
        activity.runOnUiThread(() -> bindUseCases(call));
    }

    public void setFlash(PluginCall call) {
        String requested = call.getString("mode", "auto");
        flashMode = "on".equals(requested)
            ? ImageCapture.FLASH_MODE_ON
            : "off".equals(requested) ? ImageCapture.FLASH_MODE_OFF : ImageCapture.FLASH_MODE_AUTO;
        if (imageCapture != null) imageCapture.setFlashMode(flashMode);
        if (camera != null && "torch".equals(requested) && camera.getCameraInfo().hasFlashUnit()) {
            camera.getCameraControl().enableTorch(true);
        } else if (camera != null) {
            camera.getCameraControl().enableTorch(false);
        }
        JSObject result = new JSObject();
        result.put("mode", requested);
        call.resolve(result);
    }

    public void capturePhoto(PluginCall call) {
        if (imageCapture == null) {
            call.reject("camera_not_ready");
            return;
        }
        final String name = "NOKIA_" + System.currentTimeMillis() + ".jpg";
        final Uri[] destination = new Uri[1];
        ImageCapture.OutputFileOptions output;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Images.Media.DISPLAY_NAME, name);
            values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
            values.put(MediaStore.Images.Media.RELATIVE_PATH, RELATIVE_IMAGES);
            output = new ImageCapture.OutputFileOptions.Builder(
                contentResolver,
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                values
            ).build();
        } else {
            File file = new File(photoDirectory(), name);
            destination[0] = Uri.fromFile(file);
            output = new ImageCapture.OutputFileOptions.Builder(file).build();
        }

        imageCapture.takePicture(output, cameraExecutor, new ImageCapture.OnImageSavedCallback() {
            @Override
            public void onImageSaved(ImageCapture.OutputFileResults results) {
                Uri uri = results.getSavedUri() != null ? results.getSavedUri() : destination[0];
                if (uri == null) {
                    call.reject("photo_save_failed");
                    return;
                }
                JSObject media = addCatalogRecord(uri, "photo", 0L, false);
                JSObject response = new JSObject();
                response.put("media", media);
                call.resolve(response);
            }

            @Override
            public void onError(ImageCaptureException exception) {
                call.reject("photo_capture_failed", exception);
            }
        });
    }

    public void startVideo(PluginCall call, boolean audioEnabled) {
        if (videoCapture == null || activeRecording != null) {
            call.reject(activeRecording != null ? "recording_in_progress" : "camera_not_ready");
            return;
        }
        String name = "NOKIA_" + System.currentTimeMillis() + ".mp4";
        PendingRecording pending;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Video.Media.DISPLAY_NAME, name);
            values.put(MediaStore.Video.Media.MIME_TYPE, "video/mp4");
            values.put(MediaStore.Video.Media.RELATIVE_PATH, RELATIVE_VIDEOS);
            MediaStoreOutputOptions output = new MediaStoreOutputOptions.Builder(
                contentResolver,
                MediaStore.Video.Media.EXTERNAL_CONTENT_URI
            ).setContentValues(values).build();
            pending = videoCapture.getOutput().prepareRecording(activity, output);
        } else {
            File file = new File(videoDirectory(), name);
            FileOutputOptions output = new FileOutputOptions.Builder(file).build();
            pending = videoCapture.getOutput().prepareRecording(activity, output);
        }
        boolean audioGranted = audioEnabled
            && ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
        if (audioGranted) {
            try {
                pending = pending.withAudioEnabled();
            } catch (SecurityException ignored) {
                audioGranted = false;
            }
        }
        final boolean hasAudio = audioGranted;
        activeRecording = pending.start(ContextCompat.getMainExecutor(activity), event -> {
            if (event instanceof VideoRecordEvent.Finalize) {
                VideoRecordEvent.Finalize finalize = (VideoRecordEvent.Finalize) event;
                Uri uri = finalize.getOutputResults().getOutputUri();
                long duration = finalize.getRecordingStats().getRecordedDurationNanos() / 1_000_000L;
                Recording finished = activeRecording;
                activeRecording = null;
                if (finalize.hasError() || uri == null || Uri.EMPTY.equals(uri)) {
                    if (pendingStopCall != null) {
                        pendingStopCall.reject("video_recording_failed");
                        pendingStopCall = null;
                    }
                    if (finished != null) finished.close();
                    return;
                }
                JSObject media = addCatalogRecord(uri, "video", duration, hasAudio);
                if (pendingStopCall != null) {
                    JSObject response = new JSObject();
                    response.put("media", media);
                    pendingStopCall.resolve(response);
                    pendingStopCall = null;
                }
                if (finished != null) finished.close();
            }
        });
        JSObject result = new JSObject();
        result.put("recording", true);
        result.put("audioEnabled", hasAudio);
        call.resolve(result);
    }

    public void stopVideo(PluginCall call) {
        if (activeRecording == null) {
            JSObject result = new JSObject();
            result.put("media", JSONObject.NULL);
            call.resolve(result);
            return;
        }
        if (pendingStopCall != null) {
            call.reject("recording_finalizing");
            return;
        }
        pendingStopCall = call;
        activeRecording.stop();
    }

    public void listMedia(PluginCall call) {
        cameraExecutor.execute(() -> {
            JSONArray catalog = readCatalog();
            JSONArray media = new JSONArray();
            int limit = Math.max(1, Math.min(call.getInt("limit", 60), 100));
            for (int index = catalog.length() - 1; index >= 0 && media.length() < limit; index--) {
                JSONObject item = catalog.optJSONObject(index);
                if (item == null) continue;
                try {
                    JSONObject copy = new JSONObject(item.toString());
                    String thumbnail = createThumbnail(copy.optString("uri"), copy.optString("type"));
                    if (thumbnail != null) copy.put("thumbnail", thumbnail);
                    media.put(copy);
                } catch (Exception ignored) {
                    // Skip stale or corrupt entries without breaking the gallery.
                }
            }
            JSObject result = new JSObject();
            result.put("media", media);
            call.resolve(result);
        });
    }

    public void showMedia(PluginCall call) {
        String uriText = call.getString("uri");
        String type = call.getString("type", "photo");
        if (uriText == null || uriText.isEmpty()) {
            call.reject("media_uri_required");
            return;
        }
        updateBounds(call);
        Uri uri = Uri.parse(uriText);
        activity.runOnUiThread(() -> {
            removePreview();
            if ("video".equals(type)) {
                CameraVideoView video = new CameraVideoView(activity, uri);
                video.setBackgroundColor(0xff000000);
                mediaView = video;
            } else {
                ImageView image = new ImageView(activity);
                image.setBackgroundColor(0xff000000);
                image.setScaleType(ImageView.ScaleType.FIT_CENTER);
                image.setImageURI(uri);
                mediaView = image;
            }
            attachToRoot(mediaView);
            JSObject result = new JSObject();
            result.put("shown", true);
            call.resolve(result);
        });
    }

    public void controlMedia(PluginCall call) {
        String action = call.getString("action", "toggle");
        activity.runOnUiThread(() -> {
            if (mediaView instanceof CameraVideoView) {
                CameraVideoView video = (CameraVideoView) mediaView;
                if ("play".equals(action) || ("toggle".equals(action) && !video.isPlaying())) video.start();
                else if ("pause".equals(action) || "toggle".equals(action)) video.pause();
            }
            JSObject result = new JSObject();
            result.put("controlled", mediaView instanceof CameraVideoView);
            call.resolve(result);
        });
    }

    public void hideMedia(PluginCall call) {
        activity.runOnUiThread(() -> {
            removeMediaView();
            JSObject result = new JSObject();
            result.put("hidden", true);
            call.resolve(result);
        });
    }

    public void stopCamera(PluginCall call) {
        activity.runOnUiThread(() -> {
            if (activeRecording != null) activeRecording.stop();
            if (cameraProvider != null) cameraProvider.unbindAll();
            removePreview();
            removeMediaView();
            JSObject result = new JSObject();
            result.put("stopped", true);
            call.resolve(result);
        });
    }

    public void destroy() {
        if (activeRecording != null) activeRecording.stop();
        if (cameraProvider != null) cameraProvider.unbindAll();
        activity.runOnUiThread(() -> {
            removePreview();
            removeMediaView();
        });
        cameraExecutor.shutdown();
    }

    private void attachPreviewAndBind(PluginCall call) {
        removeMediaView();
        if (previewView == null) {
            previewView = new PreviewView(activity);
            previewView.setImplementationMode(PreviewView.ImplementationMode.COMPATIBLE);
            previewView.setScaleType(PreviewView.ScaleType.FILL_CENTER);
            previewView.setClickable(false);
            previewView.setFocusable(false);
        }
        attachToRoot(previewView);
        ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(activity);
        future.addListener(() -> {
            try {
                cameraProvider = future.get();
                bindUseCases(call);
            } catch (Exception exception) {
                removePreview();
                call.reject("camera_start_failed", exception);
            }
        }, ContextCompat.getMainExecutor(activity));
    }

    private void bindUseCases(PluginCall call) {
        try {
            CameraSelector selector = new CameraSelector.Builder().requireLensFacing(lensFacing).build();
            if (!cameraProvider.hasCamera(selector)) {
                call.reject("camera_lens_unavailable");
                return;
            }
            int rotation = previewView.getDisplay() != null
                ? previewView.getDisplay().getRotation()
                : Surface.ROTATION_0;
            Preview preview = new Preview.Builder().setTargetRotation(rotation).build();
            preview.setSurfaceProvider(previewView.getSurfaceProvider());
            imageCapture = new ImageCapture.Builder()
                .setTargetRotation(rotation)
                .setFlashMode(flashMode)
                .build();
            Recorder recorder = new Recorder.Builder()
                .setQualitySelector(QualitySelector.fromOrderedList(
                    Arrays.asList(Quality.FHD, Quality.HD, Quality.SD),
                    FallbackStrategy.lowerQualityOrHigherThan(Quality.SD)
                ))
                .build();
            videoCapture = VideoCapture.withOutput(recorder);
            videoCapture.setTargetRotation(rotation);
            cameraProvider.unbindAll();
            camera = cameraProvider.bindToLifecycle(
                (LifecycleOwner) activity,
                selector,
                preview,
                imageCapture,
                videoCapture
            );
            JSObject result = new JSObject();
            result.put("sessionId", UUID.randomUUID().toString());
            result.put("lens", lensFacing == CameraSelector.LENS_FACING_FRONT ? "front" : "back");
            result.put("hasFlash", camera.getCameraInfo().hasFlashUnit());
            call.resolve(result);
        } catch (Exception exception) {
            call.reject("camera_bind_failed", exception);
        }
    }

    private void updateBounds(PluginCall call) {
        surfaceX = Math.max(0, call.getInt("x", 0));
        surfaceY = Math.max(0, call.getInt("y", 0));
        surfaceWidth = Math.max(1, call.getInt("width", activity.getResources().getDisplayMetrics().widthPixels));
        surfaceHeight = Math.max(1, call.getInt("height", activity.getResources().getDisplayMetrics().heightPixels / 2));
    }

    private void attachToRoot(View view) {
        FrameLayout root = activity.findViewById(android.R.id.content);
        if (view.getParent() instanceof ViewGroup) ((ViewGroup) view.getParent()).removeView(view);
        root.addView(view);
        applyBounds(view);
        view.bringToFront();
    }

    private void applyBounds(View view) {
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(surfaceWidth, surfaceHeight);
        params.leftMargin = surfaceX;
        params.topMargin = surfaceY;
        view.setLayoutParams(params);
    }

    private void removePreview() {
        if (previewView != null && previewView.getParent() instanceof ViewGroup) {
            ((ViewGroup) previewView.getParent()).removeView(previewView);
        }
        previewView = null;
    }

    private void removeMediaView() {
        if (mediaView instanceof CameraVideoView) ((CameraVideoView) mediaView).release();
        if (mediaView != null && mediaView.getParent() instanceof ViewGroup) {
            ((ViewGroup) mediaView.getParent()).removeView(mediaView);
        }
        mediaView = null;
    }

    /**
     * TextureView-based playback stays composited inside the measured LCD slot.
     * Android VideoView owns a SurfaceView whose video plane can escape parent
     * clipping on some devices/emulators when playback begins.
     */
    private static final class CameraVideoView extends FrameLayout implements TextureView.SurfaceTextureListener {
        private final Activity activity;
        private final Uri uri;
        private final TextureView textureView;
        private MediaPlayer player;
        private boolean prepared;
        private boolean playWhenReady;

        CameraVideoView(Activity activity, Uri uri) {
            super(activity);
            this.activity = activity;
            this.uri = uri;
            setBackgroundColor(0xff000000);
            textureView = new TextureView(activity);
            textureView.setSurfaceTextureListener(this);
            addView(textureView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
                Gravity.CENTER
            ));
        }

        void start() {
            playWhenReady = true;
            if (prepared && player != null) player.start();
        }

        void pause() {
            playWhenReady = false;
            if (prepared && player != null && player.isPlaying()) player.pause();
        }

        boolean isPlaying() {
            return prepared && player != null && player.isPlaying();
        }

        void release() {
            playWhenReady = false;
            prepared = false;
            if (player != null) {
                player.reset();
                player.release();
                player = null;
            }
        }

        @Override
        public void onSurfaceTextureAvailable(SurfaceTexture surfaceTexture, int width, int height) {
            release();
            player = new MediaPlayer();
            Surface surface = new Surface(surfaceTexture);
            player.setSurface(surface);
            surface.release();
            try {
                player.setDataSource(activity, uri);
                player.setOnPreparedListener(mediaPlayer -> {
                    prepared = true;
                    fitVideo(mediaPlayer.getVideoWidth(), mediaPlayer.getVideoHeight());
                    if (playWhenReady) mediaPlayer.start();
                });
                player.setOnVideoSizeChangedListener((mediaPlayer, videoWidth, videoHeight) ->
                    fitVideo(videoWidth, videoHeight)
                );
                player.setOnCompletionListener(mediaPlayer -> {
                    playWhenReady = false;
                    mediaPlayer.seekTo(0);
                });
                player.prepareAsync();
            } catch (Exception exception) {
                release();
            }
        }

        private void fitVideo(int videoWidth, int videoHeight) {
            if (videoWidth <= 0 || videoHeight <= 0 || getWidth() <= 0 || getHeight() <= 0) return;
            float scale = Math.min((float) getWidth() / videoWidth, (float) getHeight() / videoHeight);
            int width = Math.max(1, Math.round(videoWidth * scale));
            int height = Math.max(1, Math.round(videoHeight * scale));
            FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(width, height, Gravity.CENTER);
            textureView.setLayoutParams(params);
        }

        @Override
        public void onSurfaceTextureSizeChanged(SurfaceTexture surfaceTexture, int width, int height) {
            if (prepared && player != null) fitVideo(player.getVideoWidth(), player.getVideoHeight());
        }

        @Override
        public boolean onSurfaceTextureDestroyed(SurfaceTexture surfaceTexture) {
            release();
            return true;
        }

        @Override
        public void onSurfaceTextureUpdated(SurfaceTexture surfaceTexture) {}
    }

    private File photoDirectory() {
        File directory = new File(activity.getExternalFilesDir(Environment.DIRECTORY_PICTURES), "Nokia Launcher");
        if (!directory.exists()) directory.mkdirs();
        return directory;
    }

    private File videoDirectory() {
        File directory = new File(activity.getExternalFilesDir(Environment.DIRECTORY_MOVIES), "Nokia Launcher");
        if (!directory.exists()) directory.mkdirs();
        return directory;
    }

    private synchronized JSObject addCatalogRecord(Uri uri, String type, long durationMs, boolean hasAudio) {
        JSONArray catalog = readCatalog();
        JSObject media = new JSObject();
        media.put("id", UUID.randomUUID().toString());
        media.put("uri", uri.toString());
        media.put("type", type);
        media.put("createdAt", System.currentTimeMillis());
        media.put("durationMs", durationMs);
        media.put("hasAudio", hasAudio);
        catalog.put(media);
        preferences.edit().putString(PREF_MEDIA, catalog.toString()).apply();
        return media;
    }

    private synchronized JSONArray readCatalog() {
        try {
            return new JSONArray(preferences.getString(PREF_MEDIA, "[]"));
        } catch (Exception ignored) {
            return new JSONArray();
        }
    }

    private String createThumbnail(String uriText, String type) {
        Bitmap bitmap = null;
        try {
            Uri uri = Uri.parse(uriText);
            if ("video".equals(type)) {
                MediaMetadataRetriever retriever = new MediaMetadataRetriever();
                retriever.setDataSource(activity, uri);
                bitmap = retriever.getFrameAtTime(0);
                retriever.release();
            } else {
                try (InputStream stream = contentResolver.openInputStream(uri)) {
                    bitmap = BitmapFactory.decodeStream(stream);
                }
                int degrees = photoRotation(uri);
                if (bitmap != null && degrees != 0) {
                    Matrix matrix = new Matrix();
                    matrix.postRotate(degrees);
                    Bitmap rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true);
                    if (rotated != bitmap) bitmap.recycle();
                    bitmap = rotated;
                }
            }
            if (bitmap == null) return null;
            int targetWidth = 240;
            int targetHeight = Math.max(1, bitmap.getHeight() * targetWidth / Math.max(1, bitmap.getWidth()));
            Bitmap scaled = Bitmap.createScaledBitmap(bitmap, targetWidth, targetHeight, true);
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            scaled.compress(Bitmap.CompressFormat.JPEG, 65, output);
            if (scaled != bitmap) scaled.recycle();
            bitmap.recycle();
            return "data:image/jpeg;base64," + Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP);
        } catch (Exception ignored) {
            if (bitmap != null && !bitmap.isRecycled()) bitmap.recycle();
            return null;
        }
    }

    private int photoRotation(Uri uri) {
        try (InputStream stream = contentResolver.openInputStream(uri)) {
            if (stream == null) return 0;
            int orientation = new ExifInterface(stream).getAttributeInt(
                ExifInterface.TAG_ORIENTATION,
                ExifInterface.ORIENTATION_NORMAL
            );
            if (orientation == ExifInterface.ORIENTATION_ROTATE_90) return 90;
            if (orientation == ExifInterface.ORIENTATION_ROTATE_180) return 180;
            if (orientation == ExifInterface.ORIENTATION_ROTATE_270) return 270;
        } catch (Exception ignored) {
            // A missing EXIF block is equivalent to normal orientation.
        }
        return 0;
    }
}
