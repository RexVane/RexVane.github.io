# 把桌面上 Blog Writer 的快捷方式更新为 release 目录里最新打包的 exe;没有则创建一个。
$ErrorActionPreference = 'Stop'
$releaseDir = 'D:\AIApp\Writer\release'
$latest = Get-ChildItem $releaseDir -Filter *.exe | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $latest) { throw "release 目录里没有 exe: $releaseDir" }
$target = $latest.FullName

$shell = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$linkPath = Join-Path $desktop 'Blog Writer.lnk'
$updated = @()

Get-ChildItem $desktop -Filter *.lnk | ForEach-Object {
  $shortcut = $shell.CreateShortcut($_.FullName)
  if ($shortcut.TargetPath -like "$releaseDir*" -or $shortcut.TargetPath -match 'RexVane|Blog-Writer') {
    $shortcut.TargetPath = $target
    $shortcut.WorkingDirectory = Split-Path $target
    $shortcut.IconLocation = 'D:\AIApp\Writer\assets\icon.ico'
    $shortcut.Save()
    if ($_.FullName -ne $linkPath) {
      Move-Item -Force $_.FullName $linkPath
    }
    $updated += $_.Name
  }
}

if ($updated.Count -eq 0) {
  $shortcut = $shell.CreateShortcut($linkPath)
  $shortcut.TargetPath = $target
  $shortcut.WorkingDirectory = Split-Path $target
  $shortcut.IconLocation = 'D:\AIApp\Writer\assets\icon.ico'
  $shortcut.Save()
  Write-Output "已新建快捷方式: $linkPath -> $target"
} else {
  Write-Output "已更新快捷方式 -> $target"
}
