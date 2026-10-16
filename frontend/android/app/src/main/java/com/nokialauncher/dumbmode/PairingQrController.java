package com.nokialauncher.dumbmode;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.os.Looper;
import android.util.Base64;
import android.util.Size;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.LifecycleOwner;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.DecodeHintType;
import com.google.zxing.EncodeHintType;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.PlanarYUVLuminanceSource;
import com.google.zxing.Result;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.common.HybridBinarizer;
import com.google.zxing.qrcode.QRCodeWriter;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.EnumMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.RejectedExecutionException;
import org.json.JSONObject;

/** Feature-scoped QR transport. Authentication and public-payload validation stay in the protocol owner. */
public final class PairingQrController {
    private static final int MAX_PAYLOAD_BYTES = 2048;
    private final Activity activity;
    private final ExecutorService worker = new ThreadPoolExecutor(1, 1, 0L, TimeUnit.MILLISECONDS,
        new ArrayBlockingQueue<>(4), new ThreadPoolExecutor.AbortPolicy());
    private volatile long generation;
    private volatile boolean destroyed;
    private PluginCall pending;
    private String scanId;
    private FrameLayout container;
    private Preview preview;
    private ImageAnalysis analysis;
    private ProcessCameraProvider provider;

    private final java.util.function.BooleanSupplier paidAccess;

    public PairingQrController(Activity activity, java.util.function.BooleanSupplier paidAccess) {
        this.activity = activity; this.paidAccess = java.util.Objects.requireNonNull(paidAccess);
    }
    private boolean requirePaid(PluginCall call) {
        if (paidAccess.getAsBoolean()) return true;
        call.reject("billing_access_required"); return false;
    }

