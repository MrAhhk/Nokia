package com.nokialauncher;

import static org.junit.Assert.assertEquals;

import java.util.ArrayList;
import java.util.List;
import org.junit.Test;

public class ControlSurfaceCoordinatorTest {
    @Test
    public void notifiesOnceWhenModeActuallyChanges() {
        List<ControlSurfaceMode> observedModes = new ArrayList<>();
        ControlSurfaceCoordinator.Listener listener = observedModes::add;

        ControlSurfaceCoordinator.setMode(ControlSurfaceMode.HIDDEN);
        ControlSurfaceCoordinator.addListener(listener);
        try {
            ControlSurfaceCoordinator.setMode(ControlSurfaceMode.INPUT_TEXT);
            ControlSurfaceCoordinator.setMode(ControlSurfaceMode.INPUT_TEXT);

            assertEquals(1, observedModes.size());
            assertEquals(ControlSurfaceMode.INPUT_TEXT, observedModes.get(0));
            assertEquals(ControlSurfaceMode.INPUT_TEXT, ControlSurfaceCoordinator.getMode());
        } finally {
            ControlSurfaceCoordinator.removeListener(listener);
            ControlSurfaceCoordinator.setMode(ControlSurfaceMode.HIDDEN);
        }
    }
}
