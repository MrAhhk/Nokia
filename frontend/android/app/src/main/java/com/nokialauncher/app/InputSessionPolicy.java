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
}
