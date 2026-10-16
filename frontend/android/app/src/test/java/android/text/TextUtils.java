package android.text;

/** JVM fixture substrate for Play ProductDetails' real JSON constructor.
 * Implements the Android isEmpty contract only. Test sources never enter the APK;
 * no global returnDefaultValues setting or mocked Play/RevenueCat models is used.
 */
public final class TextUtils {
    private TextUtils() {}
    public static boolean isEmpty(CharSequence value) { return value == null || value.length() == 0; }
}
