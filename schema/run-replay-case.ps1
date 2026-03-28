param(
  [Parameter(Mandatory = $true)]
  [string]$CaseId,

  [string]$BaseUrl = $(if ($env:ENOVA_BASE_URL) { $env:ENOVA_BASE_URL } else { "http://127.0.0.1:8787" }),

  [string]$AdminKey = $env:ENOVA_ADMIN_KEY,

  [string]$CasesFile = "$PSScriptRoot/replay_cases.json"
)

$ErrorActionPreference = "Stop"

function Exit-WithError {
  param(
    [string]$Message,
    [int]$Code = 1
  )
  Write-Output "error=$Message"
  exit $Code
}

function As-Bool {
  param($Value)
  if ($null -eq $Value) { return $null }
  if ($Value -is [bool]) { return $Value }
  if ($Value -is [string]) {
    if ($Value -eq "true") { return $true }
    if ($Value -eq "false") { return $false }
  }
  return [bool]$Value
}

function Has-Prop {
  param($Obj, [string]$Name)
  return $null -ne $Obj -and ($Obj.PSObject.Properties.Name -contains $Name)
}

function Has-Value {
  param($Obj, [string]$Name)
  if (-not (Has-Prop $Obj $Name)) { return $false }
  $val = $Obj.$Name
  if ($null -eq $val) { return $false }
  if ($val -is [string]) { return $val.Trim().Length -gt 0 }
  if ($val -is [array]) { return $val.Count -gt 0 }
  return $true
}

function To-JsonShort {
  param($Value)
  if ($null -eq $Value) { return "null" }
  $json = $Value | ConvertTo-Json -Depth 12 -Compress
  if ($json.Length -gt 260) { return $json.Substring(0, 260) + "..." }
  return $json
}

function Get-ResultsFailedIndex {
  param($Body)
  if (Has-Value $Body "failed_index") { return [int]$Body.failed_index }
  if (Has-Value $Body "results") {
    for ($i = 0; $i -lt $Body.results.Count; $i++) {
      $okValue = As-Bool $Body.results[$i].ok
      if ($okValue -eq $false) { return $i }
    }
  }
  return $null
}

function Get-Reason {
  param($Body)
  if (Has-Value $Body "reason") { return [string]$Body.reason }
  if (Has-Value $Body "error") { return [string]$Body.error }
  if (Has-Prop $Body "result") {
    if (Has-Value $Body.result "reason") { return [string]$Body.result.reason }
    if (Has-Value $Body.result "error") { return [string]$Body.result.error }
  }
  if (Has-Value $Body "results") {
    $failed = $Body.results | Where-Object { (As-Bool $_.ok) -eq $false } | Select-Object -First 1
    if ($null -ne $failed) {
      if (Has-Value $failed "reason") { return [string]$failed.reason }
      if (Has-Value $failed "error") { return [string]$failed.error }
    }
  }
  return ""
}

function Get-ResultSummary {
  param($Body)
  if (Has-Prop $Body "result") {
    $summary = [ordered]@{}
    if (Has-Prop $Body.result "ok") { $summary.ok = $Body.result.ok }
    if (Has-Prop $Body.result "reason") { $summary.reason = $Body.result.reason }
    if (Has-Prop $Body.result "error") { $summary.error = $Body.result.error }
    if (Has-Prop $Body.result "stage_before") { $summary.stage_before = $Body.result.stage_before }
    if (Has-Prop $Body.result "stage_after") { $summary.stage_after = $Body.result.stage_after }
    return To-JsonShort $summary
  }

  if (Has-Value $Body "results") {
    $items = @()
    $limit = [Math]::Min($Body.results.Count, 3)
    for ($i = 0; $i -lt $limit; $i++) {
      $it = $Body.results[$i]
      $compact = [ordered]@{ index = $it.index; ok = $it.ok }
      if (Has-Value $it "reason") { $compact.reason = $it.reason }
      if (Has-Value $it "error") { $compact.error = $it.error }
      if ((Has-Prop $it "lookup") -and (Has-Value $it.lookup "strategy")) { $compact.lookup = $it.lookup.strategy }
      $items += [pscustomobject]$compact
    }
    return To-JsonShort ([ordered]@{ count = $Body.results.Count; sample = $items })
  }

  return "null"
}

