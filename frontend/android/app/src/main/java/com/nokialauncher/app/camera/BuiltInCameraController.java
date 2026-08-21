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
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.SurfaceTexture;
import android.graphics.drawable.GradientDrawable;
import android.media.MediaPlayer;
import android.graphics.Matrix;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.SystemClock;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.view.Surface;
import android.view.TextureView;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.view.Gravity;
import android.view.MotionEvent;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageCapture;
import androidx.camera.core.ImageCaptureException;
import androidx.camera.core.FocusMeteringAction;
import androidx.camera.core.MeteringPoint;
import androidx.camera.core.Preview;
import androidx.camera.core.SurfaceOrientedMeteringPointFactory;
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
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;

public final class BuiltInCameraController {
    public interface CameraControlListener {
        void onControl(String control);
    }

    private static final String PREFS = "nokia_camera_catalog";
    private static final String PREF_MEDIA = "media";
    private static final String RELATIVE_IMAGES = Environment.DIRECTORY_DCIM + "/Nokia Launcher";
    private static final String RELATIVE_VIDEOS = Environment.DIRECTORY_MOVIES + "/Nokia Launcher";

    private final Activity activity;
    private final ExecutorService cameraExecutor = Executors.newSingleThreadExecutor();
    private final SharedPreferences preferences;
    private final ContentResolver contentResolver;
    private final CameraControlListener controlListener;

    private ProcessCameraProvider cameraProvider;
    private FrameLayout previewContainer;
    private PreviewView previewView;
    private CameraChromeView cameraChromeView;
    private View mediaView;
    private ImageCapture imageCapture;
    private VideoCapture<Recorder> videoCapture;
    private Recording activeRecording;
    private PluginCall pendingStopCall;
    private Camera camera;
    private int lensFacing = CameraSelector.LENS_FACING_BACK;
    private int flashMode = ImageCapture.FLASH_MODE_AUTO;
    private String cameraMode = "photo";
    private boolean gridEnabled = true;
    private int surfaceX;
    private int surfaceY;
    private int surfaceWidth;
    private int surfaceHeight;

    public BuiltInCameraController(Activity activity, CameraControlListener controlListener) {
        this.activity = activity;
        this.controlListener = controlListener;
        this.preferences = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        this.contentResolver = activity.getContentResolver();
    }

    public void startCamera(PluginCall call) {
        lensFacing = "front".equals(call.getString("lens", "back"))
            ? CameraSelector.LENS_FACING_FRONT
            : CameraSelector.LENS_FACING_BACK;
        cameraMode = "video".equals(call.getString("mode", "photo")) ? "video" : "photo";
        gridEnabled = call.getBoolean("grid", true);
        updateBounds(call);
        activity.runOnUiThread(() -> attachPreviewAndBind(call));
    }

    public void updateSurfaceBounds(PluginCall call) {
        updateBounds(call);
        activity.runOnUiThread(() -> {
            View target = mediaView != null ? mediaView : previewContainer;
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
        if (cameraChromeView != null) cameraChromeView.setLens(requested);
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
        if (cameraChromeView != null) cameraChromeView.setFlash(requested);
    }

    public void setMode(PluginCall call) {
        cameraMode = "video".equals(call.getString("mode", "photo")) ? "video" : "photo";
        if (cameraChromeView != null) cameraChromeView.setMode(cameraMode);
        JSObject result = new JSObject();
        result.put("mode", cameraMode);
        call.resolve(result);
    }

    public void setGrid(PluginCall call) {
        gridEnabled = call.getBoolean("enabled", true);
        if (cameraChromeView != null) cameraChromeView.setGridEnabled(gridEnabled);
        JSObject result = new JSObject();
        result.put("enabled", gridEnabled);
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
                updateLatestThumbnail(uri.toString(), "photo");
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
                if (cameraChromeView != null) cameraChromeView.setRecording(false);
                if (finalize.hasError() || uri == null || Uri.EMPTY.equals(uri)) {
                    if (pendingStopCall != null) {
                        pendingStopCall.reject("video_recording_failed");
                        pendingStopCall = null;
                    }
                    if (finished != null) finished.close();
                    return;
                }
                JSObject media = addCatalogRecord(uri, "video", duration, hasAudio);
                updateLatestThumbnail(uri.toString(), "video");
                if (pendingStopCall != null) {
                    JSObject response = new JSObject();
                    response.put("media", media);
                    pendingStopCall.resolve(response);
                    pendingStopCall = null;
                }
                if (finished != null) finished.close();
            }
        });
        if (cameraChromeView != null) cameraChromeView.setRecording(true);
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

