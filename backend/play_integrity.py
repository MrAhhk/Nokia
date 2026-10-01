"""Play Integrity challenge binding, verdict validation, and Google decoding."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from pathlib import Path
from typing import Any, Dict

import requests


PLAY_INTEGRITY_SCOPE = "https://www.googleapis.com/auth/playintegrity"


class IntegrityValidationError(ValueError):
    """The challenge or decoded verdict did not match the protected request."""


class IntegrityConfigurationError(RuntimeError):
    """Required server-side Play Integrity configuration is missing."""


class IntegrityDecodeError(RuntimeError):
    """Google could not decode or verify an integrity token."""


def _b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def create_challenge(
    action: str,
    secret: str,
    *,
    ttl_seconds: int = 300,
    now_ms: int | None = None,
) -> str:
    """Create a short-lived, stateless challenge signed by the backend."""
    if not action or len(action) > 80:
        raise IntegrityValidationError("action must contain 1 to 80 characters")
    if len(secret) < 24:
        raise IntegrityConfigurationError(
            "PLAY_INTEGRITY_CHALLENGE_SECRET must contain at least 24 characters"
        )

    issued_ms = now_ms if now_ms is not None else int(time.time() * 1000)
    claims = {
        "action": action,
        "issuedAtMillis": issued_ms,
        "expiresAtMillis": issued_ms + ttl_seconds * 1000,
        "nonce": secrets.token_urlsafe(18),
    }
    encoded_claims = _b64url_encode(
        json.dumps(claims, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    signature = hmac.new(
        secret.encode("utf-8"), encoded_claims.encode("ascii"), hashlib.sha256
    ).digest()
    return f"{encoded_claims}.{_b64url_encode(signature)}"


def verify_challenge(
    challenge: str, secret: str, *, now_ms: int | None = None
) -> Dict[str, Any]:
    """Verify the challenge signature and expiration and return its claims."""
    if len(secret) < 24:
        raise IntegrityValidationError(
            "challenge secret is not configured securely"
        )

    try:
        encoded_claims, encoded_signature = challenge.split(".", 1)
        supplied_signature = _b64url_decode(encoded_signature)
        expected_signature = hmac.new(
            secret.encode("utf-8"), encoded_claims.encode("ascii"), hashlib.sha256
        ).digest()
        if not hmac.compare_digest(supplied_signature, expected_signature):
            raise IntegrityValidationError("challenge signature is invalid")
        claims = json.loads(_b64url_decode(encoded_claims).decode("utf-8"))
    except IntegrityValidationError:
        raise
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise IntegrityValidationError("challenge format is invalid") from exc

    current_ms = now_ms if now_ms is not None else int(time.time() * 1000)
    if current_ms > int(claims.get("expiresAtMillis", 0)):
        raise IntegrityValidationError("challenge has expired")
    return claims


def build_request_hash(challenge: str) -> str:
    """Bind a standard Play Integrity request to the signed challenge."""
    return _b64url_encode(hashlib.sha256(challenge.encode("utf-8")).digest())


def issue_integrity_challenge(
    action: str,
    *,
    secret: str,
    cloud_project_number: str,
    now_ms: int | None = None,
) -> Dict[str, str]:
    """Return the values needed to prepare and bind a native standard request."""
    project_number = str(cloud_project_number).strip()
    if not project_number.isdigit():
        raise IntegrityConfigurationError(
            "PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER must be numeric"
        )
    challenge = create_challenge(action, secret, now_ms=now_ms)
    return {
        "cloudProjectNumber": project_number,
        "challenge": challenge,
        "requestHash": build_request_hash(challenge),
    }


def parse_integrity_payload(
    payload: Dict[str, Any],
    *,
    expected_package: str,
    expected_request_hash: str,
    now_ms: int | None = None,
    freshness_window_ms: int = 120_000,
) -> Dict[str, Any]:
    """Validate request binding and normalize the requested integrity signals."""
    request_details = payload.get("requestDetails") or {}
    if request_details.get("requestPackageName") != expected_package:
        raise IntegrityValidationError("integrity package name does not match")
    if request_details.get("requestHash") != expected_request_hash:
        raise IntegrityValidationError("integrity request hash does not match")

    try:
        timestamp_ms = int(request_details["timestampMillis"])
    except (KeyError, TypeError, ValueError) as exc:
        raise IntegrityValidationError("integrity timestamp is missing or invalid") from exc

    current_ms = now_ms if now_ms is not None else int(time.time() * 1000)
    age_ms = current_ms - timestamp_ms
    if age_ms > freshness_window_ms or age_ms < -30_000:
        raise IntegrityValidationError("integrity token is outside the freshness window")

    device = payload.get("deviceIntegrity") or {}
    labels = list(device.get("deviceRecognitionVerdict") or [])
    attributes = device.get("deviceAttributes") or {}
    recent_activity = device.get("recentDeviceActivity") or {}
    environment = payload.get("environmentDetails") or {}
    access_risk = environment.get("appAccessRiskVerdict") or {}
    apps_detected_value = access_risk.get("appsDetected")
    apps_detected = list(apps_detected_value or [])
    risk_markers = ("CAPTURING", "CONTROLLING", "OVERLAYS")
    access_risk_detected = (
        None
        if apps_detected_value is None
        else any(any(marker in label for marker in risk_markers) for label in apps_detected)
    )

    return {
        "requestDetails": {
            "actionBound": True,
            "timestampMillis": timestamp_ms,
        },
        "appIntegrity": payload.get("appIntegrity") or {},
        "accountDetails": payload.get("accountDetails") or {},
        "deviceIntegrity": {
            "labels": labels,
            "meetsBasicIntegrity": "MEETS_BASIC_INTEGRITY" in labels,
            "meetsDeviceIntegrity": "MEETS_DEVICE_INTEGRITY" in labels,
            "meetsStrongIntegrity": "MEETS_STRONG_INTEGRITY" in labels,
            "meetsVirtualIntegrity": "MEETS_VIRTUAL_INTEGRITY" in labels,
            "sdkVersion": attributes.get("sdkVersion"),
            "recentDeviceActivityLevel": recent_activity.get("deviceActivityLevel"),
        },
        "environmentDetails": {
            "playProtectVerdict": environment.get(
                "playProtectVerdict", "UNEVALUATED"
            ),
            "appsDetected": apps_detected,
            "accessRiskDetected": access_risk_detected,
        },
    }


def _service_account_credentials():
    try:
        from google.auth.transport.requests import Request as GoogleAuthRequest
        from google.oauth2 import service_account
    except ImportError as exc:
        raise IntegrityConfigurationError(
            "google-auth is required to decode Play Integrity tokens"
        ) from exc

    raw_json = os.environ.get("PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON")
    credentials_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if raw_json:
        info = json.loads(raw_json)
        credentials = service_account.Credentials.from_service_account_info(
            info, scopes=[PLAY_INTEGRITY_SCOPE]
        )
    elif credentials_path:
        credentials = service_account.Credentials.from_service_account_file(
            Path(credentials_path), scopes=[PLAY_INTEGRITY_SCOPE]
        )
    else:
        raise IntegrityConfigurationError(
            "Set PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS"
        )

    credentials.refresh(GoogleAuthRequest())
    return credentials


def decode_integrity_token(integrity_token: str, package_name: str) -> Dict[str, Any]:
    """Ask Google's server to decrypt and verify a standard integrity token."""
    credentials = _service_account_credentials()
    response = requests.post(
        f"https://playintegrity.googleapis.com/v1/{package_name}:decodeIntegrityToken",
        headers={
            "Authorization": f"Bearer {credentials.token}",
            "Content-Type": "application/json",
        },
        json={"integrity_token": integrity_token},
        timeout=20,
    )
    if not response.ok:
        raise IntegrityDecodeError(
            f"Google Play Integrity decode failed with HTTP {response.status_code}"
        )
    body = response.json()
    payload = body.get("tokenPayloadExternal")
    if not isinstance(payload, dict):
        raise IntegrityDecodeError("Google response did not contain tokenPayloadExternal")
    return payload


def verify_integrity_token(
    integrity_token: str,
    challenge: str,
    *,
    secret: str,
    package_name: str,
    decoder=None,
    now_ms: int | None = None,
) -> Dict[str, Any]:
    """Verify a signed challenge, decode its token, and normalize the verdict."""
    claims = verify_challenge(challenge, secret, now_ms=now_ms)
    decode = decoder or decode_integrity_token
    payload = decode(integrity_token, package_name)
    result = parse_integrity_payload(
        payload,
        expected_package=package_name,
        expected_request_hash=build_request_hash(challenge),
        now_ms=now_ms,
    )
    return {"action": claims["action"], **result}
