$ErrorActionPreference = 'Stop'
$taskLog = 'C:\Users\jones\Documents\game-race\verification\environment\desktop-restart.log'
$taskExecutable = 'C:\Program Files\WindowsApps\OpenAI.Codex_26.901.6511.0_x64__2p2nqsd0c76g0\app\ChatGPT.exe'
$taskProcessId = 11008
function Write-RestartLog([string]$message) {
    Add-Content -LiteralPath $taskLog -Value (('{0:o} {1}' -f (Get-Date), $message))
}
try {
    if (-not (Test-Path -LiteralPath $taskExecutable -PathType Leaf)) { throw 'Verified application executable is no longer available.' }
    Write-RestartLog 'Restart helper started; waiting 20 seconds for the current response to finish.'
    Start-Sleep -Seconds 20
    $taskProcess = Get-Process -Id $taskProcessId -ErrorAction SilentlyContinue
    if ($null -ne $taskProcess) {
        if ($taskProcess.Path -ne $taskExecutable) { throw 'Process identity changed; refusing to stop a different application.' }
        Write-RestartLog 'Requesting application window close.'
        $null = $taskProcess.CloseMainWindow()
        if (-not $taskProcess.WaitForExit(10000)) {
            Write-RestartLog 'Application still running; stopping only the verified ChatGPT Desktop main process.'
            Stop-Process -Id $taskProcessId -ErrorAction Stop
            $taskProcess.WaitForExit()
        }
    }
    Start-Sleep -Seconds 3
    Write-RestartLog 'Launching the verified installed desktop application.'
    Start-Process -FilePath $taskExecutable
    Start-Sleep -Seconds 12
    $taskNewProcesses = @(Get-Process -Name ChatGPT -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $taskExecutable })
    if ($taskNewProcesses.Count -eq 0) { throw 'Application launch was requested but no matching running process was observed.' }
    Write-RestartLog ('Application process observed. PIDs: ' + ($taskNewProcesses.Id -join ', ') + '. Task restoration and browser runtime recovery still require verification.')
} catch {
    Write-RestartLog ('FAILED: ' + $_.Exception.Message)
    exit 1
}
