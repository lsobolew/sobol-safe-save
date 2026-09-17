# syntax=docker/dockerfile:1
ARG PHP_VERSION=8.3
FROM php:${PHP_VERSION}-apache

ARG PHP_VERSION
ENV DEBIAN_FRONTEND=noninteractive \
    WPLAB_IMAGE=1

# Images for older PHP versions sit on end-of-life Debian releases. Their debian-security pool
# disappears from deb.debian.org while `apt-get update` itself still succeeds - so the decision is
# made on the release codename rather than on an error: for EOL releases keep only main from
# archive.debian.org.
RUN set -eux; \
    . /etc/os-release; \
    case "${VERSION_CODENAME:-}" in \
        jessie|stretch|buster|bullseye) \
            echo "Debian ${VERSION_CODENAME} is EOL - repointing apt at archive.debian.org"; \
            printf 'deb http://archive.debian.org/debian %s main\n' "${VERSION_CODENAME}" \
                > /etc/apt/sources.list; \
            rm -f /etc/apt/sources.list.d/*.list /etc/apt/sources.list.d/*.sources; \
            printf 'Acquire::Check-Valid-Until "false";\n' \
                > /etc/apt/apt.conf.d/99no-check-valid-until; \
            ;; \
    esac; \
    apt-get update -qq; \
    apt-get install -y --no-install-recommends \
        ca-certificates curl git less unzip zip rsync jq msmtp util-linux \
        default-mysql-client \
        libzip-dev libpng-dev libjpeg-dev libfreetype6-dev libicu-dev libonig-dev \
    ; \
    rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    docker-php-ext-configure gd --with-freetype --with-jpeg; \
    docker-php-ext-install -j"$(nproc)" mysqli gd zip intl opcache exif bcmath

# Xdebug 3.1.x is the last line supporting PHP 7.4; newer PHP versions take the latest release.
RUN set -eux; \
    case "${PHP_VERSION}" in \
        7.*)  XDEBUG_PKG="xdebug-3.1.6" ;; \
        8.0*) XDEBUG_PKG="xdebug-3.1.6" ;; \
        *)    XDEBUG_PKG="xdebug" ;; \
    esac; \
    pecl install "${XDEBUG_PKG}"; \
    docker-php-ext-enable xdebug; \
    rm -rf /tmp/pear

COPY --from=composer:2 /usr/bin/composer /usr/local/bin/composer

RUN set -eux; \
    curl -fsSL -o /usr/local/bin/wp \
        https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar; \
    chmod +x /usr/local/bin/wp; \
    wp --allow-root --version

COPY conf/php.ini /usr/local/etc/php/conf.d/zz-wplab.ini
COPY conf/xdebug.ini /usr/local/etc/php/conf.d/zzz-xdebug.ini
COPY conf/vhost.conf /etc/apache2/sites-available/000-default.conf
COPY conf/msmtprc /etc/msmtprc
COPY bin/ /usr/local/wplab/

RUN set -eux; \
    a2enmod rewrite headers; \
    chmod +x /usr/local/wplab/*.sh; \
    chown root:root /etc/msmtprc; \
    chmod 600 /etc/msmtprc; \
    echo "ServerName localhost" > /etc/apache2/conf-available/servername.conf; \
    a2enconf servername

ENV PATH="/usr/local/wplab:${PATH}"
WORKDIR /var/www/html

ENTRYPOINT ["/usr/local/wplab/entrypoint.sh"]
CMD ["apache2-foreground"]