    public void pauseForBackground() {
        activity.runOnUiThread(() -> {
            if (activeRecording != null) activeRecording.stop();
            if (cameraProvider != null) cameraProvider.unbindAll();
            removePreview();
            removeMediaView();
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
        if (previewContainer == null) {
            previewContainer = new FrameLayout(activity);
            GradientDrawable clipShape = new GradientDrawable();
            clipShape.setColor(Color.BLACK);
            clipShape.setCornerRadius(dp(10));
            previewContainer.setBackground(clipShape);
            previewContainer.setClipToOutline(true);
        }
        if (previewView == null) {
            previewView = new PreviewView(activity);
            previewView.setImplementationMode(PreviewView.ImplementationMode.COMPATIBLE);
            previewView.setScaleType(PreviewView.ScaleType.FILL_CENTER);
            previewView.setClickable(false);
            previewView.setFocusable(false);
            previewContainer.addView(previewView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            ));
        }
        if (cameraChromeView == null) {
            cameraChromeView = new CameraChromeView(activity);
            cameraChromeView.setMode(cameraMode);
            cameraChromeView.setGridEnabled(gridEnabled);
            cameraChromeView.setLens(lensFacing == CameraSelector.LENS_FACING_FRONT ? "front" : "back");
            cameraChromeView.setFlash(flashName());
            previewContainer.addView(cameraChromeView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            ));
            loadLatestThumbnail();
        }
        previewContainer.setOnTouchListener((view, event) -> handlePreviewTouch(event));
        attachToRoot(previewContainer);
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
            if (cameraChromeView != null) cameraChromeView.setHasFlash(camera.getCameraInfo().hasFlashUnit());
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

    private boolean handlePreviewTouch(MotionEvent event) {
        if (event.getAction() != MotionEvent.ACTION_UP || previewContainer == null) return true;
        float width = previewContainer.getWidth();
        float height = previewContainer.getHeight();
        float topChrome = previewContainer.getHeight() * 0.12f;
        float bottomChrome = previewContainer.getHeight() * 0.24f;
        if (event.getY() < topChrome) {
            if (event.getX() < width * 0.32f) emitControl("flash");
            else if (event.getX() > width * 0.68f) emitControl("flip");
            return true;
        }
        if (event.getY() > height - bottomChrome) {
            float modeBoundary = height - bottomChrome + dp(48);
            if (event.getY() < modeBoundary) {
                emitControl(event.getX() < width / 2f ? "mode-video" : "mode-photo");
            } else if (event.getX() < width * 0.30f) {
                emitControl("gallery");
            } else if (event.getX() > width * 0.70f) {
                emitControl("flip");
            } else {
                emitControl("shutter");
            }
            return true;
        }
        if (camera == null) return true;
        SurfaceOrientedMeteringPointFactory factory = new SurfaceOrientedMeteringPointFactory(
            Math.max(1, previewContainer.getWidth()),
            Math.max(1, previewContainer.getHeight())
        );
        MeteringPoint point = factory.createPoint(event.getX(), event.getY());
        FocusMeteringAction action = new FocusMeteringAction.Builder(
            point,
            FocusMeteringAction.FLAG_AF | FocusMeteringAction.FLAG_AE
        ).setAutoCancelDuration(3, TimeUnit.SECONDS).build();
        camera.getCameraControl().startFocusAndMetering(action);
        if (cameraChromeView != null) cameraChromeView.showFocus(event.getX(), event.getY());
        return true;
    }

    private void emitControl(String control) {
        if (controlListener != null) controlListener.onControl(control);
    }

    private String flashName() {
        if (flashMode == ImageCapture.FLASH_MODE_ON) return "on";
        if (flashMode == ImageCapture.FLASH_MODE_OFF) return "off";
        return "auto";
    }

    private float dp(float value) {
        return value * activity.getResources().getDisplayMetrics().density;
    }

    private void removePreview() {
        if (previewContainer != null && previewContainer.getParent() instanceof ViewGroup) {
            ((ViewGroup) previewContainer.getParent()).removeView(previewContainer);
        }
        if (previewContainer != null) previewContainer.removeAllViews();
        previewContainer = null;
        previewView = null;
        if (cameraChromeView != null) cameraChromeView.release();
        cameraChromeView = null;
    }

    private void removeMediaView() {
        if (mediaView instanceof CameraVideoView) ((CameraVideoView) mediaView).release();
        if (mediaView != null && mediaView.getParent() instanceof ViewGroup) {
            ((ViewGroup) mediaView.getParent()).removeView(mediaView);
        }
        mediaView = null;
    }

    private void loadLatestThumbnail() {
        cameraExecutor.execute(() -> {
            JSONArray catalog = readCatalog();
            JSONObject latest = catalog.optJSONObject(catalog.length() - 1);
            if (latest != null) updateLatestThumbnail(latest.optString("uri"), latest.optString("type"));
        });
    }

    private void updateLatestThumbnail(String uri, String type) {
        cameraExecutor.execute(() -> {
            Bitmap thumbnail = createThumbnailBitmap(uri, type, 320);
            if (thumbnail == null) return;
            activity.runOnUiThread(() -> {
                if (cameraChromeView != null) cameraChromeView.setGalleryThumbnail(thumbnail);
                else thumbnail.recycle();
            });
        });
    }

    /** Full-screen, non-verbal camera chrome drawn above the native preview. */
    private static final class CameraChromeView extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Path path = new Path();
        private final float density;
        private String mode = "photo";
        private String lens = "back";
        private String flash = "auto";
        private boolean hasFlash = true;
        private boolean gridEnabled = true;
        private boolean recording;
        private long recordingStartedAt;
        private float focusX = -1f;
        private float focusY = -1f;
        private long focusUntil;
        private Bitmap galleryThumbnail;

        CameraChromeView(Context context) {
            super(context);
            density = context.getResources().getDisplayMetrics().density;
            setClickable(false);
            setFocusable(false);
        }

        void setMode(String value) { mode = value; invalidate(); }
        void setLens(String value) { lens = value; invalidate(); }
        void setFlash(String value) { flash = value; invalidate(); }
        void setHasFlash(boolean value) { hasFlash = value; invalidate(); }
        void setGridEnabled(boolean value) { gridEnabled = value; invalidate(); }
        void setGalleryThumbnail(Bitmap value) {
            if (galleryThumbnail != null && galleryThumbnail != value && !galleryThumbnail.isRecycled()) galleryThumbnail.recycle();
            galleryThumbnail = value;
            invalidate();
        }

        void release() {
            if (galleryThumbnail != null && !galleryThumbnail.isRecycled()) galleryThumbnail.recycle();
            galleryThumbnail = null;
        }

        void setRecording(boolean value) {
            recording = value;
            if (value) recordingStartedAt = SystemClock.elapsedRealtime();
            invalidate();
        }

        void showFocus(float x, float y) {
            focusX = x;
            focusY = y;
            focusUntil = SystemClock.elapsedRealtime() + 1800L;
            invalidate();
        }

        @Override
        protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            float width = getWidth();
            float height = getHeight();
            float top = height * 0.12f;
            float bottom = height * 0.24f;
            float previewBottom = height - bottom;

            if (gridEnabled) drawGrid(canvas, width, top, previewBottom);
            drawFocus(canvas, width, top, previewBottom);
            drawTopBar(canvas, width, top);
            drawBottomBar(canvas, width, height, bottom);

            if (recording || SystemClock.elapsedRealtime() < focusUntil) postInvalidateDelayed(200L);
        }

