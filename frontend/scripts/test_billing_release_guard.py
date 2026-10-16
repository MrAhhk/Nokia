"""Exercise the real Gradle release guard without building/publishing a release.

Requires billing.properties to be absent. Never overwrite an owner's setup.
Synthetic public configuration is removed only if its bytes remain ours.
"""
import os
from pathlib import Path
import subprocess


def main():
    android = Path(__file__).resolve().parents[1] / 'android'
    config = android / 'billing.properties'
    if config.exists():
        raise SystemExit('Refusing to replace existing billing.properties.')
    env = os.environ.copy()
    env.setdefault('JAVA_HOME', 'C:/Program Files/Android/Android Studio/jbr')
    env.setdefault('ANDROID_HOME', 'C:/Users/Admin/AppData/Local/Android/Sdk')
    owned = None

    def run(expected, *args):
        result = subprocess.run([str(android / 'gradlew.bat'), *args, '--configuration-cache'],
                                cwd=android, env=env, capture_output=True, text=True)
        if (result.returncode == 0) != expected:
            raise RuntimeError(result.stdout + result.stderr)
        return result.stdout + result.stderr

    try:
        run(True, ':app:verifyBillingReleaseConfiguration')
        print('PASS disabled rollout requires no provider setup')
        owned = b'rolloutEnabled=true\n'
        with config.open('xb') as file:
            file.write(owned)
        output = run(False, ':app:verifyBillingReleaseConfiguration')
        assert 'Enabled release billing configuration is invalid' in output
        print('PASS enabled rollout rejects missing setup')
        owned = (b'rolloutEnabled=true\npublicSdkKey=goog_GuardFixture\n'
                 b'subscriptionProductId=subscription\nmonthlyBasePlanId=monthly\n'
                 b'yearlyBasePlanId=monthly\nlifetimeProductId=lifetime\nofferingId=default\n')
        config.write_bytes(owned)
        output = run(False, ':app:verifyBillingReleaseConfiguration')
        assert 'distinct base plans' in output
        print('PASS enabled rollout rejects duplicate base plans')
        owned = owned.replace(b'yearlyBasePlanId=monthly', b'yearlyBasePlanId=yearly')
        config.write_bytes(owned)
        run(True, ':app:verifyBillingReleaseConfiguration')
        output = run(True, ':app:preReleaseBuild', '--dry-run')
        assert ':app:verifyBillingReleaseConfiguration SKIPPED' in output
        print('PASS valid synthetic setup and release dependency wiring')
    finally:
        if owned is not None and config.exists():
            if config.read_bytes() != owned:
                raise RuntimeError('Configuration changed externally; preserving it.')
            config.unlink()
    print('PASS original absent configuration restored; no release built')


if __name__ == '__main__':
    main()
