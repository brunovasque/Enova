param(
  [string]$base = "https://nv-enova.brunovasque.workers.dev",
  [string]$key,
  [string]$wa = "554188609297"
)

function Post($path, $body) {
  $json = ($body | ConvertTo-Json -Depth 20)
  Invoke-RestMethod -Method Post -Uri "$base$path" -ContentType "application/json" -Headers @{
    "x-enova-admin-key" = $key
  } -Body $json
}

Invoke-RestMethod -Method Get -Uri "$base/__build" | ConvertTo-Json -Depth 20
Post "/__admin__/pause" @{ wa_id = $wa; paused = $true }  | ConvertTo-Json -Depth 20
Post "/__admin__/send"  @{ wa_id = $wa; text = "Teste manual ENOVA ✅" } | ConvertTo-Json -Depth 20
Post "/__admin__/pause" @{ wa_id = $wa; paused = $false } | ConvertTo-Json -Depth 20
