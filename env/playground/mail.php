<?php
/**
 * Plugin Name: Lab Playground Mail
 * Description: Routes sandbox WordPress mail to its isolated Mailpit instance.
 *
 * @package WPPluginLab
 */

add_filter(
	'wp_mail_from',
	static function ( $address ) {
		return 'wordpress@localhost' === $address ? 'wordpress@example.test' : $address;
	}
);

add_action(
	'phpmailer_init',
	static function ( $mailer ) {
		$mailer->isSMTP();
		// PHPMailer defines these public property names.
		// phpcs:disable WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase
		$mailer->Host        = 'mailpit';
		$mailer->Port        = 1025;
		$mailer->SMTPAuth    = false;
		$mailer->SMTPAutoTLS = false;
		// phpcs:enable WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase
	}
);