        private void drawGrid(Canvas canvas, float width, float top, float bottom) {
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(dp(0.7f));
            paint.setColor(0x58ffffff);
            for (int index = 1; index < 3; index++) {
                float x = width * index / 3f;
                float y = top + (bottom - top) * index / 3f;
                canvas.drawLine(x, top, x, bottom, paint);
                canvas.drawLine(0, y, width, y, paint);
            }
        }

        private void drawFocus(Canvas canvas, float width, float top, float bottom) {
            boolean tapped = SystemClock.elapsedRealtime() < focusUntil;
            float x = tapped ? focusX : width / 2f;
            float y = tapped ? focusY : top + (bottom - top) / 2f;
            float radius = dp(tapped ? 24f : 18f);
            float corner = radius * 0.48f;
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(dp(tapped ? 1.8f : 1.2f));
            paint.setColor(tapped ? 0xffffffff : 0xb8ffffff);
            canvas.drawLine(x - radius, y - radius, x - radius + corner, y - radius, paint);
            canvas.drawLine(x - radius, y - radius, x - radius, y - radius + corner, paint);
            canvas.drawLine(x + radius, y - radius, x + radius - corner, y - radius, paint);
            canvas.drawLine(x + radius, y - radius, x + radius, y - radius + corner, paint);
            canvas.drawLine(x - radius, y + radius, x - radius + corner, y + radius, paint);
            canvas.drawLine(x - radius, y + radius, x - radius, y + radius - corner, paint);
            canvas.drawLine(x + radius, y + radius, x + radius - corner, y + radius, paint);
            canvas.drawLine(x + radius, y + radius, x + radius, y + radius - corner, paint);
            canvas.drawLine(x - dp(3), y, x + dp(3), y, paint);
            canvas.drawLine(x, y - dp(3), x, y + dp(3), paint);
        }

