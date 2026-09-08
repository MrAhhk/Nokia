package com.nokialauncher;

import android.text.InputType;

public final class EditorContextClassifier {
    private EditorContextClassifier() {}

    public static ControlSurfaceMode classify(int inputType) {
        int inputClass = inputType & InputType.TYPE_MASK_CLASS;
        int variation = inputType & InputType.TYPE_MASK_VARIATION;

        if (isSecure(inputClass, variation)) {
            return ControlSurfaceMode.SECURE;
        }

        if (inputClass == InputType.TYPE_CLASS_NUMBER
                || inputClass == InputType.TYPE_CLASS_PHONE
                || inputClass == InputType.TYPE_CLASS_DATETIME) {
            return ControlSurfaceMode.INPUT_NUMBER;
        }

        if (inputClass == InputType.TYPE_CLASS_TEXT) {
            return ControlSurfaceMode.INPUT_TEXT;
        }

        return ControlSurfaceMode.UNSUPPORTED;
    }

    private static boolean isSecure(int inputClass, int variation) {
        if (inputClass == InputType.TYPE_CLASS_NUMBER) {
            return variation == InputType.TYPE_NUMBER_VARIATION_PASSWORD;
        }

        if (inputClass != InputType.TYPE_CLASS_TEXT) {
            return false;
        }

        return variation == InputType.TYPE_TEXT_VARIATION_PASSWORD
                || variation == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD
                || variation == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD;
    }
}
