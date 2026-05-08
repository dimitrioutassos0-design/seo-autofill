<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! class_exists( 'SEO_Autofill_Scan', false ) ) {

class SEO_Autofill_Scan {

	const TARGET_FIELDS = array( 'description', 'short_description', 'yoast_title', 'yoast_metadesc' );

	public function run( WP_REST_Request $request ) {
		$page     = max( 1, (int) $request->get_param( 'page' ) );
		$per_page = min( 100, max( 1, (int) $request->get_param( 'per_page' ) ) );
		$status   = array_filter( array_map( 'sanitize_key', explode( ',', (string) $request->get_param( 'status' ) ) ) );
		if ( empty( $status ) ) {
			$status = array( 'publish', 'draft' );
		}

		$args = array(
			'post_type'      => 'product',
			'post_status'    => $status,
			'posts_per_page' => $per_page,
			'paged'          => $page,
			'orderby'        => 'ID',
			'order'          => 'ASC',
			'fields'         => 'ids',
			'no_found_rows'  => false,
		);

		$since = $request->get_param( 'since' );
		if ( ! empty( $since ) ) {
			$args['date_query'] = array(
				array(
					'column' => 'post_modified_gmt',
					'after'  => sanitize_text_field( $since ),
				),
			);
		}

		$query = new WP_Query( $args );
		$items = array();

		foreach ( $query->posts as $product_id ) {
			$item = $this->build_item( (int) $product_id );
			if ( $item !== null ) {
				$items[] = $item;
			}
		}

		return array(
			'page'        => $page,
			'per_page'    => $per_page,
			'total'       => (int) $query->found_posts,
			'total_pages' => (int) $query->max_num_pages,
			'items'       => $items,
		);
	}

	private function build_item( $product_id ) {
		if ( ! function_exists( 'wc_get_product' ) ) {
			return null;
		}
		$product = wc_get_product( $product_id );
		if ( ! $product ) {
			return null;
		}

		$description       = (string) $product->get_description();
		$short_description = (string) $product->get_short_description();
		$yoast_title       = (string) get_post_meta( $product_id, '_yoast_wpseo_title', true );
		$yoast_metadesc    = (string) get_post_meta( $product_id, '_yoast_wpseo_metadesc', true );

		$current = array(
			'description'       => $description,
			'short_description' => $short_description,
			'yoast_title'       => $yoast_title,
			'yoast_metadesc'    => $yoast_metadesc,
		);

		$missing = array();
		foreach ( self::TARGET_FIELDS as $field ) {
			if ( trim( (string) $current[ $field ] ) === '' ) {
				$missing[] = $field;
			}
		}

		return array(
			'id'             => $product_id,
			'sku'            => (string) $product->get_sku(),
			'name'           => (string) $product->get_name(),
			'permalink'      => (string) get_permalink( $product_id ),
			'type'           => (string) $product->get_type(),
			'categories'     => $this->terms( $product_id, 'product_cat' ),
			'tags'           => $this->terms( $product_id, 'product_tag' ),
			'attributes'     => $this->attributes( $product ),
			'image_alt'      => $this->image_alt( $product ),
			'current'        => $current,
			'missing_fields' => $missing,
		);
	}

	private function terms( $product_id, $taxonomy ) {
		$terms = get_the_terms( $product_id, $taxonomy );
		if ( ! is_array( $terms ) ) {
			return array();
		}
		return array_values( array_map( function ( $t ) {
			return array( 'name' => $t->name, 'slug' => $t->slug );
		}, $terms ) );
	}

	private function attributes( $product ) {
		$out = array();
		foreach ( $product->get_attributes() as $attribute ) {
			if ( ! ( $attribute instanceof WC_Product_Attribute ) ) {
				continue;
			}
			$name = wc_attribute_label( $attribute->get_name() );
			if ( $attribute->is_taxonomy() ) {
				$values = wp_get_post_terms( $product->get_id(), $attribute->get_name(), array( 'fields' => 'names' ) );
				$values = is_array( $values ) ? $values : array();
			} else {
				$values = $attribute->get_options();
			}
			$out[] = array(
				'name'   => $name,
				'values' => array_values( array_filter( array_map( 'strval', (array) $values ) ) ),
			);
		}
		return $out;
	}

	private function image_alt( $product ) {
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
}

}
