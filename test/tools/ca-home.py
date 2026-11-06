#!/usr/bin/env python3
"""Writes test/pages/apps-home.html: Community Applications' home page (sections of cards) as its
Narrow skin builds it (skins/Narrow/skin.php displayCard(), include/exec.php for the sections),
with the rules of skins/Narrow/css.php that lay the cards out, for the white and black themes.

Also writes test/pages/apps-home-wrapped.html: the same cards as CA 2026.07.21 (the version
Unraid 7.3 installs, github.com/unraid/community.applications, archive/*.txz) builds them: each
card and its flag wrapped in an anonymous <div>, the flag BEFORE the card, the buttons with
caButton, and that version's card and flag rules (styles/community.applications.css).

    python3 test/tools/ca-home.py /path/to/community.applications/skins/Narrow/css.php
"""
import re
import sys
from pathlib import Path

css_php = Path(sys.argv[1]).read_text()
body = css_php.split('?>', 1)[1]

def theme_vars(name):
    block = re.search(r"case '%s':(.*?)break;" % name, css_php, re.S).group(1)
    values = dict(re.findall(r'\$(\w+)\s*=\s*"([^"]*)"', block))
    values.update(dict(re.findall(r'^\$(\w+)\s*=\s*"([^"]*)";', css_php, re.M)))
    return values

SELECTORS = re.compile(r'^(?:img|i)?\.(ca_holder|ca_homeTemplates|ca_iconArea|ca_displayIcon|ca_applicationName|ca_author|cardCategory|'
                       r'ca_backgroundClickable|ca_bottomLine|infoButton|supportButton|actionsButton|appDocker|appPlugin|'
                       r'cardDescription|cardDesc|favCardBackground|pinnedCard|\w+CardBackground|installedCardText|ca_center|'
                       r'homespotlightIconArea|spotlightIcon|spotlightDate|spotlightHome|caHomeSpotlight|cardWarning|ca_fa-comment|'
                       r'homeMore|mobileHolderFix|ca_appPopup|displayIcon)\b')
lines = [l for l in body.splitlines() if SELECTORS.match(l)]

def render(values):
    return [re.sub(r'<\?=\$(\w+);?\?>', lambda m: values[m.group(1)], l) for l in lines]

white, black = render(theme_vars('white')), render(theme_vars('black'))
css = list(white)
for w, b in zip(white, black):
    if w != b:
        sel, rest = b.split('{', 1)
        css.append(','.join('html.Theme--black ' + s.strip() for s in sel.split(',')) + '{' + rest)

def svg(color, letter):
    return ("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='"
            + color.replace('#', '%23') + "'/%3E%3Ctext x='32' y='43' font-family='Arial' font-size='30' font-weight='700' fill='white' text-anchor='middle'%3E"
            + letter + "%3C/text%3E%3C/svg%3E")

SPOT = ("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'%3E%3Ccircle cx='60' cy='60' r='50' fill='%23ff8c2f' opacity='.35'/%3E"
        "%3Ccircle cx='60' cy='60' r='40' fill='white' stroke='%23ff5722' stroke-width='4'/%3E%3Ctext x='60' y='58' font-family='Arial' font-size='11' font-weight='700' "
        "text-anchor='middle'%3EMONTHLY%3C/text%3E%3Ctext x='60' y='72' font-family='Arial' font-size='11' font-weight='700' text-anchor='middle'%3ESPOTLIGHT%3C/text%3E%3C/svg%3E")

FLAGS = {
    'official': ('officialCardBackground', 'This is an official container', 'OFFICIAL'),
    'installed': ('installedCardBackground', '', '&nbsp;&nbsp;INSTALLED&nbsp;&nbsp;'),
    'updated': ('betaCardBackground', '', 'UPDATED'),
    'limetech': ('LTOfficialCardBackground', 'This is an offical plugin', 'LIMETECH'),
    'deprecated': ('warningCardBackground', 'This application template has been deprecated', 'Deprecated&nbsp;'),
}

WRAPPED = False

