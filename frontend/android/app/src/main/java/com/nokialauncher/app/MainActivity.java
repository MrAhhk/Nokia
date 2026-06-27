package com.nokialauncher.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(LauncherAppsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
