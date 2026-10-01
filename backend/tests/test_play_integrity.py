"""Behavior tests for Play Integrity challenge and verdict handling."""

import pytest

from play_integrity import (
    IntegrityValidationError,
    build_request_hash,
    create_challenge,
    issue_integrity_challenge,
    parse_integrity_payload,
    verify_integrity_token,
    verify_challenge,
)


SECRET = "test-secret-that-is-long-enough-for-hmac"
NOW_MS = 1_787_310_000_000


def test_signed_challenge_round_trip_binds_action_and_request_hash():
    challenge = create_challenge("device-check", SECRET, now_ms=NOW_MS)

    claims = verify_challenge(challenge, SECRET, now_ms=NOW_MS + 1_000)

    assert claims["action"] == "device-check"
    assert build_request_hash(challenge)


def test_expired_challenge_is_rejected():
    challenge = create_challenge(
        "device-check", SECRET, ttl_seconds=60, now_ms=NOW_MS
    )

    with pytest.raises(IntegrityValidationError, match="expired"):
        verify_challenge(challenge, SECRET, now_ms=NOW_MS + 61_000)


def test_verifier_rejects_an_unconfigured_challenge_secret():
    with pytest.raises(IntegrityValidationError, match="secret"):
        verify_challenge("payload.signature", "", now_ms=NOW_MS)


def test_payload_exposes_requested_device_and_environment_verdicts():
    challenge = create_challenge("device-check", SECRET, now_ms=NOW_MS)
    request_hash = build_request_hash(challenge)
    payload = {
        "requestDetails": {
            "requestPackageName": "com.nokialauncher",
            "requestHash": request_hash,
            "timestampMillis": str(NOW_MS),
        },
        "appIntegrity": {"appRecognitionVerdict": "PLAY_RECOGNIZED"},
        "deviceIntegrity": {
            "deviceRecognitionVerdict": [
                "MEETS_BASIC_INTEGRITY",
                "MEETS_DEVICE_INTEGRITY",
                "MEETS_STRONG_INTEGRITY",
            ],
            "deviceAttributes": {"sdkVersion": 36},
            "recentDeviceActivity": {"deviceActivityLevel": "LEVEL_2"},
        },
        "environmentDetails": {
            "playProtectVerdict": "NO_ISSUES",
            "appAccessRiskVerdict": {"appsDetected": ["KNOWN_INSTALLED"]},
        },
    }

    result = parse_integrity_payload(
        payload,
        expected_package="com.nokialauncher",
        expected_request_hash=request_hash,
        now_ms=NOW_MS + 2_000,
    )

    assert result["deviceIntegrity"]["meetsDeviceIntegrity"] is True
    assert result["deviceIntegrity"]["meetsStrongIntegrity"] is True
    assert result["deviceIntegrity"]["sdkVersion"] == 36
    assert result["deviceIntegrity"]["recentDeviceActivityLevel"] == "LEVEL_2"
    assert result["environmentDetails"]["playProtectVerdict"] == "NO_ISSUES"
    assert result["environmentDetails"]["appsDetected"] == ["KNOWN_INSTALLED"]
    assert result["environmentDetails"]["accessRiskDetected"] is False


def test_payload_rejects_mismatched_request_hash():
    payload = {
        "requestDetails": {
            "requestPackageName": "com.nokialauncher",
            "requestHash": "attacker-controlled-hash",
            "timestampMillis": str(NOW_MS),
        }
    }

    with pytest.raises(IntegrityValidationError, match="request hash"):
        parse_integrity_payload(
            payload,
            expected_package="com.nokialauncher",
            expected_request_hash="expected-hash",
            now_ms=NOW_MS,
        )


def test_missing_optional_environment_verdicts_remain_unevaluated():
    payload = {
        "requestDetails": {
            "requestPackageName": "com.nokialauncher",
            "requestHash": "expected-hash",
            "timestampMillis": str(NOW_MS),
        },
        "deviceIntegrity": {},
        "environmentDetails": {"appAccessRiskVerdict": {}},
    }

    result = parse_integrity_payload(
        payload,
        expected_package="com.nokialauncher",
        expected_request_hash="expected-hash",
        now_ms=NOW_MS,
    )

    assert result["deviceIntegrity"]["labels"] == []
    assert result["deviceIntegrity"]["sdkVersion"] is None
    assert result["deviceIntegrity"]["recentDeviceActivityLevel"] is None
    assert result["environmentDetails"]["playProtectVerdict"] == "UNEVALUATED"
    assert result["environmentDetails"]["appsDetected"] == []
    assert result["environmentDetails"]["accessRiskDetected"] is None


def test_issue_challenge_returns_native_preparation_values():
    result = issue_integrity_challenge(
        "settings-integrity-check",
        secret=SECRET,
        cloud_project_number="123456789",
        now_ms=NOW_MS,
    )

    assert result["cloudProjectNumber"] == "123456789"
    assert result["requestHash"] == build_request_hash(result["challenge"])


def test_verify_token_uses_server_decoder_and_signed_challenge():
    issued = issue_integrity_challenge(
        "device-check",
        secret=SECRET,
        cloud_project_number="123456789",
        now_ms=NOW_MS,
    )

    def fake_decoder(token, package_name):
        assert token == "encrypted-token"
        assert package_name == "com.nokialauncher"
        return {
            "requestDetails": {
                "requestPackageName": package_name,
                "requestHash": issued["requestHash"],
                "timestampMillis": str(NOW_MS),
            },
            "deviceIntegrity": {
                "deviceRecognitionVerdict": ["MEETS_DEVICE_INTEGRITY"]
            },
        }

    result = verify_integrity_token(
        "encrypted-token",
        issued["challenge"],
        secret=SECRET,
        package_name="com.nokialauncher",
        decoder=fake_decoder,
        now_ms=NOW_MS + 1_000,
    )

    assert result["action"] == "device-check"
    assert result["deviceIntegrity"]["meetsDeviceIntegrity"] is True
