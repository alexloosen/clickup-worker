param([ValidateSet('protect','unprotect')][string]$Mode)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
try {
  $payload = [Console]::In.ReadToEnd()
  if ($Mode -eq 'protect') {
    $raw = [Text.Encoding]::UTF8.GetBytes($payload)
    $encrypted = [Security.Cryptography.ProtectedData]::Protect($raw, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    [Console]::Out.Write([Convert]::ToBase64String($encrypted))
  } else {
    $encrypted = [Convert]::FromBase64String($payload)
    $raw = [Security.Cryptography.ProtectedData]::Unprotect($encrypted, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    [Console]::Out.Write([Text.Encoding]::UTF8.GetString($raw))
  }
} catch { [Console]::Error.Write('Windows credential protection failed.'); exit 1 }

