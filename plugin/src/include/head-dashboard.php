<?php
/*
 * Glacier Theme: hands the Dashboard's usage thresholds (Display Settings, "Warning" and
 * "Critical" disk utilization, in %) to scripts/gl-dashboard.js, which colours the summary
 * strip with them. Included by GlacierTheme.page inside <head>, where $display and $myPage are
 * in scope.
 *
 * Adapted from Aurora Theme (https://github.com/Tunefish92/Aurora-Theme),
 * Copyright (c) 2026 Chris (Tunefish), MIT License; see NOTICE.md.
 */
if ((string) ($myPage['name'] ?? '') === 'Dashboard'):
?>
<script>window.glacierDashboard = <?= json_encode(['warning' => (int) ($display['warning'] ?? 70), 'critical' => (int) ($display['critical'] ?? 90)]) ?>;</script>
<?php endif; ?>
