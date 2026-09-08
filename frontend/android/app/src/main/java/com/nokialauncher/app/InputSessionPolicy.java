package com.nokialauncher;

/** Keeps costly IME window/composer work out of editor restart callbacks. */
final class InputSessionPolicy {
    private InputSessionPolicy() {}

    static boolean shouldRequestShow(boolean restarting, NokiaIME.IMEState state) {
        return !restarting && state == NokiaIME.IMEState.ACTIVE;
    }

    static boolean shouldResetComposer(boolean restarting, NokiaIME.IMEState state) {
        return !restarting && state == NokiaIME.IMEState.ACTIVE;
    }

    /**
     * Calculates the top boundary of the keyboard within the window decor.
     * Content above this coordinate remains fully visible and interactable for the target app.
     * Crucially, this must never return 0 when the keyboard is active, as 0 informs
     * the system that 100% of the screen is obscured, causing target apps to enter an
     * infinite auto-scroll layout loop and freezing the device.
     */
    static int computeTopInsets(int decorHeight, int inputAreaHeight, int fallbackVisibleTop) {
        if (inputAreaHeight > 0 && decorHeight > 0) {
            return Math.max(0, decorHeight - inputAreaHeight);
        }
        return Math.max(0, fallbackVisibleTop);
    }
}
