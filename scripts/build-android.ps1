$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$toolRoot = Join-Path $projectRoot '.tooling'
$buildTools = Join-Path $toolRoot 'build-tools_r35_windows/android-15'
$sourceAndroidJar = Join-Path $toolRoot 'platform-35_r02/android-35/android.jar'
$javaRoot = if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin' } else { Split-Path (Get-Command javac -ErrorAction Stop).Source -Parent }
$sourceMain = Join-Path $projectRoot 'android/app/src/main'
$build = Join-Path $env:TEMP ('xinzai-android-build-' + [guid]::NewGuid().ToString('N'))
$main = Join-Path $build 'main'
$androidJar = Join-Path $build 'android.jar'
$webAssets = Join-Path $sourceMain 'assets/www'
foreach ($required in @($sourceAndroidJar,(Join-Path $buildTools 'aapt2.exe'),(Join-Path $javaRoot 'javac.exe'))) {
    if (!(Test-Path -LiteralPath $required)) { throw "Missing build dependency: $required. See docs/安卓迁移与安装说明.md" }
}
New-Item -ItemType Directory -Force -Path $build,$main,(Join-Path $build 'gen'),(Join-Path $build 'classes'),(Join-Path $build 'dex'),$webAssets | Out-Null
foreach ($name in @('index.html','app.js','styles.css','native.js','mobile.js','mobile.css')) { Copy-Item -LiteralPath (Join-Path $projectRoot $name) -Destination $webAssets -Force }
Copy-Item -LiteralPath (Join-Path $projectRoot 'assets') -Destination $webAssets -Recurse -Force
Get-ChildItem -LiteralPath $sourceMain | Copy-Item -Destination $main -Recurse -Force
Copy-Item -LiteralPath $sourceAndroidJar -Destination $androidJar -Force
function Run-Tool { param([string]$Executable,[string[]]$Arguments) & $Executable @Arguments; if ($LASTEXITCODE -ne 0) { throw "Build command failed: $Executable ($LASTEXITCODE)" } }
Run-Tool (Join-Path $buildTools 'aapt2.exe') @('compile','--dir',(Join-Path $main 'res'),'-o',(Join-Path $build 'resources.zip'))
Run-Tool (Join-Path $buildTools 'aapt2.exe') @('link','-o',(Join-Path $build 'unsigned.apk'),'--manifest',(Join-Path $main 'AndroidManifest.xml'),'-I',$androidJar,'--java',(Join-Path $build 'gen'),'--auto-add-overlay','--debug-mode',(Join-Path $build 'resources.zip'))
$sources = @(Get-ChildItem (Join-Path $main 'java'),(Join-Path $build 'gen') -Filter '*.java' -Recurse | ForEach-Object { $_.FullName })
Run-Tool (Join-Path $javaRoot 'javac.exe') (@('-encoding','UTF-8','--release','8','-classpath',$androidJar,'-d',(Join-Path $build 'classes')) + $sources)
Run-Tool (Join-Path $javaRoot 'jar.exe') @('cf',(Join-Path $build 'classes.jar'),'-C',(Join-Path $build 'classes'),'.')
Run-Tool (Join-Path $javaRoot 'java.exe') @('-cp',(Join-Path $buildTools 'lib/d8.jar'),'com.android.tools.r8.D8','--lib',$androidJar,'--min-api','26','--output',(Join-Path $build 'dex'),(Join-Path $build 'classes.jar'))
Run-Tool (Join-Path $javaRoot 'jar.exe') @('uf',(Join-Path $build 'unsigned.apk'),'-C',(Join-Path $build 'dex'),'classes.dex')
Run-Tool (Join-Path $javaRoot 'jar.exe') @('uf',(Join-Path $build 'unsigned.apk'),'-C',$main,'assets')
Run-Tool (Join-Path $buildTools 'zipalign.exe') @('-f','-p','4',(Join-Path $build 'unsigned.apk'),(Join-Path $build 'aligned.apk'))
$key = Join-Path $toolRoot 'xinzai-debug.keystore'
if (!(Test-Path -LiteralPath $key)) { Run-Tool (Join-Path $javaRoot 'keytool.exe') @('-genkeypair','-keystore',$key,'-storepass','android','-keypass','android','-alias','androiddebugkey','-dname','CN=XinZai Development,O=XinZai,C=CN','-keyalg','RSA','-keysize','2048','-validity','10000') }
$apk = Join-Path $build 'xinzai-0.2.0-debug.apk'
Run-Tool (Join-Path $javaRoot 'java.exe') @('-jar',(Join-Path $buildTools 'lib/apksigner.jar'),'sign','--ks',$key,'--ks-key-alias','androiddebugkey','--ks-pass','pass:android','--key-pass','pass:android','--out',$apk,(Join-Path $build 'aligned.apk'))
Run-Tool (Join-Path $javaRoot 'java.exe') @('-jar',(Join-Path $buildTools 'lib/apksigner.jar'),'verify','--verbose',$apk)
Run-Tool (Join-Path $buildTools 'zipalign.exe') @('-c','-p','4',$apk)
Get-FileHash -LiteralPath $apk -Algorithm SHA256 | Format-List
$deliveredApk = Join-Path $projectRoot 'output/android/心仔-0.2.0-debug.apk'
New-Item -ItemType Directory -Force -Path (Split-Path $deliveredApk -Parent) | Out-Null
Copy-Item -LiteralPath $apk -Destination $deliveredApk -Force
Write-Output "Android APK: $deliveredApk"
