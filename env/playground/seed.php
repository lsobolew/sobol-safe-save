<?php
/**
 * Idempotent fixtures. Existing accounts and content are never updated.
 *
 * @package WPPluginLab
 */

( static function () {
	$check = static function ( $result ) {
		if ( is_wp_error( $result ) ) {
			WP_CLI::error( $result->get_error_message() );
		}
		return $result;
	};
	$roles = array(
		'admin2'      => 'administrator',
		'editor'      => 'editor',
		'author'      => 'author',
		'contributor' => 'contributor',
		'subscriber'  => 'subscriber',
	);
	foreach ( $roles as $login => $role ) {
		$user = get_user_by( 'login', $login );
		if ( ! $user ) {
			$id = $check(
				wp_insert_user(
					array(
						'user_login' => $login,
						'user_pass'  => 'password',
						'user_email' => $login . '@playground.test',
						'role'       => $role,
					)
				)
			);
			update_user_meta( $id, '_wplab_playground_seed', $login );
		}
	}
	// Persist IDs as well as post meta, so edits, moves to trash and slug changes do not create copies.
	$fixtures = get_option( '_wplab_playground_fixtures', array() );
	$post     = static function ( $key, $data ) use ( &$fixtures, $check ) {
		if ( isset( $fixtures[ $key ] ) ) {
			return $fixtures[ $key ];
		}
		$id = $check( wp_insert_post( $data, true ) );
		update_post_meta( $id, '_wplab_playground_seed', $key );
		$fixtures[ $key ] = $id;
		update_option( '_wplab_playground_fixtures', $fixtures, false );
		return $id;
	};
	foreach ( array( 'editor', 'author', 'contributor', 'admin' ) as $login ) {
		$user = get_user_by( 'login', $login );
		if ( ! $user ) {
			continue;
		}
		for ( $i = 1; $i <= 3; $i++ ) {
			$post(
				"post-$login-$i",
				array(
					'post_type'    => 'post',
					'post_title'   => "$login example $i",
					'post_content' => '<!-- wp:paragraph --><p>Playground sample content.</p><!-- /wp:paragraph -->',
					'post_author'  => $user->ID,
					'post_status'  => 'contributor' === $login ? 'pending' : 'publish',
				)
			);
		}
	}
	foreach ( array( 'About', 'Contact' ) as $title ) {
		$post(
			'page-' . $title,
			array(
				'post_type'   => 'page',
				'post_title'  => $title,
				'post_status' => 'publish',
			)
		);
	}
	foreach ( array(
		'tutorials' => 'category',
		'releases'  => 'category',
		'icons'     => 'post_tag',
	) as $slug => $taxonomy ) {
		if ( ! isset( $fixtures[ 'term-' . $slug ] ) ) {
			$term = term_exists( $slug, $taxonomy );
			if ( ! $term ) {
				$term = $check( wp_insert_term( ucfirst( $slug ), $taxonomy, array( 'slug' => $slug ) ) );
			}
			$fixtures[ 'term-' . $slug ] = $term;
			update_option( '_wplab_playground_fixtures', $fixtures, false );
		}
	}
	foreach ( array(
		'approved' => 1,
		'pending'  => 0,
	) as $name => $approved ) {
		$key = 'comment-' . $name;
		if ( ! isset( $fixtures[ $key ] ) && ! empty( $fixtures['post-admin-1'] ) && get_post( $fixtures['post-admin-1'] ) ) {
			$id = wp_insert_comment(
				array(
					'comment_post_ID'      => $fixtures['post-admin-1'],
					'comment_content'      => "$name example comment",
					'comment_author'       => 'Reader',
					'comment_author_email' => 'reader@playground.test',
					'comment_approved'     => $approved,
				)
			);
			if ( ! $id ) {
				WP_CLI::error( 'Could not seed comment.' );
			}
			$fixtures[ $key ] = $id;
			update_option( '_wplab_playground_fixtures', $fixtures, false );
		}
	}
	WP_CLI::success( 'Playground fixtures ready; existing data preserved.' );
} )();