function Assert-CaseGovernance {
  param($Case)

  if (-not (Has-Value $Case "status")) {
    Exit-WithError "case '$($Case.case_id)' sem status" 3
  }

  $allowed = @("validated", "regression", "investigating", "expected_failure")
  if ($allowed -notcontains [string]$Case.status) {
    Exit-WithError "status inválido '$($Case.status)' no case '$($Case.case_id)'" 3
  }

  if (-not (Has-Value $Case "mode")) {
    Exit-WithError "case '$($Case.case_id)' sem mode" 3
  }

  $mode = [string]$Case.mode
  if (@("replay_id", "replay_ids", "events") -notcontains $mode) {
    Exit-WithError "mode inválido '$mode' no case '$($Case.case_id)'" 3
  }

  if ($mode -eq "replay_id" -and -not (Has-Value $Case "replay_id")) {
    Exit-WithError "case '$($Case.case_id)' com mode replay_id sem replay_id" 3
  }

  if ($mode -eq "replay_ids" -and -not (Has-Value $Case "replay_ids")) {
    Exit-WithError "case '$($Case.case_id)' com mode replay_ids sem replay_ids" 3
  }

  if ($mode -eq "events" -and -not (Has-Value $Case "events")) {
    Exit-WithError "case '$($Case.case_id)' com mode events sem events" 3
  }

  if (([string]$Case.status -in @("validated", "regression")) -and -not (Has-Value $Case "expected")) {
    Exit-WithError "case '$($Case.case_id)' com status $($Case.status) sem expected" 3
  }

  if (([string]$Case.status -eq "expected_failure")) {
    if (-not (Has-Value $Case "expected")) {
      Exit-WithError "case '$($Case.case_id)' expected_failure sem expected" 3
    }
    $hasReason = Has-Value $Case.expected "reason_contains"
    $hasError = Has-Value $Case.expected "error_contains"
    if (-not $hasReason -and -not $hasError) {
      Exit-WithError "case '$($Case.case_id)' expected_failure sem reason/error esperado" 3
    }
  }
}

function Assert-Expectation {
  param($Case, $Body, [bool]$ComputedOk, $FailedIndex, [string]$Reason)

  if (-not (Has-Value $Case "expected")) {
    return
  }

  $exp = $Case.expected

  if (Has-Prop $exp "ok") {
    $expOk = As-Bool $exp.ok
    if ($expOk -ne $ComputedOk) {
      Exit-WithError "expectation mismatch: expected.ok=$expOk actual.ok=$ComputedOk" 4
    }
  }

  if (Has-Prop $exp "failed_index") {
    if ($null -eq $exp.failed_index) {
      if ($null -ne $FailedIndex) {
        Exit-WithError "expectation mismatch: expected.failed_index=null actual.failed_index=$FailedIndex" 4
      }
    } elseif ([int]$exp.failed_index -ne $FailedIndex) {
      Exit-WithError "expectation mismatch: expected.failed_index=$([int]$exp.failed_index) actual.failed_index=$FailedIndex" 4
    }
  }

  if (Has-Value $exp "reason_contains") {
    $needle = [string]$exp.reason_contains
    if (-not ($Reason -like "*$needle*")) {
      Exit-WithError "expectation mismatch: reason não contém '$needle'" 4
    }
  }

  if (Has-Value $exp "error_contains") {
    $needle = [string]$exp.error_contains
    if (-not ($Reason -like "*$needle*")) {
      Exit-WithError "expectation mismatch: error não contém '$needle'" 4
    }
  }

  if (Has-Value $exp "lookup_strategy") {
    $target = [string]$exp.lookup_strategy
    $strategy = ""
    if (Has-Value $Body "results") {
      $first = $Body.results | Select-Object -First 1
      if (($null -ne $first) -and (Has-Prop $first "lookup") -and (Has-Value $first.lookup "strategy")) {
        $strategy = [string]$first.lookup.strategy
      }
    }
    if ($strategy -ne $target) {
      Exit-WithError "expectation mismatch: lookup_strategy esperado '$target' atual '$strategy'" 4
    }
  }

  if (Has-Prop $exp "restored") {
    $expRestored = As-Bool $exp.restored
    $actualRestored = if (Has-Prop $Body "restored") { As-Bool $Body.restored } else { $null }
    if ($actualRestored -ne $expRestored) {
      Exit-WithError "expectation mismatch: restored esperado '$expRestored' atual '$actualRestored'" 4
    }
  }
}

if (-not (Test-Path -LiteralPath $CasesFile)) {
  Exit-WithError "arquivo de casos não encontrado: $CasesFile" 2
}

$casesDoc = Get-Content -LiteralPath $CasesFile -Raw | ConvertFrom-Json -Depth 100
if ($null -eq $casesDoc -or -not (Has-Value $casesDoc "cases")) {
  Exit-WithError "arquivo de casos inválido: propriedade 'cases' ausente" 2
}

$case = $casesDoc.cases | Where-Object { $_.case_id -eq $CaseId } | Select-Object -First 1
if ($null -eq $case) {
  Exit-WithError "case_id '$CaseId' não encontrado" 2
}

Assert-CaseGovernance -Case $case

