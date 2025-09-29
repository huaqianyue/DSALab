$WITH_MINGW = $false;
$WITH_CLANGD = $true;

$GENERATE_ANON_WS = $true;

$MINGW_VERSION = "11.2.0";
$MINGW_REV = "1"
$CLANGD_VERSION = "12.0.0";

$DEFAULT_COMPILE_FLAGS = @(
  "-xc++",
  "--target=x86_64-pc-windows-gnu",
  "-std=c++20",
  "-g"
);

# parse argv
foreach ($arg in $args) {
  if ($arg -eq "--mingw") {
    $WITH_MINGW = $true;
  }
  if ($arg -eq "--no-mingw") {
    $WITH_MINGW = $false;
  }
  if ($arg -eq "--clangd") {
    $WITH_CLANGD = $true;
  }
  if ($arg -eq "--no-clangd") {
    $WITH_CLANGD = $false;
  }
  if ($arg -eq "--anon-ws") {
    $GENERATE_ANON_WS = $true;
  }
  if ($arg -eq "--no-anon-ws") {
    $GENERATE_ANON_WS = $false;
  }
}

Import-Module BitsTransfer;

if ($WITH_MINGW || $WITH_CLANGD) {
  $env:Path += ";C:\\Program Files\\7-zip";
  Get-Command "7z" -ErrorAction SilentlyContinue;
  if (!$?) {
    Write-Error "7z is not installed. Install 7-zip from 7-zip.org. You may need to add it to Path environment variable.";
  }
}

if ($WITH_MINGW) {
  if ($MINGW_REV -ne "0") { $DASH_REV = "-r$MINGW_REV"; $US_REV = "_r$MINGW_REV" }
  Start-BitsTransfer -Source "https://github.com/Guyutongxue/mingw-release/releases/download/v$MINGW_VERSION$DASH_REV/gytx_x86_64-$MINGW_VERSION-posix-seh$US_REV.7z" -Destination "mingw.7z";
  7z x -y mingw.7z
  Remove-Item -Path "mingw.7z";
  Remove-Variable -Name DASH_REV, US_REV;
}
if ($WITH_CLANGD) {
  Start-BitsTransfer -Source "https://github.com/clangd/clangd/releases/download/$CLANGD_VERSION/clangd-windows-$CLANGD_VERSION.zip" -Destination "clangd.zip";
  7z x -y clangd.zip
  Rename-Item -Path "clangd_$CLANGD_VERSION" -NewName "clangd";
  Remove-Item -Path "clangd.zip";
}
if ($GENERATE_ANON_WS) {
  Remove-Item -Path "anon_workspace" -Recurse;
  New-Item -Path "anon_workspace" -ItemType Directory | Out-Null;
  New-Item -Path "anon_workspace/compile_flags.txt" | Out-Null;
  $DEFAULT_COMPILE_FLAGS -join "`r`n" | Out-File "anon_workspace/compile_flags.txt";
}
