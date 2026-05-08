<?php
/**
 * Plugin Name: SEO Autofill
 * Description: Safe scan/update REST API for filling missing WooCommerce and Yoast SEO fields. Designed to be driven by an external agent.
 * Version: 0.1.1
 * Requires PHP: 7.4
 * Requires at least: 6.0
 * Author: SEO Autofill
 * License: GPL-2.0-or-later
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'SEO_AUTOFILL_VERSION', '0.1.1' );
define( 'SEO_AUTOFILL_NAMESPACE', 'seo-autofill/v1' );
define( 'SEO_AUTOFILL_TOKEN_OPTION', 'seo_autofill_token' );

function seo_autofill_generate_token() {
	return bin2hex( random_bytes( 32 ) );
}

function seo_autofill_check_permission( $request ) {
	$auth_header = $request->get_header( 'authorization' );
	if ( empty( $auth_header ) || stripos( $auth_header, 'Bearer ' ) !== 0 ) {
		return new WP_Error( 'seo_autofill_missing_auth', 'Bearer token required.', array( 'status' => 401 ) );
	}

	$presented = trim( substr( $auth_header, 7 ) );
	$expected  = (string) get_option( SEO_AUTOFILL_TOKEN_OPTION, '' );
	if ( $expected === '' || ! hash_equals( $expected, $presented ) ) {
		return new WP_Error( 'seo_autofill_invalid_token', 'Invalid token.', array( 'status' => 403 ) );
	}

	return true;
}

add_action( 'admin_menu', function () {
	add_options_page( 'SEO Autofill', 'SEO Autofill', 'manage_options', 'seo-autofill', 'seo_autofill_render_admin' );
} );

function seo_autofill_render_admin() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}

	if ( isset( $_POST['seo_autofill_rotate_token'] ) && check_admin_referer( 'seo_autofill_rotate' ) ) {
		$token = seo_autofill_generate_token();
		update_option( SEO_AUTOFILL_TOKEN_OPTION, $token );
		echo '<div class="notice notice-success"><p>New token generated. Copy it now:</p><p><code>' . esc_html( $token ) . '</code></p></div>';
	}

	$token = (string) get_option( SEO_AUTOFILL_TOKEN_OPTION, '' );
	?>
	<div class="wrap">
		<h1>SEO Autofill</h1>
		<h2>Token</h2>
		<p>Status: <?php echo $token === '' ? '<strong>not set</strong>' : '<strong>set (hidden)</strong>'; ?></p>
		<form method="post">
			<?php wp_nonce_field( 'seo_autofill_rotate' ); ?>
			<p><button type="submit" name="seo_autofill_rotate_token" class="button button-primary">Generate / Rotate Token</button></p>
		</form>
		<h2>Endpoints</h2>
		<ul>
			<li><code>GET <?php echo esc_html( rest_url( SEO_AUTOFILL_NAMESPACE . '/scan' ) ); ?></code></li>
			<li><code>POST <?php echo esc_html( rest_url( SEO_AUTOFILL_NAMESPACE . '/updates/batch' ) ); ?></code></li>
		</ul>
	</div>
	<?php
}

add_action( 'rest_api_init', function () {
	register_rest_route( SEO_AUTOFILL_NAMESPACE, '/scan', array(
		'methods'             => 'GET',
		'callback'            => 'seo_autofill_scan',
		'permission_callback' => 'seo_autofill_check_permission',
		'args'                => array(
			'page'     => array( 'type' => 'integer', 'default' => 1 ),
			'per_page' => array( 'type' => 'integer', 'default' => 50 ),
			'status'   => array( 'type' => 'string', 'default' => 'publish,draft' ),
		),
	) );

	register_rest_route( SEO_AUTOFILL_NAMESPACE, '/updates/batch', array(
		'methods'             => 'POST',
		'callback'            => 'seo_autofill_batch_update',
		'permission_callback' => 'seo_autofill_check_permission',
	) );
} );

function seo_autofill_scan( $request ) {
	if ( ! function_exists( 'wc_get_product' ) ) {
		return new WP_Error( 'seo_autofill_woocommerce_missing', 'WooCommerce is not active.', array( 'status' => 500 ) );
	}

	$page     = max( 1, (int) $request->get_param( 'page' ) );
	$per_page = min( 100, max( 1, (int) $request->get_param( 'per_page' ) ) );
	$status   = array_filter( array_map( 'sanitize_key', explode( ',', (string) $request->get_param( 'status' ) ) ) );
	if ( empty( $status ) ) {
		$status = array( 'publish', 'draft' );
	}

	$query = new WP_Query( array(
		'post_type'      => 'product',
		'post_status'    => $status,
		'posts_per_page' => $per_page,
		'paged'          => $page,
		'orderby'        => 'ID',
		'order'          => 'ASC',
		'fields'         => 'ids',
		'no_found_rows'  => false,
	) );

	$items = array();
	foreach ( $query->posts as $product_id ) {
		$item = seo_autofill_build_scan_item( (int) $product_id );
		if ( $item ) {
			$items[] = $item;
		}
	}

	return rest_ensure_response( array(
		'page'        => $page,
		'per_page'    => $per_page,
		'total'       => (int) $query->found_posts,
		'total_pages' => (int) $query->max_num_pages,
		'items'       => $items,
	) );
}

function seo_autofill_build_scan_item( $product_id ) {
	$product = wc_get_product( $product_id );
	if ( ! $product ) {
		return null;
	}

	$current = array(
		'description'       => (string) $product->get_description(),
		'short_description' => (string) $product->get_short_description(),
		'yoast_title'       => (string) get_post_meta( $product_id, '_yoast_wpseo_title', true ),
		'yoast_metadesc'    => (string) get_post_meta( $product_id, '_yoast_wpseo_metadesc', true ),
	);

	$missing = array();
	foreach ( array_keys( $current ) as $field ) {
		if ( trim( $current[ $field ] ) === '' ) {
			$missing[] = $field;
		}
	}

	return array(
		'id'             => $product_id,
		'sku'            => (string) $product->get_sku(),
		'name'           => (string) $product->get_name(),
		'permalink'      => (string) get_permalink( $product_id ),
		'type'           => (string) $product->get_type(),
		'categories'     => seo_autofill_terms( $product_id, 'product_cat' ),
		'tags'           => seo_autofill_terms( $product_id, 'product_tag' ),
		'attributes'     => seo_autofill_attributes( $product ),
		'image_alt'      => seo_autofill_image_alt( $product ),
		'current'        => $current,
		'missing_fields' => $missing,
	);
}

function seo_autofill_terms( $product_id, $taxonomy ) {
	$terms = get_the_terms( $product_id, $taxonomy );
	if ( ! is_array( $terms ) ) {
		return array();
	}
	return array_values( array_map( function ( $term ) {
		return array( 'name' => $term->name, 'slug' => $term->slug );
	}, $terms ) );
}

function seo_autofill_attributes( $product ) {
	$out = array();
	foreach ( $product->get_attributes() as $attribute ) {
		$name   = method_exists( $attribute, 'get_name' ) ? wc_attribute_label( $attribute->get_name() ) : '';
		$values = method_exists( $attribute, 'get_options' ) ? $attribute->get_options() : array();
		if ( method_exists( $attribute, 'is_taxonomy' ) && $attribute->is_taxonomy() ) {
			$values = wp_get_post_terms( $product->get_id(), $attribute->get_name(), array( 'fields' => 'names' ) );
		}
		$out[] = array(
			'name'   => $name,
			'values' => array_values( array_filter( array_map( 'strval', (array) $values ) ) ),
		);
	}
	return $out;
}

function seo_autofill_image_alt( $product ) {
	$ids = array_filter( array_merge( array( $product->get_image_id() ), (array) $product->get_gallery_image_ids() ) );
	$out = array();
	foreach ( $ids as $id ) {
		$alt = trim( (string) get_post_meta( $id, '_wp_attachment_image_alt', true ) );
		if ( $alt !== '' ) {
			$out[] = $alt;
		}
	}
	return array_values( array_unique( $out ) );
}

function seo_autofill_batch_update( $request ) {
	$body = $request->get_json_params();
	if ( ! is_array( $body ) ) {
		return new WP_Error( 'seo_autofill_bad_body', 'JSON body required.', array( 'status' => 400 ) );
	}

	$run_id  = isset( $body['run_id'] ) ? sanitize_text_field( $body['run_id'] ) : '';
	$dry_run = ! empty( $body['dry_run'] );
	$updates = isset( $body['updates'] ) && is_array( $body['updates'] ) ? $body['updates'] : array();
	$results = array();

	foreach ( $updates as $update ) {
		$product_id = isset( $update['product_id'] ) ? (int) $update['product_id'] : 0;
		$fields     = isset( $update['fields'] ) && is_array( $update['fields'] ) ? $update['fields'] : array();
		$product    = $product_id > 0 && function_exists( 'wc_get_product' ) ? wc_get_product( $product_id ) : null;
		$result     = array( 'product_id' => $product_id, 'fields' => array() );

		if ( ! $product ) {
			$result['error'] = 'product_not_found';
			$results[]       = $result;
			continue;
		}

		$dirty = false;
		foreach ( $fields as $field => $value ) {
			if ( ! in_array( $field, array( 'description', 'short_description', 'yoast_title', 'yoast_metadesc' ), true ) ) {
				$result['fields'][ $field ] = array( 'status' => 'error', 'reason' => 'unknown_field' );
				continue;
			}

			$current = seo_autofill_read_field( $product, $product_id, $field );
			if ( trim( (string) $current ) !== '' ) {
				$result['fields'][ $field ] = array( 'status' => 'skipped', 'reason' => 'existing_value' );
				continue;
			}

			$value = is_string( $value ) ? $value : '';
			if ( trim( $value ) === '' ) {
				$result['fields'][ $field ] = array( 'status' => 'skipped', 'reason' => 'empty_value' );
				continue;
			}

			if ( ! $dry_run ) {
				seo_autofill_write_field( $product, $product_id, $field, $value );
				if ( $field === 'description' || $field === 'short_description' ) {
					$dirty = true;
				}
			}
			$result['fields'][ $field ] = array( 'status' => 'applied', 'dry_run' => $dry_run );
		}

		if ( $dirty && ! $dry_run ) {
			$product->save();
		}
		$results[] = $result;
	}

	return rest_ensure_response( array( 'run_id' => $run_id, 'dry_run' => $dry_run, 'results' => $results ) );
}

function seo_autofill_read_field( $product, $product_id, $field ) {
	if ( $field === 'description' ) {
		return (string) $product->get_description();
	}
	if ( $field === 'short_description' ) {
		return (string) $product->get_short_description();
	}
	if ( $field === 'yoast_title' ) {
		return (string) get_post_meta( $product_id, '_yoast_wpseo_title', true );
	}
	if ( $field === 'yoast_metadesc' ) {
		return (string) get_post_meta( $product_id, '_yoast_wpseo_metadesc', true );
	}
	return '';
}

function seo_autofill_write_field( $product, $product_id, $field, $value ) {
	if ( $field === 'description' ) {
		$product->set_description( $value );
	} elseif ( $field === 'short_description' ) {
		$product->set_short_description( $value );
	} elseif ( $field === 'yoast_title' ) {
		update_post_meta( $product_id, '_yoast_wpseo_title', $value );
	} elseif ( $field === 'yoast_metadesc' ) {
		update_post_meta( $product_id, '_yoast_wpseo_metadesc', $value );
	}
}
