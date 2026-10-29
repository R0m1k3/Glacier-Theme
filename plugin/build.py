#!/usr/bin/env python3
"""Builds Glacier-Theme.plg, a self-contained Unraid plugin file.

Every plugin file is written by a bash heredoc inside the .plg (fonts base64-encoded), so
installing needs no downloads.

    python3 plugin/build.py [version]

The version defaults to the current date and time: Unraid only installs a version newer than the
one installed and compares versions as text.
"""
import base64
import datetime
import os
import pathlib
import sys
from xml.sax.saxutils import escape

NAME = "Glacier-Theme"
AUTHOR = os.environ.get("GLACIER_AUTHOR", "R0m1k3")
# GitHub repository "owner/name" the .plg is published from. Unraid's Plugins page downloads
# Glacier-Theme.plg from its main branch to check for updates, so commit the rebuilt .plg there.
# GLACIER_REPO="" builds a .plg without update address (for a fork or a local test).
REPO = os.environ.get("GLACIER_REPO", "R0m1k3/Glacier-Theme")
MIN_UNRAID = "7.2.0"
EMHTTP = f"/usr/local/emhttp/plugins/{NAME}"
CONFIG = f"/boot/config/plugins/{NAME}"
DELIMITER = "GLACIER_THEME_EOF"
BINARY = {".woff2", ".woff", ".png"}

root = pathlib.Path(__file__).resolve().parent
src = root / "src"
version = sys.argv[1] if len(sys.argv) > 1 else datetime.datetime.now().strftime("%Y.%m.%d.%H%M")
files = {str(path.relative_to(src)): path for path in sorted(src.rglob("*")) if path.is_file()}

install = [
    f"rm -rf {EMHTTP}",
    "mkdir -p " + " ".join(sorted({f"{EMHTTP}/{pathlib.PurePosixPath(t).parent}".rstrip("/.") for t in files} | {CONFIG})),
]
for target, path in sorted(files.items()):
    if path.suffix in BINARY:
        encoded = base64.encodebytes(path.read_bytes()).decode("ascii")
        install.append(f"base64 -d > {EMHTTP}/{target} <<'{DELIMITER}'\n{encoded}{DELIMITER}")
        continue
    text = path.read_text(encoding="utf-8").replace("@@VERSION@@", version)
    if not text.endswith("\n"):
        text += "\n"
    for forbidden in ("]]>", DELIMITER):
        if forbidden in text:
            sys.exit(f"{path}: contains {forbidden!r}, which would break the .plg")
    install.append(f"cat > {EMHTTP}/{target} <<'{DELIMITER}'\n{text}{DELIMITER}")

# Login page: Unraid's login and first-time password pages get one line, before </head>, that
# includes include/login-head.php when it exists. Those pages live in RAM, so this runs at every
# boot (Unraid installs plugins then); the line does nothing once the include is gone.
LOGIN_PAGES = "/usr/local/emhttp/plugins/dynamix/include/.login.php /usr/local/emhttp/plugins/dynamix/include/.set-password.php"
LOGIN_LINE = f'<?php if (is_file("{EMHTTP}/include/login-head.php")) @include "{EMHTTP}/include/login-head.php"; ?>'
LOGIN_HOOK = f"""for page in {LOGIN_PAGES}; do
  [ -f "$page" ] || continue
  grep -q '{NAME}/include/login-head.php' "$page" && continue
  grep -q '</head>' "$page" || continue
  sed -i '0,/<\\/head>/s##{LOGIN_LINE}\\n</head>#' "$page"
done"""
LOGIN_UNHOOK = f"""for page in {LOGIN_PAGES}; do
  [ -f "$page" ] && sed -i '\\#{NAME}/include/login-head.php#d' "$page"
done"""

install += [
    LOGIN_HOOK,
    f"find {EMHTTP} -type d -exec chmod 755 {{}} +",
    f"find {EMHTTP} -type f -exec chmod 644 {{}} +",
    'echo ""',
    f'echo "{NAME} {version} is installed."',
    'echo "Settings: Settings > User Utilities > Glacier Theme"',
    'echo "The theme shows while Settings > Display Settings > Dynamix color theme is White."',
    'echo ""',
]

urls = ""
if REPO:
    urls = (
        f'\n        pluginURL="https://raw.githubusercontent.com/{REPO}/main/{NAME}.plg"'
        f'\n        support="https://github.com/{REPO}/issues"'
    )

