<?php
/*
 * Glacier Theme: hands the favourite panels to scripts/gl-panels.js on the Settings and Tools
 * tabs, so they are in place on the first paint, and whether favourites are switched on
 * (Display Settings, "Favorites enabled"). Included by GlacierTheme.page inside <head>, where
 * $display and $myPage are in scope.
 *
 * Adapted from Aurora Theme (https://github.com/Tunefish92/Aurora-Theme),
 * Copyright (c) 2026 Tunefish, MIT License; see NOTICE.md.
 */
$glacierFavPage = (string) ($myPage['name'] ?? '');
if (in_array($glacierFavPage, ['Settings', 'Tools'], true)):
    $glacierFavEnabled = (($display['favorites'] ?? 'yes') !== 'no');
    $glacierFavList = [];
    if ($glacierFavEnabled) {
        require_once __DIR__ . '/favourites.php';
        $glacierFavList = glacier_favourites_read();
    }
?>
<script>window.glacierFavourites = <?= json_encode(['enabled' => $glacierFavEnabled, 'list' => $glacierFavList], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES) ?>;</script>
<?php endif; ?>
