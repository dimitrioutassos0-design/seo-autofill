<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class SEO_Autofill_REST_Controller {

	public function register_routes() {
		register_rest_route( SEO_AUTOFILL_NAMESPACE, '/scan', array(
			'methods'             => 'GET',
			'callback'            => array( $this, 'scan' ),
			'permission_callback' => array( 'SEO_Autofill_Auth', 'check_permission' ),
			'args'                => array(
				'page'     => array( 'type' => 'integer', 'default' => 1 ),
				'per_page' => array( 'type' => 'integer', 'default' => 50 ),
				'status'   => array( 'type' => 'string', 'default' => 'publish,draft' ),
				'since'    => array( 'type' => 'string', 'required' => false ),
			),
		) );

		register_rest_route( SEO_AUTOFILL_NAMESPACE, '/updates/batch', array(
			'methods'             => 'POST',
			'callback'            => array( $this, 'batch_update' ),
			'permission_callback' => array( 'SEO_Autofill_Auth', 'check_permission' ),
		) );

		register_rest_route( SEO_AUTOFILL_NAMESPACE, '/history', array(
			'methods'             => 'GET',
			'callback'            => array( $this, 'history' ),
			'permission_callback' => array( 'SEO_Autofill_Auth', 'check_permission' ),
			'args'                => array(
				'run_id' => array( 'type' => 'string', 'required' => true ),
			),
		) );

		register_rest_route( SEO_AUTOFILL_NAMESPACE, '/rollback', array(
			'methods'             => 'POST',
			'callback'            => array( $this, 'rollback' ),
			'permission_callback' => array( 'SEO_Autofill_Auth', 'check_permission' ),
		) );
	}

	public function scan( WP_REST_Request $request ) {
		$scan = new SEO_Autofill_Scan();
		return rest_ensure_response( $scan->run( $request ) );
	}

	public function batch_update( WP_REST_Request $request ) {
		$body = $request->get_json_params();
		if ( ! is_array( $body ) ) {
			return new WP_Error( 'seo_autofill_bad_body', 'JSON body required.', array( 'status' => 400 ) );
		}

		$run_id  = isset( $body['run_id'] ) ? sanitize_text_field( $body['run_id'] ) : '';
		$dry_run = ! empty( $body['dry_run'] );
		$updates = isset( $body['updates'] ) && is_array( $body['updates'] ) ? $body['updates'] : array();

		if ( $run_id === '' ) {
			return new WP_Error( 'seo_autofill_missing_run_id', 'run_id is required.', array( 'status' => 400 ) );
		}

		$updater = new SEO_Autofill_Updater();
		return rest_ensure_response( $updater->apply( $run_id, $dry_run, $updates ) );
	}

	public function history( WP_REST_Request $request ) {
		$run_id = sanitize_text_field( $request->get_param( 'run_id' ) );
		return rest_ensure_response( SEO_Autofill_Rollback::history_for_run( $run_id ) );
	}

	public function rollback( WP_REST_Request $request ) {
		$body   = $request->get_json_params();
		$run_id = isset( $body['run_id'] ) ? sanitize_text_field( $body['run_id'] ) : '';
		if ( $run_id === '' ) {
			return new WP_Error( 'seo_autofill_missing_run_id', 'run_id is required.', array( 'status' => 400 ) );
		}
		return rest_ensure_response( SEO_Autofill_Rollback::rollback_run( $run_id ) );
	}
}