        private void drawTopBar(Canvas canvas, float width, float top) {
            float centerY = top / 2f;
            drawControlBackdrop(canvas, dp(24), centerY, dp(18));
            drawBolt(canvas, dp(22), centerY);
            if (hasFlash) drawText(canvas, flash.toUpperCase(), dp(36), centerY + dp(4), dp(9), Paint.Align.LEFT, 0xffffffff);

            if (recording) {
                paint.setStyle(Paint.Style.FILL);
                paint.setColor(0xffe9424a);
                canvas.drawCircle(width / 2f - dp(22), centerY, dp(3.5f), paint);
                drawText(canvas, "REC", width / 2f - dp(14), centerY + dp(4), dp(10), Paint.Align.LEFT, 0xffffffff);
            } else {
                drawText(canvas, "video".equals(mode) ? "FHD" : "4:3", width / 2f, centerY + dp(4), dp(10), Paint.Align.CENTER, 0xffffffff);
            }
            drawControlBackdrop(canvas, width - dp(24), centerY, dp(18));
            drawFlipIcon(canvas, width - dp(24), centerY, dp(12));
        }

        private void drawBottomBar(Canvas canvas, float width, float height, float bottom) {
            float modeY = height - bottom + dp(22);
            int dim = 0x99ffffff;
            int active = 0xffffffff;
            float modeOffset = dp(30);
            drawText(canvas, "VIDEO", width / 2f - modeOffset, modeY, dp(8), Paint.Align.CENTER, "video".equals(mode) ? active : dim);
            drawText(canvas, "PHOTO", width / 2f + modeOffset, modeY, dp(8), Paint.Align.CENTER, "photo".equals(mode) ? active : dim);

            float controlY = height - bottom * 0.38f;
            float shutterRadius = Math.min(dp(24), bottom * 0.21f);
            drawControlBackdrop(canvas, width / 2f, controlY, shutterRadius + dp(10));
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(dp(2.2f));
            paint.setColor(0xffffffff);
            canvas.drawCircle(width / 2f, controlY, shutterRadius + dp(4), paint);
            paint.setStyle(Paint.Style.FILL);
            paint.setColor("video".equals(mode) ? 0xffe9424a : 0xfff4f5f2);
            canvas.drawCircle(width / 2f, controlY, recording ? shutterRadius * 0.58f : shutterRadius, paint);

            float iconSize = dp(28);
            float galleryLeft = dp(22);
            RectF galleryBox = new RectF(galleryLeft, controlY - iconSize / 2f, galleryLeft + iconSize, controlY + iconSize / 2f);
            drawControlBackdrop(canvas, galleryBox.centerX(), galleryBox.centerY(), dp(22));
            if (galleryThumbnail != null && !galleryThumbnail.isRecycled()) {
                drawCenterCrop(canvas, galleryThumbnail, galleryBox);
            }
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(dp(1.5f));
            paint.setColor(0xffffffff);
            canvas.drawRoundRect(galleryBox, dp(2), dp(2), paint);
            drawControlBackdrop(canvas, width - dp(37), controlY, dp(22));
            drawFlipIcon(canvas, width - dp(37), controlY, dp(15));

            if (recording) {
                long elapsed = Math.max(0L, SystemClock.elapsedRealtime() - recordingStartedAt) / 1000L;
                String timer = String.format(java.util.Locale.US, "%02d:%02d", elapsed / 60L, elapsed % 60L);
                drawText(canvas, timer, width - dp(18), height - bottom - dp(10), dp(9), Paint.Align.RIGHT, 0xffffffff);
            }
        }

        private void drawBolt(Canvas canvas, float x, float y) {
            paint.setStyle(Paint.Style.FILL);
            paint.setColor(hasFlash && !"off".equals(flash) ? 0xffffffff : 0x88ffffff);
            path.reset();
            path.moveTo(x + dp(2), y - dp(11));
            path.lineTo(x - dp(5), y + dp(1));
            path.lineTo(x, y + dp(1));
            path.lineTo(x - dp(2), y + dp(11));
            path.lineTo(x + dp(7), y - dp(3));
            path.lineTo(x + dp(2), y - dp(3));
            path.close();
            canvas.drawPath(path, paint);
        }

