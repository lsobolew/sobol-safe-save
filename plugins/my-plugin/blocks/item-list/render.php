<?php
/**
 * Server rendering for the "Item list" block.
 *
 * WordPress calls this file with $attributes, $content and $block in scope.
 *
 * @package MyVendor\MyPlugin
 */

declare( strict_types=1 );

defined( 'ABSPATH' ) || exit;

use MyVendor\MyPlugin\Core\Settings;
use MyVendor\MyPlugin\Modules\ContentType\Module as ContentType;

if ( ! class_exists( ContentType::class ) || ! post_type_exists( ContentType::POST_TYPE ) ) {
	return;
}

$my_plugin_limit = isset( $attributes['limit'] )
	? max( 1, (int) $attributes['limit'] )
	: (int) Settings::get( 'items_per_page', 10 );

$my_plugin_items = get_posts(
	array(
		'post_type'      => ContentType::POST_TYPE,
		'post_status'    => 'publish',
		'posts_per_page' => $my_plugin_limit,
	)
);

if ( ! $my_plugin_items ) {
	printf(
		'<p %1$s>%2$s</p>',
		wp_kses_data( get_block_wrapper_attributes() ),
		esc_html__( 'No items to show.', 'my-plugin' )
	);

	return;
}
?>
<ul <?php echo wp_kses_data( get_block_wrapper_attributes( array( 'class' => 'my-plugin-item-list' ) ) ); ?>>
	<?php foreach ( $my_plugin_items as $my_plugin_item ) : ?>
		<li>
			<a href="<?php echo esc_url( (string) get_permalink( $my_plugin_item ) ); ?>">
				<?php echo esc_html( get_the_title( $my_plugin_item ) ); ?>
			</a>
		</li>
	<?php endforeach; ?>
</ul>
