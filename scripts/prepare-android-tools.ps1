$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$toolRoot = Join-Path $projectRoot '.tooling'
$ProgressPreference = 'SilentlyContinue'
New-Item -ItemType Directory -Force -Path $toolRoot | Out-Null
$repositoryPath = Join-Path $toolRoot 'android-repository.xml'
if (!(Test-Path -LiteralPath $repositoryPath)) { Invoke-WebRequest -Uri 'https://dl.google.com/android/repository/repository2-1.xml' -OutFile $repositoryPath }
[xml]$repository = Get-Content (Join-Path $toolRoot 'android-repository.xml') -Raw
$wanted = @('platform-35_r02.zip','build-tools_r35_windows.zip','platform-tools_r37.0.1-win.zip')
$archives = $repository.SelectNodes('//*[local-name()="archive"]') | Where-Object { $_.complete.url -in $wanted }
if (@($archives).Count -ne $wanted.Count) { throw 'Pinned SDK archives are missing from the Google repository index. Use Android Studio SDK Manager as described in the Android guide.' }
$tasks = $archives | ForEach-Object { [PSCustomObject]@{ Url=[string]$_.complete.url; Hash=[string]$_.complete.checksum; Destination=$toolRoot } }
$tasks | ForEach-Object -Parallel {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'
  $zip = Join-Path $_.Destination $_.Url
  if (!(Test-Path -LiteralPath $zip) -or (Get-FileHash -LiteralPath $zip -Algorithm SHA1).Hash -ne $_.Hash) {
    Invoke-WebRequest -Uri ('https://dl.google.com/android/repository/' + $_.Url) -OutFile $zip
  }
  if ((Get-FileHash -LiteralPath $zip -Algorithm SHA1).Hash -ne $_.Hash) { throw "Checksum mismatch: $zip" }
  $destination = Join-Path $_.Destination ($_.Url -replace '\.zip$','')
  Expand-Archive -LiteralPath $zip -DestinationPath $destination -Force
  Write-Output "Verified and extracted: $destination"
} -ThrottleLimit 3
