<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class SEO_Autofill_Rollback {

	const TABLE = 'seo_autofill_history';

	public static function table_name() {
		global $wpdb;
		return $wpdb->prefix . self::TABLE;
	}

	public static function install_table() {
		global $wpdb;
		$table  = self::table_name();
		$charset = $wpdb->get_charset_collate();
		$sql = "CREATE TABLE $table (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			run_id VARCHAR(64) NOT NULL,
			product_id BIGINT UNSIGNED NOT NULL,
			field VARCHAR(32) NOT NULL,
			previous_value LONGTEXT NULL,
			new_value LONGTEXT NULL,
			model VARCHAR(64) NULL,
			prompt_version VARCHAR(32) NULL,
			created_at DATETIME NOT NULL,
			PRIMARY KEY (id),
			KEY run_id (run_id),
			KEY product_id (product_id)
		) $charset;";
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		dbDelta( $sql );
	}

	public static function record( $run_id, $product_id, $field, $previous, $new, $model = '', $prompt_version = '' ) {
		global $wpdb;
		$wpdb->insert(
			self::table_name(),
			array(
				'run_id'         => $run_id,
				'product_id'     => $product_id,
				'field'          => $field,
				'previous_value' => $previous,
				'new_value'      => $new,
				'model'          => $model,
				'prompt_version' => $prompt_version,
				'created_at'     => current_time( 'mysql', true ),
			),
			array( '%s', '%d', '%s', '%s', '%s', '%s', '%s', '%s' )
		);
		return (int) $wpdb->insert_id;
	}

	public static function history_for_run( $run_id ) {
		global $wpdb;
		$rows = $wpdb->get_results(
			$wpdb->prepare(
				'SELECT id, run_id, product_id, field, previous_value, new_value, model, prompt_version, created_at FROM ' . self::table_name() . ' WHERE run_id = %s ORDER BY id ASC',
				$run_id
			),
			ARRAY_A
		);
		return is_array( $rows ) ? $rows : array();
	}

	public static function rollback_run( $run_id ) {
		$rows     = self::history_for_run( $run_id );
		$restored = array();
		$errors   = array();

		foreach ( $rows as $row ) {
			$product_id = (int) $row['product_id'];
			$field      = (string) $row['field'];
			$previous   = $row['previous_value'];

			try {
				self::write_field( $product_id, $field, (string) $previous );
				$restored[] = array( 'product_id' => $product_id, 'field' => $field );
			} catch ( Throwable $e ) {
				$errors[] = array(
					'product_id' => $product_id,
					'field'      => $field,
					'message'    => $e->getMessage(),
				);
			}
		}

		return array(
			'run_id'   => $run_id,
			'restored' => $restored,
			'errors'   => $errors,
		);
	}

	public static function write_field( $product_id, $field, $value ) {
		if ( ! function_exists( 'wc_get_product' ) ) {
			throw new RuntimeException( 'WooCommerce not active.' );
		}
		$product = wc_get_product( $product_id );
		if ( ! $product ) {
			throw new RuntimeException( 'Product not found: ' . $product_id );
		}

		switch ( $field ) {
			case 'description':
				$product->set_description( $value );
				$product->save();
				break;
			case 'short_description':
				$product->set_short_description( $value );
				$product->save();
				break;
			case 'yoast_title':
				update_post_meta( $product_id, '_yoast_wpseo_title', $value );
				break;
			case 'yoast_metadesc':
				update_post_meta( $product_id, '_yoast_wpseo_metadesc', $value );
				break;
			default:
				throw new RuntimeException( 'Unknown field: ' . $field );
		}

		do_action( 'save_post', $product_id, get_post( $product_id ), true );
	}
}
