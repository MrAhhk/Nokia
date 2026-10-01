package com.nokialauncher.camera;

final class BitmapDecodePolicy {
    static int sampleSize(int width, int height, int targetEdge) {
        int edge = Math.max(width, height);
        int target = Math.max(1, targetEdge);
        int sample = 1;
        while (edge / sample / 2 >= target && sample <= (1 << 29)) sample *= 2;
        return sample;
    }
}
