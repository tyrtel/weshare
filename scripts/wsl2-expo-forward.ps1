# Get current WSL2 IP (called from within WSL, so wsl.exe resolves back to itself)
$wslIp = (wsl hostname -I).Trim().Split(' ')[0]

# Remove stale rules from previous boot
netsh interface portproxy delete v4tov4 listenport=8081  listenaddress=0.0.0.0 2>$null
netsh interface portproxy delete v4tov4 listenport=19000 listenaddress=0.0.0.0 2>$null

# Add fresh rules pointing at current WSL2 IP
netsh interface portproxy add v4tov4 listenport=8081  listenaddress=0.0.0.0 connectport=8081  connectaddress=$wslIp
netsh interface portproxy add v4tov4 listenport=19000 listenaddress=0.0.0.0 connectport=19000 connectaddress=$wslIp

Write-Host "Done. Forwarding ports 8081 and 19000 to WSL2 at $wslIp"
