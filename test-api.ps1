# ============================================================
# YOUXIS IOT v2 - Test rapide de l'API (PowerShell)
# Usage : Set-ExecutionPolicy -Scope CurrentUser Bypass -Force
#         & 'C:\Users\HP\Desktop\yousis-iot-v2\test-api.ps1'
# Le backend (npm run dev, port 3001) doit tourner ailleurs.
# ============================================================
$ErrorActionPreference = "Stop"
$base = "http://localhost:3001"

Write-Host "== TEST API YOUXIS IOT =="

# 1) Compte (register, ou login si deja existant)
$body = @{ email = "demo@yousis.test"; password = "123456" } | ConvertTo-Json
try {
    $r = Invoke-RestMethod -Method Post -Uri "$base/api/auth/register" -ContentType "application/json; charset=utf-8" -Body $body
    Write-Host "OK  Compte cree (register)"
} catch {
    $r = Invoke-RestMethod -Method Post -Uri "$base/api/auth/login" -ContentType "application/json; charset=utf-8" -Body $body
    Write-Host "->  Compte deja existant (login)"
}
$h = @{ Authorization = "Bearer $($r.token)" }

# 2) Device
$d = Invoke-RestMethod -Method Post -Uri "$base/api/devices" -Headers $h -ContentType "application/json" -Body (@{ name = "Feu intelligent"; type = "esp32" } | ConvertTo-Json)
Write-Host "OK  Device cree : $($d.name)"
$deviceToken = $d.token
Write-Host "TOKEN DEVICE (a garder) : $deviceToken"

# 3) Datastreams temperature + humidity (tolerant si deja presents)
foreach ($ds in @(@{ key = "temperature"; unit = "degC" }, @{ key = "humidity"; unit = "%" })) {
    try {
        Invoke-RestMethod -Method Post -Uri "$base/api/devices/$($d.id)/datastreams" -Headers $h -ContentType "application/json" -Body ($ds | ConvertTo-Json) | Out-Null
        Write-Host "OK  Datastream ajoute : $($ds.key)"
    } catch {
        Write-Host "   (datastream $($ds.key) deja present)"
    }
}

# 4) Envoi de donnees avec le token du device
$dh = @{ "X-Device-Token" = $deviceToken }
Invoke-RestMethod -Method Post -Uri "$base/api/data" -Headers $dh -ContentType "application/json" -Body (@{ key = "temperature"; value = 25.4 } | ConvertTo-Json) | Out-Null
Invoke-RestMethod -Method Post -Uri "$base/api/data" -Headers $dh -ContentType "application/json" -Body (@{ key = "humidity"; value = 52 } | ConvertTo-Json) | Out-Null
Write-Host "OK  Donnees envoyees (temperature=25.4, humidity=52)"

# 5) Dernier etat
$latest = Invoke-RestMethod -Method Get -Uri "$base/api/devices/$deviceToken/latest" -Headers $dh
$latest.datastreams | ForEach-Object { Write-Host "     dernier etat : $($_.key) = $($_.value)" }

# 6) Widget jauge sur le premier datastream
$device = Invoke-RestMethod -Method Get -Uri "$base/api/devices/$($d.id)" -Headers $h
$w = Invoke-RestMethod -Method Post -Uri "$base/api/widgets" -Headers $h -ContentType "application/json" -Body (@{ device_id = $d.id; datastream_id = $device.datastreams[0].id; type = "gauge"; label = "Temperature" } | ConvertTo-Json)
Write-Host "OK  Widget cree : $($w.type)"

Write-Host ""
Write-Host "=== TEST API REUSSI - tout fonctionne ! ==="
Write-Host "Token device pour le simulateur : $deviceToken"