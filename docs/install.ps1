# The cortex Windows installer lives at https://cortex.dev/install.ps1
# This shim keeps old `iwr ... github.io ... | iex` one-liners working.
$ErrorActionPreference = 'Stop'
Invoke-Expression (Invoke-RestMethod -UseBasicParsing https://cortex.dev/install.ps1)
