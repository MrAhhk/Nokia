package com.nokialauncher;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(LauncherAppsPlugin.class);
        sanitizeIntent(getIntent());
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        sanitizeIntent(intent);
        super.onNewIntent(intent);
    }

    private void sanitizeIntent(Intent intent) {
        if (intent != null && intent.getData() != null) {
            String dataString = intent.getData().toString();
            if (dataString.contains("view=keyboard")) {
                String cleanUrl = dataString.replace("view=keyboard", "view=launcher");
                intent.setData(Uri.parse(cleanUrl));
            }
        }
    }
}
