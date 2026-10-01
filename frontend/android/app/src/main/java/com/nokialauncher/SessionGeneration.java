package com.nokialauncher;

/** Invalidates callbacks from a replaced or closed native surface. */
public final class SessionGeneration {
    private long generation;
    private boolean closed;
    public synchronized long next() { return ++generation; }
    public synchronized long current() { return generation; }
    public synchronized boolean isCurrent(long token) { return !closed && token == generation; }
    public synchronized void close() { closed = true; generation++; }
    public synchronized boolean isClosed() { return closed; }
}