if ([string]$case.status -eq "investigating") {
  Write-Output "warning=WARNING: case status = investigating (não canônico)"
}

$mode = [string]$case.mode
$hasState = Has-Value $case "state_snapshot"
$endpoint = ""
$fallbackEndpoint = $null
$payloadObj = [ordered]@{}
$fallbackPayloadObj = $null

if ($hasState) {
  if (-not (Has-Value $case "wa_id")) {
    Exit-WithError "case '$CaseId' com state_snapshot sem wa_id" 3
  }

  $endpoint = "/__admin__/replay-with-state"
  $payloadObj.wa_id = [string]$case.wa_id
  $payloadObj.state_snapshot = $case.state_snapshot

  if (Has-Prop $case "restore_after") {
    $payloadObj.restore_after = (As-Bool $case.restore_after)
  }
  if (Has-Value $case "delay_ms") {
    $payloadObj.delay_ms = [int]$case.delay_ms
  }

  switch ($mode) {
    "replay_id" { $payloadObj.replay_id = [string]$case.replay_id }
    "replay_ids" { $payloadObj.replay_ids = @($case.replay_ids) }
    "events" { $payloadObj.events = @($case.events) }
  }
} else {
  switch ($mode) {
    "replay_id" {
      $endpoint = "/__admin__/replay-webhook-raw"
      $payloadObj.replay_id = [string]$case.replay_id
      if (Has-Value $case "delay_ms") {
        $payloadObj.delay_ms = [int]$case.delay_ms
      }

      $fallbackEndpoint = "/__admin__/replay-webhook-sequence"
      $fallbackPayloadObj = [ordered]@{ replay_ids = @([string]$case.replay_id) }
      if (Has-Value $case "delay_ms") {
        $fallbackPayloadObj.delay_ms = [int]$case.delay_ms
      }
    }
    "replay_ids" {
      $endpoint = "/__admin__/replay-webhook-sequence"
      $payloadObj.replay_ids = @($case.replay_ids)
      if (Has-Value $case "delay_ms") {
        $payloadObj.delay_ms = [int]$case.delay_ms
      }
    }
    "events" {
      $endpoint = "/__admin__/replay-webhook-sequence"
      $payloadObj.events = @($case.events)
      if (Has-Value $case "delay_ms") {
        $payloadObj.delay_ms = [int]$case.delay_ms
      }
    }
  }
}

$headers = @{ "content-type" = "application/json" }
if ($AdminKey) {
  $headers["x-enova-admin-key"] = $AdminKey
}

$usedEndpoint = $endpoint
$payloadJson = ($payloadObj | ConvertTo-Json -Depth 100 -Compress)
$response = Invoke-WebRequest -Uri ($BaseUrl.TrimEnd('/') + $endpoint) -Method POST -Headers $headers -Body $payloadJson -SkipHttpErrorCheck

if ($response.StatusCode -eq 404 -and $null -ne $fallbackEndpoint) {
  $usedEndpoint = $fallbackEndpoint
  $fallbackPayloadJson = ($fallbackPayloadObj | ConvertTo-Json -Depth 100 -Compress)
  $response = Invoke-WebRequest -Uri ($BaseUrl.TrimEnd('/') + $fallbackEndpoint) -Method POST -Headers $headers -Body $fallbackPayloadJson -SkipHttpErrorCheck
}

$bodyText = [string]$response.Content
$body = $null
try {
  $body = $bodyText | ConvertFrom-Json -Depth 100
} catch {
  $body = [pscustomobject]@{
    ok = $false
    error = "invalid_json_response"
    reason = $_.Exception.Message
    raw = $bodyText
  }
}

$okValue = if (Has-Prop $body "ok") { As-Bool $body.ok } else { $response.StatusCode -ge 200 -and $response.StatusCode -lt 300 }
$failedIndex = Get-ResultsFailedIndex -Body $body
$reason = Get-Reason -Body $body
$resultSummary = Get-ResultSummary -Body $body

Assert-Expectation -Case $case -Body $body -ComputedOk $okValue -FailedIndex $failedIndex -Reason $reason

Write-Output "case_id=$($case.case_id)"
Write-Output "status=$($case.status)"
Write-Output "mode=$mode"
Write-Output "endpoint=$usedEndpoint"
Write-Output "http_status=$($response.StatusCode)"
Write-Output "ok=$okValue"
Write-Output "failed_index=$(if ($null -eq $failedIndex) { 'null' } else { [string]$failedIndex })"
Write-Output "reason=$(if ([string]::IsNullOrWhiteSpace($reason)) { 'null' } else { $reason })"
Write-Output "result_summary=$resultSummary"

if ($okValue -eq $true) {
  exit 0
}

if ([string]$case.status -eq "expected_failure") {
  exit 0
}

exit 1
