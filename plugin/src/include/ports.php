<?php
// Glacier Theme: ports that programs on the server listen on, for the port check in the Docker
// container editor (scripts/gl-docker-ports.js).
//   GET  returns {"listening": [{"port": 445, "proto": "tcp", "process": "smbd"}, ...]}
//
// Based on include/ports.php of Aurora Theme (https://github.com/Tunefish92/Aurora-Theme),
// Copyright (c) 2026 Chris (Tunefish), MIT License; see NOTICE.md.
//
// Read-only: it runs one fixed command (ss, no shell, no input from the request) and returns
// what it parsed. Docker's own forwarders (docker-proxy) are left out: the editor already knows
// the containers' ports from Unraid's list.

const GLACIER_PORTS_MAX = 4000;

/** The ss binary, or '' when there is none. */
function glacier_ports_ss(array $candidates = ['/usr/sbin/ss', '/sbin/ss', '/usr/bin/ss', '/bin/ss']): string
{
    foreach ($candidates as $path) {
        if (is_file($path) && is_executable($path)) return $path;
    }
    return '';
}

/**
 * Parses `ss -H -l -n -t -u -p` lines, such as
 *   tcp   LISTEN 0 4096 0.0.0.0:445 0.0.0.0:* users:(("smbd",pid=1234,fd=40))
 *   udp   UNCONN 0 0    [::]:5353   [::]:*
 * into a sorted list of unique {port, proto, process}. Anything unexpected is skipped.
 */
function glacier_ports_parse(array $lines): array
{
    $listening = [];
    $seen = [];
    foreach (array_slice($lines, 0, GLACIER_PORTS_MAX) as $line) {
        if (!is_string($line) || strlen($line) > 2048) continue;
        $fields = preg_split('/\s+/', trim($line));
        if (!is_array($fields) || count($fields) < 5) continue;
        $netid = strtolower($fields[0]);
        if ($netid !== 'tcp' && $netid !== 'udp') continue;
        // Local address: "0.0.0.0:445", "[::]:445", "*:53", "127.0.0.1%lo:53".
        if (!preg_match('/:(\d{1,5})$/', $fields[4], $match)) continue;
        $port = (int) $match[1];
        if ($port < 1 || $port > 65535) continue;
        $process = '';
        if (preg_match('/users:\(\("([^"]{1,64})"/', $line, $name)) {
            $process = preg_replace('/[^A-Za-z0-9._@:+\-]/', '', $name[1]);
        }
        if ($process === 'docker-proxy') continue;
        $key = "$netid/$port";
        if (isset($seen[$key])) continue;
        $seen[$key] = true;
        $listening[] = ['port' => $port, 'proto' => $netid, 'process' => (string) $process];
    }
    usort($listening, function ($a, $b) {
        return [$a['port'], $a['proto']] <=> [$b['port'], $b['proto']];
    });
    return $listening;
}

/** Runs ss and returns its lines; [] when it is missing or fails. */
function glacier_ports_read(string $ss): array
{
    if ($ss === '' || !function_exists('exec')) return [];
    $lines = [];
    $status = 1;
    @exec(escapeshellarg($ss) . ' -H -l -n -t -u -p 2>/dev/null', $lines, $status);
    return $status === 0 ? $lines : [];
}

// Only when requested directly (the CLI tests include this file for its functions).
if (realpath((string) ($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__ && PHP_SAPI !== 'cli') {
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        http_response_code(405);
        header('Allow: GET');
        echo json_encode(['error' => 'GET only']);
        exit;
    }
    $ss = glacier_ports_ss();
    echo json_encode(['listening' => glacier_ports_parse(glacier_ports_read($ss)), 'available' => $ss !== '']);
}
