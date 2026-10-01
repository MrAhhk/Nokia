package com.nokialauncher;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.integrity.IntegrityManagerFactory;
import com.google.android.play.core.integrity.StandardIntegrityException;
import com.google.android.play.core.integrity.StandardIntegrityManager;
import com.google.android.play.core.integrity.model.StandardIntegrityErrorCode;

import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "PlayIntegrity")
public class PlayIntegrityPlugin extends Plugin {
    private StandardIntegrityManager integrityManager;
    private StandardIntegrityManager.StandardIntegrityTokenProvider tokenProvider;
    private long preparedProjectNumber = -1L;

    @PluginMethod
    public void prepare(PluginCall call) {
        String projectNumberValue = call.getString("cloudProjectNumber");
        if (projectNumberValue == null || projectNumberValue.trim().isEmpty()) {
            call.reject("cloudProjectNumber is required");
            return;
        }

        final long cloudProjectNumber;
        try {
            cloudProjectNumber = Long.parseLong(projectNumberValue);
        } catch (NumberFormatException exception) {
            call.reject("cloudProjectNumber must be numeric", exception);
            return;
        }

        if (tokenProvider != null && preparedProjectNumber == cloudProjectNumber) {
            JSObject result = new JSObject();
            result.put("prepared", true);
            call.resolve(result);
            return;
        }

        integrityManager = IntegrityManagerFactory.createStandard(
            getContext().getApplicationContext()
        );
        integrityManager
            .prepareIntegrityToken(
                StandardIntegrityManager.PrepareIntegrityTokenRequest.builder()
                    .setCloudProjectNumber(cloudProjectNumber)
                    .build()
            )
            .addOnSuccessListener(provider -> {
                tokenProvider = provider;
                preparedProjectNumber = cloudProjectNumber;
                JSObject result = new JSObject();
                result.put("prepared", true);
                call.resolve(result);
            })
            .addOnFailureListener(exception -> rejectIntegrityCall(
                call,
                "Unable to prepare Play Integrity",
                exception
            ));
    }

    @PluginMethod
    public void requestToken(PluginCall call) {
        if (tokenProvider == null) {
            call.reject("Play Integrity is not prepared");
            return;
        }

        String requestHash = call.getString("requestHash");
        if (requestHash == null || requestHash.trim().isEmpty()) {
            call.reject("requestHash is required");
            return;
        }
        if (requestHash.getBytes(StandardCharsets.UTF_8).length > 500) {
            call.reject("requestHash exceeds the 500-byte Play Integrity limit");
            return;
        }

        tokenProvider
            .request(
                StandardIntegrityManager.StandardIntegrityTokenRequest.builder()
                    .setRequestHash(requestHash)
                    .build()
            )
            .addOnSuccessListener(response -> {
                JSObject result = new JSObject();
                result.put("token", response.token());
                call.resolve(result);
            })
            .addOnFailureListener(exception -> {
                if (
                    exception instanceof StandardIntegrityException &&
                    ((StandardIntegrityException) exception).getErrorCode() ==
                        StandardIntegrityErrorCode.INTEGRITY_TOKEN_PROVIDER_INVALID
                ) {
                    tokenProvider = null;
                    preparedProjectNumber = -1L;
                }
                rejectIntegrityCall(call, "Unable to request Play Integrity token", exception);
            });
    }

    private void rejectIntegrityCall(
        PluginCall call,
        String message,
        Exception exception
    ) {
        if (exception instanceof StandardIntegrityException) {
            String code = Integer.toString(
                ((StandardIntegrityException) exception).getErrorCode()
            );
            call.reject(message, code, exception);
            return;
        }
        call.reject(message, exception);
    }
}
