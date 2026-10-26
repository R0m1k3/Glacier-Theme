<?php
/*
 * Glacier Theme: favourite panels on the Settings and Tools tabs (scripts/gl-panels.js).
 *
 * Adapted from Aurora Theme (https://github.com/Tunefish92/Aurora-Theme),
 * Copyright (c) 2026 Tunefish, MIT License; see NOTICE.md.
 *
 *   GET                          {"favourites": ["Settings/Identification", ...]}
 *   POST favourites=<JSON list>  replaces the stored list, answers with the list as stored
 *
 * Unraid checks the csrf_token of every POST before any page or plugin file runs, so a write can
 * only come from a logged-in webGUI page. The list is kept on the flash drive and survives
 * reboots. include/head-favourites.php reads it through glacier_favourites_read() to hand it to
 * the page, so this file only answers requests when it is the script being run.
 */

/** Where the list is stored; GLACIER_FAVOURITES_FILE overrides it (command-line tests). */
function glacier_favourites_file(): string
{
    $override = getenv('GLACIER_FAVOURITES_FILE');
    return is_string($override) && $override !== '' ? $override : '/boot/config/plugins/Glacier-Theme/favourites.json';
}

/** Page paths such as "Settings/Identification", each once, in the order given, at most 200. */
function glacier_favourites_clean($list): array
{
    $clean = [];
    if (!is_array($list)) return $clean;
    foreach (array_slice(array_values($list), 0, 200) as $item) {
        if (!is_string($item) || strlen($item) > 120) continue;
        if (!preg_match('#^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*$#', $item)) continue;
        if (preg_match('#(^|/)\.\.?(/|$)#', $item)) continue;
        if (!in_array($item, $clean, true)) $clean[] = $item;
    }
    return $clean;
}

function glacier_favourites_read(): array
{
    $file = glacier_favourites_file();
    if (!is_file($file)) return [];
    $stored = json_decode((string) @file_get_contents($file), true);
    return glacier_favourites_clean(is_array($stored) ? ($stored['favourites'] ?? []) : []);
}

/** Writes the list (cleaned); returns it, or null when the file could not be written. */
function glacier_favourites_write(array $list): ?array
{
    $file = glacier_favourites_file();
    $favourites = glacier_favourites_clean($list);
    $dir = dirname($file);
    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) return null;
    $json = json_encode(['favourites' => $favourites], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
    return @file_put_contents($file, $json, LOCK_EX) === false ? null : $favourites;
}

function glacier_favourites_answer(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_SLASHES);
}

function glacier_favourites_request(): void
{
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if ($method === 'GET') {
        glacier_favourites_answer(200, ['favourites' => glacier_favourites_read()]);
        return;
    }
    if ($method !== 'POST') {
        header('Allow: GET, POST');
        glacier_favourites_answer(405, ['error' => 'method not allowed']);
        return;
    }
    $raw = $_POST['favourites'] ?? null;
    if (!is_string($raw) || strlen($raw) > 32768) {
        glacier_favourites_answer(400, ['error' => 'favourites must be a JSON list']);
        return;
    }
    $input = json_decode($raw, true);
    if (!is_array($input) || ($input !== [] && array_keys($input) !== range(0, count($input) - 1))) {
        glacier_favourites_answer(400, ['error' => 'favourites must be a JSON list']);
        return;
    }
    $stored = glacier_favourites_write($input);
    if ($stored === null) {
        glacier_favourites_answer(500, ['error' => 'the list could not be saved']);
        return;
    }
    glacier_favourites_answer(200, ['favourites' => $stored]);
}

// Answer only when requested directly, not when another file includes this one.
if (realpath((string) ($_SERVER['SCRIPT_FILENAME'] ?? '')) === realpath(__FILE__)) {
    glacier_favourites_request();
}
