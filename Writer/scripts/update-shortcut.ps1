# 把桌面上指向 RexVane Writer 的快捷方式更新为最新打包的 exe;没有则创建一个。
$ErrorActionPreference = 'Stop'
$target = 'D:\AIApp\Writer\release\RexVane-Writer-1.2.0-x64.exe'
if (-not (Test-Path $target)) { throw "找不到目标 exe: $target" }

$shell = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$updated = @()

Get-ChildItem $desktop -Filter *.lnk | ForEach-Object {
  $shortcut = $shell.CreateShortcut($_.FullName)
  if ($shortcut.TargetPath -match 'RexVane') {
    Write-Output ("发现: " + $_.Name + " => " + $shortcut.TargetPath)
    $shortcut.TargetPath = $target
    $shortcut.WorkingDirectory = Split-Path $target
    $shortcut.IconLocation = 'D:\AIApp\Writer\assets\icon.ico'
    $shortcut.Save()
    $updated += $_.Name
  }
}

if ($updated.Count -eq 0) {
  $path = Join-Path $desktop 'RexVane Writer.lnk'
  $shortcut = $shell.CreateShortcut($path)
  $shortcut.TargetPath = $target
  $shortcut.WorkingDirectory = Split-Path $target
  $shortcut.IconLocation = 'D:\AIApp\Writer\assets\icon.ico'
  $shortcut.Save()
  Write-Output "桌面没有旧快捷方式，已新建: $path"
} else {
  Write-Output ("已更新: " + ($updated -join ', ') + " -> $target")
}
