$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell
Get-ChildItem $desktop -Filter *.lnk | Where-Object { $_.Name -match 'Writer' } | ForEach-Object {
  $s = $shell.CreateShortcut($_.FullName)
  Write-Output ("名称: " + $_.Name)
  Write-Output ("目标: " + $s.TargetPath)
  Write-Output ("目标存在: " + (Test-Path $s.TargetPath))
  Write-Output ("工作目录: " + $s.WorkingDirectory)
  Write-Output ("OneDrive属性: " + $_.Attributes)
  Write-Output "---"
}
