package com.nokialauncher;

import static org.junit.Assert.assertEquals;

import android.text.InputType;
import org.junit.Test;

public class EditorContextClassifierTest {
    @Test
    public void classifiesTextAndNumericEditors() {
        assertEquals(
                ControlSurfaceMode.INPUT_TEXT,
                EditorContextClassifier.classify(InputType.TYPE_CLASS_TEXT));
        assertEquals(
                ControlSurfaceMode.INPUT_NUMBER,
                EditorContextClassifier.classify(InputType.TYPE_CLASS_NUMBER));
        assertEquals(
                ControlSurfaceMode.INPUT_NUMBER,
                EditorContextClassifier.classify(InputType.TYPE_CLASS_PHONE));
        assertEquals(
                ControlSurfaceMode.INPUT_NUMBER,
                EditorContextClassifier.classify(InputType.TYPE_CLASS_DATETIME));
    }

    @Test
    public void classifiesPasswordEditorsAsSecure() {
        assertEquals(
                ControlSurfaceMode.SECURE,
                EditorContextClassifier.classify(
                        InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD));
        assertEquals(
                ControlSurfaceMode.SECURE,
                EditorContextClassifier.classify(
                        InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD));
        assertEquals(
                ControlSurfaceMode.SECURE,
                EditorContextClassifier.classify(
                        InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD));
        assertEquals(
                ControlSurfaceMode.SECURE,
                EditorContextClassifier.classify(
                        InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD));
    }

    @Test
    public void rejectsNullAndUnknownInputClasses() {
        assertEquals(ControlSurfaceMode.UNSUPPORTED, EditorContextClassifier.classify(0));
        assertEquals(ControlSurfaceMode.UNSUPPORTED, EditorContextClassifier.classify(0x0f));
    }
}
