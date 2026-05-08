<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! class_exists( 'SEO_Autofill_Updater', false ) ) {

class SEO_Autofill_Updater {

	const ALLOWED_FIELDS = array( 'description', 'short_description', 'yoast_title', 'yoast_metadesc' );

	public function apply( $run_id, $dry_run, array $updates ) {
		$results = array();

		foreach ( $updates as $update ) {
			$product_id = isset( $update['product_id'] ) ? (int) $update['product_id'] : 0;
			$fields     = isset( $update['fields'] ) && is_array( $update['fields'] ) ? $update['fields'] : array();
			$model      = isset( $update['model'] ) ? sanitize_text_field( $update['model'] ) : '';
			$prompt_ver = isset( $update['prompt_version'] ) ? sanitize_text_field( $update['prompt_version'] ) : '';

			$result = array(
				'product_id' => $product_id,
				'fields'     => array(),
			);

			if ( $product_id <= 0 ) {
				$result['error'] = 'invalid_product_id';
				$results[]       = $result;
				continue;
			}

			try {
				$product = function_exists( 'wc_get_product' ) ? wc_get_product( $product_id ) : null;
				if ( ! $product ) {
					$result['error'] = 'product_not_found';
					$results[]       = $result;
					continue;
				}

				$wc_dirty = false;

				foreach ( $fields as $field => $value ) {
					if ( ! in_array( $field, self::ALLOWED_FIELDS, true ) ) {
						$result['fields'][ $field ] = array( 'status' => 'error', 'reason' => 'unknown_field' );
						continue;
					}
					$value = is_string( $value ) ? $value : '';

					$current = $this->read_field( $product, $product_id, $field );
					if ( trim( (string) $current ) !== '' ) {
						$result['fields'][ $field ] = array( 'status' => 'skipped', 'reason' => 'existing_value' );
						continue;
					}

					if ( trim( $value ) === '' ) {
						$result['fields'][ $field ] = array( 'status' => 'skipped', 'reason' => 'empty_value' );
						continue;
					}

					if ( $dry_run ) {
						$result['fields'][ $field ] = array( 'status' => 'applied', 'dry_run' => true );
						continue;
					}

					SEO_Autofill_Rollback::record( $run_id, $product_id, $field, (string) $current, $value, $model, $prompt_ver );

					switch ( $field ) {
						case 'description':
							$product->set_description( $value );
							$wc_dirty = true;
							break;
						case 'short_description':
							$product->set_short_description( $value );
							$wc_dirty = true;
							break;
						case 'yoast_title':
							update_post_meta( $product_id, '_yoast_wpseo_title', $value );
							break;
						case 'yoast_metadesc':
							update_post_meta( $product_id, '_yoast_wpseo_metadesc', $value );
							break;
					}

					$result['fields'][ $field ] = array( 'status' => 'applied' );
				}

				if ( $wc_dirty && ! $dry_run ) {
					$product->save();
				}
				if ( ! $dry_run ) {
					do_action( 'save_post', $product_id, get_post( $product_id ), true );
				}
			} catch ( Throwable $e ) {
				$result['error'] = $e->getMessage();
			}

			$results[] = $result;
		}

		return array(
			'run_id'  => $run_id,
			'dry_run' => (bool) $dry_run,
			'results' => $results,
		);
	}

	private function read_field( $product, $product_id, $field ) {
		switch ( $field ) {
			case 'description':
				return (string) $product->get_description();
			case 'short_description':
				return (string) $product->get_short_description();
			case 'yoast_title':
				return (string) get_post_meta( $product_id, '_yoast_wpseo_title', true );
			case 'yoast_metadesc':
				return (string) get_post_meta( $product_id, '_yoast_wpseo_metadesc', true );
		}
		return '';
	}
}

}