    public void renderQr(PluginCall call) {
        String payload = call.getString("payload", "");
        if (!validPayload(payload)) { call.reject("invalid_pairing_payload"); return; }
        if (!requirePaid(call)) return;
        if (destroyed) { call.reject("pairing_scanner_closed"); return; }
        try {
            worker.execute(() -> {
                if (!requirePaid(call)) return;
                Bitmap bitmap = null;
                try {
                    PairingProtocol.validatePublicPayload(payload);
                    Map<EncodeHintType, Object> hints = new EnumMap<>(EncodeHintType.class);
                    hints.put(EncodeHintType.CHARACTER_SET, "UTF-8");
                    hints.put(EncodeHintType.MARGIN, 4);
                    BitMatrix matrix = new QRCodeWriter().encode(payload, BarcodeFormat.QR_CODE, 512, 512, hints);
                    int width = matrix.getWidth(), height = matrix.getHeight();
                    int[] pixels = new int[width * height];
                    for (int y = 0; y < height; y++) for (int x = 0; x < width; x++) {
                        pixels[y * width + x] = matrix.get(x, y) ? Color.BLACK : Color.WHITE;
                    }
                    bitmap = Bitmap.createBitmap(pixels, width, height, Bitmap.Config.ARGB_8888);
                    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                    if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, bytes)) throw new IllegalStateException();
                    JSObject result = new JSObject();
                    result.put("dataUrl", "data:image/png;base64," + Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP));
                    if (destroyed) call.reject("pairing_scanner_closed"); else call.resolve(result);
                } catch (Exception ignored) { call.reject("pairing_qr_failed"); }
                finally { if (bitmap != null) bitmap.recycle(); }
            });
        } catch (RejectedExecutionException ignored) { call.reject(destroyed ? "pairing_scanner_closed" : "pairing_qr_busy"); }
    }

    /** Bounds are CSS pixels, relative to the activity content viewport. Resolves when a QR is read. */
    public void start(PluginCall call) {
        if (Looper.myLooper() != Looper.getMainLooper()) { activity.runOnUiThread(() -> start(call)); return; }
        if (!requirePaid(call)) return;
        if (destroyed) { call.reject("pairing_scanner_closed"); return; }
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            call.reject("camera_permission_denied"); return;
        }
        String requestedId = call.getString("scanId", "");
        JSONObject bounds = call.getObject("bounds");
        if (requestedId.isEmpty() || requestedId.length() > 100 || !validBounds(bounds)) {
            call.reject("invalid_scan_bounds"); return;
        }
        release("pairing_scan_cancelled");
        pending = call;
        scanId = requestedId;
        final long current = ++generation;
        try {
            FrameLayout root = activity.findViewById(android.R.id.content);
            container = new FrameLayout(activity);
            container.setBackgroundColor(Color.BLACK);
            PreviewView view = new PreviewView(activity);
            view.setImplementationMode(PreviewView.ImplementationMode.COMPATIBLE);
            view.setScaleType(PreviewView.ScaleType.FILL_CENTER);
            view.setClickable(false);
            container.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            float density = activity.getResources().getDisplayMetrics().density;
            int x = Math.round((float) bounds.optDouble("x") * density);
            int y = Math.round((float) bounds.optDouble("y") * density);
            int width = Math.round((float) bounds.optDouble("width") * density);
            int height = Math.round((float) bounds.optDouble("height") * density);
            // Never cover keypad/footer, even when the web surface gives stale bounds after rotation.
            if (x + width > root.getWidth() || y + height > root.getHeight()) throw new IllegalArgumentException();
            FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(width, height);
            params.leftMargin = x; params.topMargin = y;
            root.addView(container, params);
            ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(activity);
            future.addListener(() -> {
                if (destroyed || current != generation || pending != call) return;
                if (!paidAccess.getAsBoolean()) { release("billing_access_required"); return; }
                try {
                    provider = future.get();
                    preview = new Preview.Builder().build();
                    preview.setSurfaceProvider(view.getSurfaceProvider());
                    analysis = new ImageAnalysis.Builder()
                        .setTargetResolution(new Size(640, 480))
                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build();
                    analysis.setAnalyzer(worker, image -> decode(image, current));
                    provider.bindToLifecycle((LifecycleOwner) activity, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis);
                } catch (Exception ignored) { release("pairing_camera_unavailable"); }
            }, ContextCompat.getMainExecutor(activity));
        } catch (Exception ignored) { release("pairing_camera_unavailable"); }
    }

    public void stop(PluginCall call) {
        if (Looper.myLooper() != Looper.getMainLooper()) { activity.runOnUiThread(() -> stop(call)); return; }
        String requestedId = call.getString("scanId", "");
        // A stale screen cleanup cannot cancel a newer scan.
        if (requestedId.isEmpty() || requestedId.equals(scanId)) release("pairing_scan_cancelled");
        JSObject result = new JSObject(); result.put("stopped", true); call.resolve(result);
    }

    public void pauseForBackground() {
        if (Looper.myLooper() != Looper.getMainLooper()) { activity.runOnUiThread(this::pauseForBackground); return; }
        release("pairing_scan_cancelled");
    }

    public void destroy() {
        if (Looper.myLooper() != Looper.getMainLooper()) { activity.runOnUiThread(this::destroy); return; }
        destroyed = true;
        release("pairing_scanner_closed");
        // Drain already queued bounded work so every bridge call settles on destruction.
        worker.shutdown();
    }

    private void decode(ImageProxy image, long current) {
        try {
            if (destroyed || generation != current) return;
            int width = image.getWidth(), height = image.getHeight();
            if (width <= 0 || height <= 0 || (long) width * height > 1920L * 1080L) return;
            ImageProxy.PlaneProxy plane = image.getPlanes()[0];
            ByteBuffer buffer = plane.getBuffer().duplicate();
            int origin = buffer.position();
            byte[] luminance = new byte[width * height];
            for (int y = 0; y < height; y++) for (int x = 0; x < width; x++) {
                luminance[y * width + x] = buffer.get(origin + y * plane.getRowStride() + x * plane.getPixelStride());
            }
            PlanarYUVLuminanceSource source = new PlanarYUVLuminanceSource(luminance, width, height, 0, 0, width, height, false);
            MultiFormatReader reader = new MultiFormatReader();
            Map<DecodeHintType, Object> hints = new EnumMap<>(DecodeHintType.class);
            hints.put(DecodeHintType.POSSIBLE_FORMATS, Collections.singletonList(BarcodeFormat.QR_CODE));
            hints.put(DecodeHintType.CHARACTER_SET, "UTF-8");
            Result decoded = reader.decode(new BinaryBitmap(new HybridBinarizer(source)), hints);
            String payload = decoded.getText();
            if (!validPayload(payload)) return;
            // Random QR codes do not stop scanning or escape onto the privileged feature surface.
            PairingProtocol.validatePublicPayload(payload);
            activity.runOnUiThread(() -> {
                if (destroyed || generation != current || pending == null) return;
                PluginCall completed = pending;
                String completedId = scanId;
                pending = null;
                release(null);
                JSObject result = new JSObject(); result.put("payload", payload); result.put("scanId", completedId);
                completed.resolve(result);
            });
        } catch (Exception ignored) { /* No QR in this frame; keep the bounded analyzer running. */ }
        finally { image.close(); }
    }

    private void release(String reason) {
        ++generation;
        if (analysis != null) analysis.clearAnalyzer();
        if (provider != null) {
            if (preview != null) provider.unbind(preview);
            if (analysis != null) provider.unbind(analysis);
        }
        preview = null; analysis = null;
        if (container != null && container.getParent() instanceof ViewGroup) ((ViewGroup) container.getParent()).removeView(container);
        container = null;
        PluginCall cancelled = pending;
        pending = null; scanId = null;
        if (cancelled != null && reason != null) cancelled.reject(reason);
    }

    static boolean validPayload(String payload) {
        return payload != null && !payload.trim().isEmpty() && payload.getBytes(StandardCharsets.UTF_8).length <= MAX_PAYLOAD_BYTES;
    }

    private static boolean validBounds(JSONObject bounds) {
        if (bounds == null) return false;
        for (String key : new String[] {"x", "y", "width", "height"}) {
            double value = bounds.optDouble(key, Double.NaN);
            if (Double.isNaN(value) || Double.isInfinite(value) || value < 0 || value > 10000) return false;
            if (("width".equals(key) || "height".equals(key)) && value < 16) return false;
        }
        return true;
    }
}
