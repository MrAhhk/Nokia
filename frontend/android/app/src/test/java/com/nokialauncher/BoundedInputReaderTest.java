package com.nokialauncher;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import org.junit.Test;
import static org.junit.Assert.*;

public class BoundedInputReaderTest {
    @Test public void acceptsExactLimitAndRejectsOversizedData() throws Exception {
        assertArrayEquals(new byte[]{1, 2}, BoundedInputReader.read(new ByteArrayInputStream(new byte[]{1, 2}), 2));
        assertNull(BoundedInputReader.read(new ByteArrayInputStream(new byte[]{1, 2, 3}), 2));
    }
    @Test public void evenAnEndlessProviderIsReadOnlyUpToLimitPlusOne() throws Exception {
        final int[] reads = {0};
        InputStream stream = new InputStream() {
            @Override public int read() { reads[0]++; return 1; }
        };
        assertNull(BoundedInputReader.read(stream, 1024));
        assertEquals(1025, reads[0]);
    }
}
