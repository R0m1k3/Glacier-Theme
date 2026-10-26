<?php
// Glacier Theme: application groups for the Docker tab, the VMs tab and the Dashboard
// (scripts/gl-groups.js).
//   GET  ?type=docker|vm                      {"groups": [{"name": "...", "containers": ["...", ...]}, ...]}
//   POST type=docker|vm, groups=<that list as JSON>, csrf_token    replaces the stored groups
// "containers" holds the members' names for both kinds. A member is in one group at most.
//
// Based on include/docker-groups.php of Aurora Theme (https://github.com/Tunefish92/Aurora-Theme),
// Copyright (c) 2026 Tunefish, MIT License; see NOTICE.md.
//
// The groups live on the flash drive (/boot/config/plugins/Glacier-Theme/docker-groups.json and
// vm-groups.json) and survive reboots. Nothing is written while a FolderView plugin is installed:
// it arranges those lists itself.

const GLACIER_GROUPS_DIR = '/boot/config/plugins/Glacier-Theme';
const GLACIER_GROUPS_MAX = 100;
const GLACIER_GROUPS_MEMBERS = 500;
const GLACIER_GROUPS_BODY = 262144;
const GLACIER_FOLDERVIEW_DIRS = ['/usr/local/emhttp/plugins/folder.view', '/usr/local/emhttp/plugins/folder.view2', '/usr/local/emhttp/plugins/folder.view3'];

function glacier_groups_type($value): string
{
    return $value === 'vm' ? 'vm' : ($value === 'docker' || $value === null || $value === '' ? 'docker' : '');
}

function glacier_groups_file(string $type, string $dir = GLACIER_GROUPS_DIR): string
{
    return rtrim($dir, '/') . '/' . ($type === 'vm' ? 'vm-groups.json' : 'docker-groups.json');
}

function glacier_folderview_installed(array $dirs = GLACIER_FOLDERVIEW_DIRS): bool
{
    foreach ($dirs as $dir) {
        if (is_dir($dir)) return true;
    }
    return false;
}

/** A group or member name as text, trimmed; '' when it has control characters or is too long. */
function glacier_groups_text($value, int $max): string
{
    if (!is_string($value) || !mb_check_encoding($value, 'UTF-8') || preg_match('/[\x00-\x1F\x7F]/', $value)) return '';
    $value = trim($value);
    return mb_strlen($value) > $max ? '' : $value;
}

/**
 * Keeps only well-formed groups: at most 100, named (60 characters, unique regardless of case),
 * with members that are valid container names (Docker) or VM names; a member stays in the first
 * group that names it.
 */
function glacier_groups_clean($groups, string $type): array
{
    $clean = [];
    $seenGroups = [];
    $seenMembers = [];
    foreach (is_array($groups) ? array_slice(array_values($groups), 0, GLACIER_GROUPS_MAX) : [] as $group) {
        if (!is_array($group)) continue;
        $name = glacier_groups_text($group['name'] ?? null, 60);
        $key = mb_strtolower($name);
        if ($name === '' || isset($seenGroups[$key])) continue;
        $seenGroups[$key] = true;
        $members = [];
        $list = $group['containers'] ?? [];
        foreach (is_array($list) ? array_slice(array_values($list), 0, GLACIER_GROUPS_MEMBERS) : [] as $member) {
            $member = glacier_groups_text($member, 128);
            if ($member === '' || isset($seenMembers[$member])) continue;
            // Docker container names: letters, digits, "_", "." and "-", starting with a letter or digit.
            if ($type === 'docker' && !preg_match('/^[A-Za-z0-9][A-Za-z0-9_.-]*$/', $member)) continue;
            $seenMembers[$member] = true;
            $members[] = $member;
        }
        $clean[] = ['name' => $name, 'containers' => $members];
    }
    return $clean;
}

function glacier_groups_read(string $type, string $dir = GLACIER_GROUPS_DIR): array
{
    $stored = json_decode((string) @file_get_contents(glacier_groups_file($type, $dir)), true);
    return glacier_groups_clean(is_array($stored) ? ($stored['groups'] ?? []) : [], $type);
}

function glacier_groups_write(string $type, array $groups, string $dir = GLACIER_GROUPS_DIR): bool
{
    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) return false;
    $json = json_encode(['groups' => $groups], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    return is_string($json) && @file_put_contents(glacier_groups_file($type, $dir), $json . "\n", LOCK_EX) !== false;
}

/**
 * Whether a POST carries a valid token. Unraid's local_prepend.php checks csrf_token on every
 * POST before this file runs (and stops the request when it is wrong), then removes it from
 * $_POST; csrf_terminate() is its function. Without that check in place, the token must be
 * there and match var.ini. Anything else is refused.
 */
function glacier_groups_csrf_ok(array $post, string $varIni = '/var/local/emhttp/var.ini', ?bool $prepend = null): bool
{
    $prepend = $prepend ?? function_exists('csrf_terminate');
    if ($prepend && !isset($post['csrf_token'])) return true;
    $token = $post['csrf_token'] ?? null;
    $var = @parse_ini_file($varIni);
    $expected = is_array($var) ? (string) ($var['csrf_token'] ?? '') : '';
    return is_string($token) && $expected !== '' && hash_equals($expected, $token);
}

/**
 * The request as [HTTP status, response array]; everything the endpoint does, so the CLI tests
 * can run it with their own paths.
 *   $env: dir, varIni, prepend (bool|null), folderView (bool)
 */
function glacier_groups_handle(string $method, array $get, array $post, array $env = []): array
{
    $dir = $env['dir'] ?? GLACIER_GROUPS_DIR;
    if ($method === 'GET') {
        $type = glacier_groups_type($get['type'] ?? null);
        if ($type === '') return [400, ['error' => 'unknown type']];
        return [200, ['groups' => glacier_groups_read($type, $dir)]];
    }
    if ($method !== 'POST') return [405, ['error' => 'GET or POST only']];
    if (!glacier_groups_csrf_ok($post, $env['varIni'] ?? '/var/local/emhttp/var.ini', $env['prepend'] ?? null)) return [403, ['error' => 'invalid csrf_token']];
    if ($env['folderView'] ?? glacier_folderview_installed()) return [409, ['error' => 'FolderView is installed; groups are off']];
    $type = glacier_groups_type($post['type'] ?? null);
    if ($type === '') return [400, ['error' => 'unknown type']];
    $raw = $post['groups'] ?? null;
    if (!is_string($raw) || strlen($raw) > GLACIER_GROUPS_BODY) return [400, ['error' => 'groups must be a JSON list']];
    $input = json_decode($raw, true);
    if (!is_array($input) || ($input !== [] && array_keys($input) !== range(0, count($input) - 1))) return [400, ['error' => 'groups must be a JSON list']];
    $groups = glacier_groups_clean($input, $type);
    if (!glacier_groups_write($type, $groups, $dir)) return [500, ['error' => 'could not save the groups']];
    return [200, ['groups' => $groups]];
}

// Only when requested directly (head-groups.php and the CLI tests include this file for its functions).
if (realpath((string) ($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__ && PHP_SAPI !== 'cli') {
    [$status, $body] = glacier_groups_handle((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'), $_GET, $_POST);
    http_response_code($status);
    if ($status === 405) header('Allow: GET, POST');
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
}
