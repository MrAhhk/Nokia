package com.nokialauncher;

import java.util.Set;
import java.util.concurrent.CopyOnWriteArraySet;

public final class ControlSurfaceCoordinator {
    public interface Listener {
        void onControlSurfaceModeChanged(ControlSurfaceMode mode);
    }

    private static final Set<Listener> listeners = new CopyOnWriteArraySet<>();
    private static volatile ControlSurfaceMode mode = ControlSurfaceMode.HIDDEN;

    private ControlSurfaceCoordinator() {}

    public static ControlSurfaceMode getMode() {
        return mode;
    }

    public static synchronized void setMode(ControlSurfaceMode next) {
        if (next == null || next == mode) {
            return;
        }

        mode = next;
        for (Listener listener : listeners) {
            listener.onControlSurfaceModeChanged(next);
        }
    }

    public static void addListener(Listener listener) {
        if (listener != null) {
            listeners.add(listener);
        }
    }

    public static void removeListener(Listener listener) {
        listeners.remove(listener);
    }
}
