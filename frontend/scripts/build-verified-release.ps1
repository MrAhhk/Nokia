param(
    [string]$JavaHome = $env:JAVA_HOME,
    [string]$AndroidHome = $env:ANDROID_HOME
)

$ErrorActionPreference = 'Stop'
$frontendRoot = Split-Path $PSScriptRoot -Parent
$androidRoot = Join-Path $frontendRoot 'android'
if (-not $JavaHome) { $JavaHome = 'C:/Program Files/Android/Android Studio/jbr' }
if (-not $AndroidHome) { $AndroidHome = Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
if (-not (Test-Path -LiteralPath (Join-Path $JavaHome 'bin/java.exe'))) {
    throw 'Set JAVA_HOME or pass -JavaHome for the Android build JDK.'
}
if (-not (Test-Path -LiteralPath $AndroidHome)) {
    throw 'Set ANDROID_HOME or pass -AndroidHome for the Android SDK.'
}

$previousJava = $env:JAVA_HOME
$previousAndroid = $env:ANDROID_HOME
$env:JAVA_HOME = $JavaHome
$env:ANDROID_HOME = $AndroidHome
Push-Location $frontendRoot
try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend production build failed.' }
    & npx.cmd --no-install cap copy android
    if ($LASTEXITCODE -ne 0) { throw 'Capacitor copy failed.' }
    Push-Location $androidRoot
    try {
        # The old release contained a partial project DEX after package changes.
        # Release builds must not reuse those intermediate outputs.
        & .\gradlew.bat :app:clean :app:assembleRelease :app:bundleRelease --no-build-cache --rerun-tasks --no-daemon
        if ($LASTEXITCODE -ne 0) { throw 'Android release build failed.' }
    } finally { Pop-Location }
    $bundle = Join-Path $androidRoot 'app/build/outputs/bundle/release/app-release.aab'
    & python (Join-Path $PSScriptRoot 'verify_android_components.py') --artifact $bundle
    if ($LASTEXITCODE -ne 0) { throw 'Release rejected: manifest/DEX component verification failed.' }
    Write-Output "Verified component packaging: $bundle"
    Write-Output 'Before Play upload, verify versionCode, signing, tests and device acceptance. This command does not publish.'
} finally {
    Pop-Location
    $env:JAVA_HOME = $previousJava
    $env:ANDROID_HOME = $previousAndroid
}
