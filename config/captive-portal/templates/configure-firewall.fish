#!/usr/bin/env fish

function allowport
    set -l port $argv[1]

    if test -z "$port"
        echo "Usage: allowport <port>"
        return 1
    end

    sudo ufw allow in on {{WIFI_INTERFACE}} from {{HOTSPOT_SUBNET}} to any port $port proto tcp
end

allowport 80
allowport 5900

if contains -- --development $argv
    for port in 3000 5173 5174
        allowport $port
    end
end
