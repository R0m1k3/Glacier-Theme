<?php
// Counts the updates waiting for Docker containers and plugins, for the badges in the menu and on
// the Dashboard card. Read from the files Unraid itself keeps, nothing is checked online:
//   Docker:  /var/lib/docker/unraid-update-status.json, written by Docker > Check for updates, the
//            scheduled check and Compose Manager; a container counts when its image's local and
//            remote versions differ there (the containers are read from /var/lib/docker/containers).
//   Plugins: /var/log/plugins/*.plg are the installed plugins; Plugins > Check for updates
//            downloads each one's latest .plg to /tmp/plugins/. A newer version there is an update
//            (compared as text, as Unraid does for plugins). Unraid OS itself is left out: the
//            header already announces OS updates.
// The result is cached for ten minutes, so pages do not read every .plg on each load.

const GLACIER_UPDATES_CACHE = '/tmp/glacier-theme/updates.json';
const GLACIER_UPDATES_TTL = 600;

/** Reads a .plg's PLUGIN attribute ("version", "pluginURL"), resolving its <!ENTITY> values. */
function glacier_plg_attribute(string $file, string $name): string
{
    $text = @file_get_contents($file, false, null, 0, 65536);
    if (!is_string($text)) return '';
    $entities = [];
    if (preg_match_all('/<!ENTITY\s+(\w+)\s+"([^"]*)"\s*>/', $text, $found, PREG_SET_ORDER)) {
        foreach ($found as $entity) $entities['&' . $entity[1] . ';'] = $entity[2];
    }
    if (!preg_match('/<PLUGIN\b[^>]*\b' . preg_quote($name, '/') . '="([^"]*)"/s', $text, $match)) return '';
    // Entities can refer to others ("&gitURL;/&name;.plg"), so they are resolved twice.
    return strtr(strtr($match[1], $entities), $entities);
}

/** The key Unraid's update-status file uses for an image: DockerUtil::ensureImageTag(). */
function glacier_docker_image_key(string $image): string
{
    if (strpos($image, 'sha256:') === 0) return substr($image, 7, 12) . ':latest';
    if (strpos($image, '/') === false) $image = "library/$image";
    $repo = $image;
    $tag = '';
    if (preg_match('@^(.+/)*([^/:]+)(:[^:/]*)*$@', $image, $parts) && count($parts) >= 3) {
        $repo = $parts[1] . $parts[2];
        $tag = str_replace(':', '', $parts[3] ?? '');
    }
    return trim($repo) . ':' . trim($tag === '' ? 'latest' : $tag);
}

/**
 * Counts the containers with an update ready, as the Docker page shows them. The status file is
 * keyed by image and keeps images no container uses any more; the Compose Manager plugin also
 * writes its stacks' images there under its own key ("redis:8" checked by Unraid is
 * "library/redis:8" for Compose). So each container is looked up once, under the key its
 * manager reads: Unraid's for its own containers, Compose Manager's for a stack's.
 */
function glacier_count_docker_updates(string $statusFile = '/var/lib/docker/unraid-update-status.json', string $containersDir = '/var/lib/docker/containers'): int
{
    $status = json_decode((string) @file_get_contents($statusFile), true);
    if (!is_array($status)) return 0;
    $count = 0;
    foreach (glob("$containersDir/*/config.v2.json") ?: [] as $file) {
        $container = json_decode((string) @file_get_contents($file), true);
        $image = $container['Config']['Image'] ?? '';
        if (!is_string($image) || $image === '' || !empty($container['State']['Dead'])) continue;
        $manager = $container['Config']['Labels']['net.unraid.docker.managed'] ?? '';
        if ($manager === 'composeman') {
            $image = preg_replace(['@^docker\.io/@', '/@sha256:.*$/'], '', $image);
        } elseif ($manager !== 'dockerman') {
            continue; // started outside Unraid: the Docker page shows no update for it
        }
        $entry = $status[glacier_docker_image_key($image)] ?? null;
        // DockerUpdate::getUpdateStatus(): "undef" is unknown, otherwise local and remote differ.
        if (!is_array($entry) || ($entry['status'] ?? '') === 'undef') continue;
        if (($entry['local'] ?? '') || ($entry['remote'] ?? '')) {
            if (($entry['local'] ?? '') != ($entry['remote'] ?? '')) $count++;
        }
    }
    return $count;
}

function glacier_count_plugin_updates(string $installedDir = '/var/log/plugins', string $latestDir = '/tmp/plugins'): int
{
    $count = 0;
    foreach (glob("$installedDir/*.plg") ?: [] as $installed) {
        if (basename($installed) === 'unRAIDServer.plg') continue;
        $url = glacier_plg_attribute($installed, 'pluginURL');
        if ($url === '') continue;
        $latest = "$latestDir/" . basename($url);
        if (!is_file($latest)) continue;
        $have = glacier_plg_attribute($installed, 'version');
        $new = glacier_plg_attribute($latest, 'version');
        if ($have !== '' && $new !== '' && strcmp($new, $have) > 0) $count++;
    }
    return $count;
}

/** ['docker' => n, 'plugins' => n] */
function glacier_updates(): array
{
    $cached = json_decode((string) @file_get_contents(GLACIER_UPDATES_CACHE), true);
    $fresh = is_array($cached) && time() - (int) ($cached['time'] ?? 0) < GLACIER_UPDATES_TTL;
    // A check run, or a container added or removed, since the cache was written makes it stale.
    foreach (['/var/lib/docker/unraid-update-status.json', '/var/lib/docker/containers', '/tmp/plugins'] as $source) {
        if ($fresh && @filemtime($source) > (int) $cached['time']) $fresh = false;
    }
    if ($fresh) return ['docker' => (int) $cached['docker'], 'plugins' => (int) $cached['plugins']];

    $updates = ['docker' => glacier_count_docker_updates(), 'plugins' => glacier_count_plugin_updates()];
    if (!is_dir(dirname(GLACIER_UPDATES_CACHE))) @mkdir(dirname(GLACIER_UPDATES_CACHE), 0700, true);
    @file_put_contents(GLACIER_UPDATES_CACHE, json_encode($updates + ['time' => time()]));
    return $updates;
}