        private void drawFlipIcon(Canvas canvas, float x, float y, float radius) {
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(dp(2f));
            paint.setStrokeCap(Paint.Cap.ROUND);
            paint.setColor(0xffffffff);
            RectF orbit = new RectF(x - radius * 0.72f, y - radius * 0.72f, x + radius * 0.72f, y + radius * 0.72f);
            canvas.drawArc(orbit, 205, 125, false, paint);
            canvas.drawArc(orbit, 25, 125, false, paint);
            paint.setStyle(Paint.Style.FILL);
            path.reset();
            path.moveTo(x - radius * 0.85f, y - radius * 0.12f);
            path.lineTo(x - radius * 0.28f, y - radius * 0.20f);
            path.lineTo(x - radius * 0.52f, y + radius * 0.30f);
            path.close();
            canvas.drawPath(path, paint);
            path.reset();
            path.moveTo(x + radius * 0.85f, y + radius * 0.12f);
            path.lineTo(x + radius * 0.28f, y + radius * 0.20f);
            path.lineTo(x + radius * 0.52f, y - radius * 0.30f);
            path.close();
            canvas.drawPath(path, paint);
            paint.setStrokeCap(Paint.Cap.BUTT);
        }

        private void drawControlBackdrop(Canvas canvas, float x, float y, float radius) {
            paint.setStyle(Paint.Style.FILL);
            paint.setColor(0x52000000);
            canvas.drawCircle(x, y, radius, paint);
        }

        private void drawCenterCrop(Canvas canvas, Bitmap bitmap, RectF destination) {
            paint.setAlpha(255);
            float sourceRatio = (float) bitmap.getWidth() / Math.max(1, bitmap.getHeight());
            float targetRatio = destination.width() / Math.max(1f, destination.height());
            Rect source;
            if (sourceRatio > targetRatio) {
                int sourceWidth = Math.round(bitmap.getHeight() * targetRatio);
                int left = (bitmap.getWidth() - sourceWidth) / 2;
                source = new Rect(left, 0, left + sourceWidth, bitmap.getHeight());
            } else {
                int sourceHeight = Math.round(bitmap.getWidth() / targetRatio);
                int top = (bitmap.getHeight() - sourceHeight) / 2;
                source = new Rect(0, top, bitmap.getWidth(), top + sourceHeight);
            }
            canvas.drawBitmap(bitmap, source, destination, paint);
        }

        private void drawText(Canvas canvas, String text, float x, float baseline, float size, Paint.Align align, int color) {
            paint.setStyle(Paint.Style.FILL);
            paint.setTypeface(android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD));
            paint.setTextSize(size);
            paint.setTextAlign(align);
            paint.setColor(0xc9000000);
            canvas.drawText(text, x + dp(1), baseline + dp(1), paint);
            paint.setColor(color);
            canvas.drawText(text, x, baseline, paint);
        }

        private float dp(float value) { return value * density; }
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
        Bitmap bitmap = createThumbnailBitmap(uriText, type, 240);
        if (bitmap == null) return null;
        try {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.JPEG, 72, output);
            bitmap.recycle();
            return "data:image/jpeg;base64," + Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP);
        } catch (Exception ignored) {
            if (bitmap != null && !bitmap.isRecycled()) bitmap.recycle();
            return null;
        }
    }

    private Bitmap createThumbnailBitmap(String uriText, String type, int targetWidth) {
        Bitmap bitmap = null;
        MediaMetadataRetriever retriever = null;
        try {
            Uri uri = Uri.parse(uriText);
            if ("video".equals(type)) {
                retriever = new MediaMetadataRetriever();
                retriever.setDataSource(activity, uri);
                bitmap = retriever.getFrameAtTime(0);
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
            int width = Math.max(1, Math.min(targetWidth, bitmap.getWidth()));
            int height = Math.max(1, bitmap.getHeight() * width / Math.max(1, bitmap.getWidth()));
            Bitmap scaled = Bitmap.createScaledBitmap(bitmap, width, height, true);
            if (scaled != bitmap) bitmap.recycle();
            return scaled;
        } catch (Exception ignored) {
            if (bitmap != null && !bitmap.isRecycled()) bitmap.recycle();
            return null;
        } finally {
            if (retriever != null) {
                try { retriever.release(); } catch (Exception ignored) {}
            }
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
