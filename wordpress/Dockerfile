# WebX's WordPress engine — stock WordPress plus the mu-plugins that make it
# usable as a headless multi-tenant content backend (multi-tenancy via the
# wtenant taxonomy, the custom post types ORST/RoyalSociety actually use,
# and their ACF field groups — see each file under mu-plugins/ for what it
# does). Extracted from the dev proof-of-concept instance (docker
# cp'd out of its wp-content/mu-plugins/ volume) so it's reproducible from a
# clean deploy instead of living only in one machine's Docker volume.
#
# mu-plugins are "must-use" — WordPress auto-loads every file directly under
# wp-content/mu-plugins/ with no activation step, unlike a normal plugin.
#
# ACF (Advanced Custom Fields, free tier) is a real WordPress.org plugin the
# field groups in mu-plugins/acf-fields.php depend on — vendored here at a
# pinned version rather than trusting whatever "activate from wp-admin" gives
# you later, and still needs `wp plugin activate` once WordPress itself is
# installed (see ../wordpress/bootstrap.sh — a normal plugin, unlike an
# mu-plugin, needs that explicit activation).
FROM wordpress:latest

ARG ACF_VERSION=6.8.8
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends unzip; \
    rm -rf /var/lib/apt/lists/*; \
    curl -fsSL -o /tmp/acf.zip "https://downloads.wordpress.org/plugin/advanced-custom-fields.${ACF_VERSION}.zip"; \
    mkdir -p /usr/src/wordpress/wp-content/plugins; \
    unzip -q /tmp/acf.zip -d /usr/src/wordpress/wp-content/plugins; \
    rm /tmp/acf.zip

# Copied into /usr/src/wordpress (not /var/www/html directly): the official
# entrypoint only seeds an EMPTY /var/www/html from /usr/src/wordpress on a
# volume's first boot, same as it does for WordPress core itself — matches
# how this image is meant to be used, and doesn't clobber an existing
# deployment's volume on a later image rebuild.
#
# Deploying a NEW or CHANGED mu-plugin file to an EXISTING deployment's
# volume needs a manual step beyond rebuilding this image — see DEPLOY.md's
# production checklist.
COPY mu-plugins/ /usr/src/wordpress/wp-content/mu-plugins/