plg = f"""<?xml version='1.0' standalone='yes'?>
<!DOCTYPE PLUGIN>

<PLUGIN name="{NAME}"
        author="{escape(AUTHOR)}"
        version="{version}"
        launch="Settings/GlacierThemeSettings"{urls}
        icon="paint-brush"
        min="{MIN_UNRAID}">

<CHANGES>
###{version}
- Dashboard: the case picture on the server tile no longer rises over the tile's buttons; it sits under the header, in the muted colour, the accent on hover.

###2026.10.29.0922
- Dashboard organise mode: opening the Dashboard after leaving it (or the Docker or VMs page) unlocked no longer shows the organise bar with locked tiles, where Done unlocked them. The hint now says the layout is saved on the server, for every browser, as Unraid does. Close buttons line up with the tile's controls in every tile, plugins' too; the tile manager takes the accent colour; keyboard focus moves to Done and back.

###2026.10.29.0912
- Dashboard: an Organise button above the tiles. It unlocks them as Unraid's lock does: drag them between the columns, close the ones you do not need, show hidden ones again or reset the layout, then Done. The tile being dragged stays opaque and its landing place shows as a dashed card.
- Dashboard: the tiles' close buttons and the tile manager show only while the tiles are unlocked, at the end of the tile's header row; they no longer sit above the icon all the time.

###2026.10.29.0826
- Header: the notifications bell and "Unraid OS" in the licence pill are light on the dark header card again (Unraid's components coloured them dark).

###2026.10.29.0809
- Docker update counter: counts each container once, as the Docker page does. A container in a Compose Manager stack was counted twice (Compose and Unraid's check file its image under two names), and images no container uses any more were counted too.
- Unraid's page loader becomes the theme's loading ring: full screen, on a card in the middle of the page with "One moment…" ("Un instant…" in French), shown after a short delay; in loading tables, the ring alone. Busy dialogs use the same ring instead of the comet.
- Apps: cards no longer lift on hover, which could make Community Applications' corner flag (installed, beta…) vanish while the pointer was over the card.

###2026.10.26.2015
- Docker advanced view: orphan images, the CPU and memory column and "/ MAC" laid out in the table again (rows and cells Unraid shows with jQuery came back as blocks because of the page grid). Fixes the same for other tables using show/hide.
- Unraid's page loader (orange animated logo, full screen during some actions and in loading tables) replaced by the accent-coloured comet on a light veil.

###2026.10.26.2003
- Notifications panel in Glacier's style, light and dark: a floating rounded card, Unread/Archived as a segmented control, filter pills in the accent tint, each notification on its own soft card, accent buttons and links instead of Unraid's orange. Confirm dialogs, menus and toasts of Unraid's Vue components take the theme colours too.

###2026.10.26.1947
- Busy dialogs: Unraid's three green falling dots become a small comet in the accent colour (light and dark), circling over the faded confirm button.

###2026.10.26.1934
- Login and first-time password pages in Glacier's style (light or dark, accent colour): a rounded card with the Unraid wordmark on a dark header, rounded fields, a full-width login button, errors and the logged-out note as coloured boxes. The install adds one guarded include line to Unraid's two login pages; removing the plugin takes it out again. ?glacier=off works there too.

###2026.10.26.1928
- The header is a dark card across the page: logo and version on the left, date and time in the middle, licence, server, notifications and menu on the right.

###2026.10.26.1923
- More room inside the Unraid card, above the logo and under the version.

###2026.10.26.1913
- Wide screens: the quick actions move into a card in the sidebar, under the menu card, as small round buttons five to a row with the array usage bar above them.
- Larger Unraid card (logo and version) aligned with the sidebar; page headings on a card; 24px between cards and deeper drop shadows, in light and dark.
- The server name, notifications and menu at the top right now end at the right edge of the page content and centre on the logo card.
- The sidebar stays in view while scrolling when the window is tall enough to show all of it.

###2026.10.26.1709
- Page enhancements adapted from Aurora Theme (MIT, see NOTICE.md), in French and English:
- Page headings on every tab. Dashboard: key figures strip, processor cores as tiles, charts and rings in theme colours, fan and VM-usage cards, an update badge on container icons, and a container dialog with all actions.
- Settings and Tools: search ("/" to focus) and favourites with a star. Users: cards with initials, roles, search and Add user.
- Main: Array Operation as cards, with parity-check progress and danger buttons.
- Docker: summary, filters, search, Basic/Advanced, compact view with WebUI, CPU, memory and actions, phone cards; port check in the container editor.
- Application groups for Docker and VMs (also on the Dashboard), VM details and snapshot buttons. Off when FolderView is installed.

###2026.10.26.1607
- Dark mode: follows the Dynamix theme (White light, Black dark), or always light / always dark (new setting).
- Theme version on the settings page and in the footer.
- Logo and version in a dark card above the menu card.
- Plugins page: title and description laid out, support link as a pill, icon in a tinted squircle.
- Docker page: icon and name side by side, folded ports and volume paths no longer cut mid-line, wide tables scroll instead of being clipped.
- Apps (Community Applications): the category menu as a list with the selected entry highlighted, rounded app cards.
- Paragraphs and table cells left-aligned instead of justified.

###2026.10.26.1550
- Wide screens: the main menu in a card on the left with an icon per entry, the quick actions centred under the header. Tablets: the menu bar on its own row.
- Badges: container and VM states, update and check status (Docker, Plugins), disk temperatures (warm or red past the Disk Settings thresholds), file systems, licence type.
- Waiting updates: counters on the Docker and Plugins menu entries and on the Dashboard card; Plugins Update button, new version and Docker "apply update" stand out.
- Header: the server name shows properly when the server has no description.

###2026.10.26.1530
- First release: Glacier light theme over Dynamix White. Plus Jakarta Sans, pill navigation, content cards, Dashboard tiles as cards with a greeting card, rounded tables, inputs, switches, buttons, dialogs and footer. Accent colour setting.
</CHANGES>

<!-- Install: write all plugin files. Generated by plugin/build.py; edit the sources, not this file. -->
<FILE Run="/bin/bash">
<INLINE>
<![CDATA[
{chr(10).join(install)}
]]>
</INLINE>
</FILE>

<!-- Remove: delete the plugin files and its settings, including custom.css and custom.js. -->
<FILE Run="/bin/bash" Method="remove">
<INLINE>
<![CDATA[
{LOGIN_UNHOOK}
rm -rf {EMHTTP}
rm -rf {CONFIG}
echo ""
echo "{NAME} has been removed."
echo ""
]]>
</INLINE>
</FILE>

</PLUGIN>
"""

out = root.parent / f"{NAME}.plg"
out.write_text(plg, encoding="utf-8")
print(f"wrote {out} ({len(plg)} bytes, {len(files)} files, version {version})")
