# Built-in Camera Architecture

The built-in camera is a finite, local-first utility inside the existing Nokia launcher shell. The React LCD and reusable keypad remain the interaction layer; CameraX supplies native preview, photo capture, video recording, and media playback.

## Boundaries

- `src/features/camera/` owns the camera state reducer, context-specific keypad commands, screen, gallery, and viewer.
- `src/lib/launcherApps.js` remains the only frontend-to-Android facade.
- `LauncherAppsPlugin.java` contains thin permission and method adapters.
- `camera/BuiltInCameraController.java` owns CameraX, the native LCD surface, capture persistence, catalog, thumbnails, and internal playback.
- `NokiaLauncher.jsx` only opens/closes the feature and delegates keys while Camera is active.

## Key behavior

- Green: local gallery.
- Center or `5`: photo shutter or video start/stop.
- Red or `#`: safe back; active video finalizes before exit.
- Up/down: Photo/Video.
- Left: flash mode.
- Right: lens switch.

## Storage and privacy

- Android 10+: app-created photos and videos use MediaStore under Nokia Launcher folders.
- Android 5.1-9: captures use app-specific external Pictures/Movies folders.
- The internal catalog stores only URIs and metadata for captures made by this app.
- No broad media-library or all-files permission is used.
- Microphone permission is requested only when starting video; denial records muted video.

## Compatibility

CameraX is pinned to 1.4.2 to preserve the app's API 22 minimum. CameraX 1.5.3 video and 1.6.1 require API 23. Quality selection tries 1080p, then HD/SD according to device support.

## Extension points

- Add timer/zoom/resolution actions to `cameraCommands.js` and `cameraState.js`.
- Add native capability and control methods behind `launcherApps.js` without direct Capacitor calls in components.
- Replace the SharedPreferences catalog behind the controller with Room when albums, favorites, edits, or sync justify structured queries.
- Split `BuiltInCameraController` into surface/session/repository services when a second media feature needs them; the public bridge shapes should stay stable.

## Verification floor

Run Jest, the production frontend build, Capacitor sync, Android `assembleDebug`, and physical-device checks for permission, preview placement, photo, video/audio, safe recording finalization, gallery thumbnails, internal playback, background/resume, and absent lens/flash hardware.
