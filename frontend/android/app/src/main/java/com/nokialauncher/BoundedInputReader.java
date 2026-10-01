package com.nokialauncher;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;

final class BoundedInputReader {
    static byte[] read(InputStream stream, int limit) throws IOException {
        if (stream == null) return null;
        if (limit < 0) throw new IllegalArgumentException("negative limit");
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int remaining = limit;
        while (remaining > 0) {
            int count = stream.read(buffer, 0, Math.min(buffer.length, remaining));
            if (count < 0) return output.toByteArray();
            if (count == 0) {
                int next = stream.read();
                if (next < 0) return output.toByteArray();
                output.write(next);
                remaining--;
            } else {
                output.write(buffer, 0, count);
                remaining -= count;
            }
        }
        return stream.read() == -1 ? output.toByteArray() : null;
    }
}
