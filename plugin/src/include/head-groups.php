<?php
// Glacier Theme: puts the application groups (include/groups.php) into the Docker, VMs and
// Dashboard pages, so the lists are grouped as soon as Unraid draws them, without a request of
// their own. Also tells the scripts whether a FolderView plugin is installed (it arranges those
// lists itself; the theme's groups and reordering are then off) and which decimal mark Display
// Settings uses. Included inside <head> by GlacierTheme.page, where $display is in scope.
//
// Based on the group hand-over in AuroraTheme.page of Aurora Theme
// (https://github.com/Tunefish92/Aurora-Theme), Copyright (c) 2026 Tunefish, MIT License; see NOTICE.md.

$glacierGroupsPath = rtrim((string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH), '/');
if (in_array($glacierGroupsPath, ['/Docker', '/VMs', '/Dashboard'], true)) {
    require_once __DIR__ . '/groups.php';
    $glacierFolderView = glacier_folderview_installed();
    $glacierGroups = [
        'docker' => $glacierFolderView ? [] : glacier_groups_read('docker'),
        'vm' => $glacierFolderView ? [] : glacier_groups_read('vm'),
    ];
    $glacierDecimal = substr((string) ($display['number'] ?? '.,'), 0, 1) === ',' ? ',' : '.';
    $glacierJson = JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE;
    echo '<script>window.glacierGroups = ' . json_encode($glacierGroups, $glacierJson)
        . '; window.glacierFolderView = ' . ($glacierFolderView ? 'true' : 'false')
        . '; window.glacierDecimalMark = ' . json_encode($glacierDecimal) . ";</script>\n";
}