def card(name, author, category, overview, color, flag=None, plugin=False, comment=False, spotlight=None, action='Installer'):
    out = ("<div class='ca_holder spotlightHome ca_appPopup ' data-apppath='/tmp/%s.xml' data-appname='%s' data-repository='%s'>"
           "<div class='ca_bottomLine ca_bottomLineSpotLight'><div class='infoButton ca_appPopup'>Info</div>"
           "<div class='supportButton'><span class='ca_href' data-href='#' data-target='_blank'>Support</span></div>"
           "<div class='actionsButton' data-pluginURL='' data-languagePack='' onclick=void(0)>%s</div>"
           "<span class='%s' title='This application is a %s'></span>"
           "<span class='favCardBackground' data-repository='%s' style='display:none;'></span>"
           "<span class='pinnedCard' title='This application is pinned for later viewing' data-pindata='x' style='display:none;'></span></div>"
           "<div class='ca_appPopup ca_backgroundClickable'><div class='ca_iconArea'><img class='ca_displayIcon ' src=\"%s\" alt='Application Icon'></img></div>"
           "<div class='ca_applicationName'>%s%s</div><div class='ca_author'>%s</div><div class='cardCategory'>%s</div></div>"
           "<div class='cardDescription ca_backgroundClickable'><div class='cardDesc'>%s</div></div>") % (
        name, name, author, action, 'appPlugin' if plugin else 'appDocker', 'plugin' if plugin else 'docker container', author,
        svg(color, name[0].upper()), name,
        "&nbsp;<span class='ca_fa-comment cardWarning' title='Click info to see the notes regarding this application'></span>" if comment else '',
        author, category, overview)
    if spotlight:
        out += ("<div class='homespotlightIconArea ca_center''><div><img class='spotlightIcon' src=\"%s\" alt='Spotlight'></img></div>"
                "<div class='spotlightDate'>%s</div></div>") % (SPOT, spotlight)
    out += "</div>"
    mark = ''
    if flag:
        cls, title, text = FLAGS[flag]
        mark = "<div class='%s'><div class='installedCardText ca_center'%s>%s</div></div>" % (cls, " title='%s'" % title if title else '', text)
    if WRAPPED:
        out = out.replace("class='infoButton ", "class='caButton infoButton ").replace("class='supportButton'", "class='caButton supportButton'")
        out = out.replace("class='actionsButton'", "class='caButton actionsButton'")
        return "<div>%s %s</div>" % (mark, out)
    return out + mark

LONG = ("Backs up a Supabase project's Postgres database, and optionally its Storage files, to an S3, Cloudflare R2 or Backblaze B2 "
        "bucket you own. Each snapshot includes a manifest.json with estimated table row counts and SHA-256 checksums for every file.")
def section(title, line, cards):
    return ("<div class='ca_homeTemplatesHeader'>%s</div><div class='ca_homeTemplatesLine2'>%s <span class='homeMore' data-des='%s'>AFFICHER PLUS</div>"
            "<div class='ca_homeTemplates caHomeSpotlight'>%s</div>") % (title, line, title, ''.join(cards))

def cards():
    recent = [
        card('BackupDrill', 'Official Container', 'Backup', LONG, '#0f172a', flag='official'),
        card('patchmon-guacd', "louij2's Repository", 'Tools', 'Apache Guacamole daemon for PatchMon remote sessions (part 3 of 4). Joins the network patchmon with the DNS alias guacd. Read-only root filesystem, all capabilities dropped.', '#4d7c0f', comment=True),
        card('controlarr', "Plzm1ssles's Repository", 'Tools', 'Stops, starts and restarts your other containers at set times of day, using the 24-hour clock. When several start together they go one at a time in your chosen order.', '#7c2d12', flag='installed'),
        card('notifyarr', "Plzm1ssles's Repository", 'Tools', 'Alerts for your Docker containers and Unraid server, sent to Telegram and/or email: crashes, unhealthy containers, error logs, security events.', '#1e3a8a', flag='updated', action='Mettre à jour'),
        card('old-app', 'someone', 'Other', 'A plugin whose template is deprecated.', '#525252', flag='deprecated', plugin=True),
    ]
    spot = [
        card('frigate', "yayitazale's Repository", 'HomeAutomation', 'A complete and local NVR designed for Home Assistant with AI object detection. Uses OpenCV and Tensorflow to perform realtime object detection locally for IP cameras.', '#0369a1', spotlight='oct. 2026'),
        card('binhex-crafty-4', "Binhex's Repository", 'GameServers', 'Crafty Controller is a free and open-source Minecraft launcher and manager that allows users to start and administer Minecraft servers from a user-friendly interface.', '#6d28d9', flag='limetech', spotlight='sept. 2026'),
        card('EmbyServer', 'Official Container', 'MediaServer', 'Emby Server is a home media server built on top of other popular open source technologies such as Service Stack, jQuery, jQuery mobile, and Mono.', '#15803d', flag='official', spotlight='juil. 2026'),
    ]
    return recent, spot

