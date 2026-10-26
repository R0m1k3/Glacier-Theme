<?php
// Glacier Theme on Unraid's login page (.login.php) and first-time password page
// (.set-password.php). The plugin's install script adds one line to those pages, just before
// </head>, that includes this file when it exists. Files below /plugins are not served before
// login, so the stylesheet and the font are written into the page.
//
// It never stops the login page from working: nothing is written when the theme is off, when
// ?glacier=off is used, when the Dynamix theme is not White or Black, or when a file is
// missing, and any error is swallowed. The stock login page then shows as before.
//
// Structure adapted from Aurora Theme's include/login-head.php
// (https://github.com/Tunefish92/Aurora-Theme), Copyright (c) 2026 Chris (Tunefish), MIT License;
// see NOTICE.md.
(function () {
    try {
        $dir = '/usr/local/emhttp/plugins/Glacier-Theme';
        $cfg = array_merge(
            (array) @parse_ini_file("$dir/default.cfg"),
            (array) @parse_ini_file('/boot/config/plugins/Glacier-Theme/Glacier-Theme.cfg')
        );
        if (($cfg['theme'] ?? 'yes') !== 'yes') return;

        // The same emergency switch as on every other page.
        $switch = (string) ($_GET['glacier'] ?? '');
        if ($switch === 'off') {
            echo "<script>document.cookie = 'glacier_off=1; path=/; max-age=31536000; SameSite=Lax';</script>\n";
            return;
        }
        if ($switch === 'on') {
            echo "<script>document.cookie = 'glacier_off=; path=/; max-age=0; SameSite=Lax';</script>\n";
        } elseif (!empty($_COOKIE['glacier_off'])) {
            return;
        }

        // Light or dark, as on the other pages: "auto" follows the Dynamix theme.
        $dynamix = @parse_ini_file('/boot/config/plugins/dynamix/dynamix.cfg', true);
        $dynamixTheme = is_array($dynamix) ? (string) ($dynamix['display']['theme'] ?? 'white') : 'white';
        if (!in_array($dynamixTheme, ['white', 'black'], true)) return;
        $mode = (string) ($cfg['mode'] ?? 'auto');
        $dark = $mode === 'dark' || ($mode !== 'light' && $dynamixTheme === 'black');

        $css = @file_get_contents("$dir/styles/login.css");
        if (!is_string($css) || $css === '') return;
        $font = @file_get_contents("$dir/fonts/plus-jakarta-sans-latin-wght-normal.woff2");
        $css = str_replace('@@FONT@@', is_string($font) ? 'data:font/woff2;base64,' . base64_encode($font) : '', $css);

        // Accent colour from the settings page, with the text colour that reads best on it.
        $accent = strtolower(ltrim(trim((string) ($cfg['accent'] ?? '')), '#'));
        if (preg_match('/^[0-9a-f]{3}$/', $accent)) $accent = preg_replace('/(.)/', '$1$1', $accent);
        if (preg_match('/^[0-9a-f]{6}$/', $accent)) {
            $luminance = function ($hex) {
                $channels = [];
                foreach (str_split($hex, 2) as $pair) {
                    $v = hexdec($pair) / 255;
                    $channels[] = $v <= 0.03928 ? $v / 12.92 : (($v + 0.055) / 1.055) ** 2.4;
                }
                return 0.2126 * $channels[0] + 0.7152 * $channels[1] + 0.0722 * $channels[2];
            };
            $l = $luminance($accent);
            $text = 1.05 / ($l + 0.05) >= ($l + 0.05) / ($luminance('0f172a') + 0.05) ? '#ffffff' : '#0f172a';
            $css .= "\nhtml.glacier-login, html.glacier-login.gl-dark { --gl-accent: #$accent; --gl-accent-text: $text; }\n";
        }

        $classes = $dark ? "'glacier-login', 'gl-dark'" : "'glacier-login'";
        echo "<script>document.documentElement.classList.add($classes);</script>\n";
        echo '<style id="glacier-login">' . "\n" . str_ireplace('</style', '<\/style', $css) . "\n</style>\n";
        // "Successfully logged out" uses the error style; it gets the calm one instead.
        echo "<script>document.addEventListener('DOMContentLoaded', function () {\n"
            . "  var note = document.getElementById('error');\n"
            . "  if (note && /logged out|déconnect|abgemeldet/i.test(note.textContent)) note.classList.add('gl-ok');\n"
            . "});</script>\n";
    } catch (Throwable $error) {
        // Leave the stock login page untouched.
    }
})();