menu = ''.join("<li class='caMenuItem %s'>%s</li>" % c for c in [
    ('caMenuEnabled selectedMenu', 'Accueil'), ('caMenuEnabled', 'Applications Installées'), ('caMenuEnabled', 'Applications Précédentes'),
    ('caMenuDisabled', 'Applications Épinglées'), ('', '<hr>'), ('caMenuEnabled', 'AI'), ('caMenuEnabled', 'Applications Media'),
    ('caMenuEnabled', 'Autre'), ('caMenuEnabled', 'Cloud'), ('caMenuEnabled', 'Domotique'), ('caMenuEnabled', 'Outils / Utilitaires')])

PAGE = """page: Apps
active: Apps
---
<!-- Generated by test/tools/ca-home.py: Community Applications' home page (Narrow skin, CA of
     %s. -->
<style>
.ca_homeTemplatesHeader{font-size:2rem;margin-top:1rem;margin-bottom:0.5rem;}
.ca_homeTemplatesLine2{font-size:1.5rem;margin-bottom:1rem;}
%s
%s
</style>
<div id="displaybox">
<div class="content">
<!-- CA places the menu and the main area side by side (absolutely); a flex row here. -->
<div style="display:flex;gap:2.4rem;align-items:flex-start">
<div class='menuItems'><ul class='caMenu'>%s</ul></div>
<div class='mainArea' style='flex:1;min-width:0'>
<div id='templates_content'>%s%s</div>
</div>
</div>
</div>
</div>
"""

COMMENT = ("August 2026). Every card has CA's real markup: the buttons are .infoButton / .supportButton /\n"
           "     .actionsButton, the bottom line is moved down with position:relative, and the status flag is\n"
           "     a sibling right after its card, pulled back over the card's corner (left:-10rem)")
COMMENT_WRAPPED = ("2026.07.21, github.com/unraid/community.applications, the version Unraid 7.3 installs). Each\n"
                   "     card and its status flag are wrapped in an anonymous <div>, the flag BEFORE the card\n"
                   "     (inline-block, pulled left by 10rem); the buttons carry caButton")
# CA 2026.07.21's rules for the cards and flags (styles/community.applications.css) on top of css.php's
CSS_WRAPPED = """.ca_holder,.dockerHubHolder{display:inline-block;float:left;height:20rem;width:24rem;padding:1.25rem 0.625rem 1.25rem 1.25rem;margin:0 1rem 1rem 0;font-size:1.2rem;overflow:hidden;cursor:pointer;}
.ca_homeTemplates{display:flex;flex-wrap:nowrap;height:29.5rem;overflow-x:auto;overflow-y:hidden;}
.spotlightHome{width:36rem !important;height:24rem !important;margin-bottom:1rem;}
.officialCardBackground,.LTOfficialCardBackground,.spotlightCardBackground,.warningCardBackground,.betaCardBackground,.greenCardBackground,.installedCardBackground{clip-path:polygon(0 0,100% 0,100% 100%);top:0px;height:9rem;width:9rem;position:relative;display:inline-block;left:-10rem;margin-right:-9rem;}
.installedCardText{position:absolute;transform:rotate(45deg);color:#fff;font-size:1.1rem;top:2rem;right:0rem;width:6rem;overflow:hidden;z-index:9999;}"""

for name, wrapped, comment, extra in (('apps-home', False, COMMENT, ''), ('apps-home-wrapped', True, COMMENT_WRAPPED, CSS_WRAPPED)):
    WRAPPED = wrapped
    recent, spot = cards()
    page = PAGE % (comment, '\n'.join(css), extra, menu,
                   section('Récemment ajouté', 'Découvrir ces applications nouvellement ajoutées de notre communauté géniale', recent),
                   section('Apps en vedette', 'Chaque mois, nous mettons en évidence certains des travaux incroyables de notre communauté', spot))
    Path(__file__).resolve().parent.parent.joinpath('pages', name + '.html').write_text(page)
    print('wrote test/pages/%s.html,' % name, len(css), 'CA rules')
