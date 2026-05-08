<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! class_exists( 'SEO_Autofill_Auth', false ) ) {

class SEO_Autofill_Auth {

	const OPTION_TOKEN          = 'seo_autofill_token';
	const OPTION_RATE_PER_MIN   = 'seo_autofill_rate_per_min';
	const TRANSIENT_RATE_PREFIX = 'seo_autofill_rl_';

	public static function check_permission( WP_REST_Request $request ) {
		$auth_header = $request->get_header( 'authorization' );
		if ( empty( $auth_header ) ) {
			return new WP_Error( 'seo_autofill_missing_auth', 'Authorization header required.', array( 'status' => 401 ) );
		}

		if ( stripos( $auth_header, 'Bearer ' ) !== 0 ) {
			return new WP_Error( 'seo_autofill_bad_auth', 'Bearer token required.', array( 'status' => 401 ) );
		}

		$presented = trim( substr( $auth_header, 7 ) );
		$expected  = (string) get_option( self::OPTION_TOKEN, '' );

		if ( $expected === '' || ! hash_equals( $expected, $presented ) ) {
			return new WP_Error( 'seo_autofill_invalid_token', 'Invalid token.', array( 'status' => 403 ) );
		}

		if ( ! current_user_can_for_blog( get_current_blog_id(), 'manage_woocommerce' ) && ! self::token_user_can_manage_woocommerce() ) {
			return new WP_Error( 'seo_autofill_insufficient_caps', 'Token user lacks manage_woocommerce.', array( 'status' => 403 ) );
		}

		if ( ! self::rate_limit_ok( $presented ) ) {
			return new WP_Error( 'seo_autofill_rate_limited', 'Rate limit exceeded.', array( 'status' => 429 ) );
		}

		return true;
	}

	private static function token_user_can_manage_woocommerce() {
		$user_id = (int) get_option( 'seo_autofill_token_user_id', 0 );
		if ( $user_id <= 0 ) {
			return false;
		}
		$user = get_user_by( 'id', $user_id );
		return $user && user_can( $user, 'manage_woocommerce' );
	}

	private static function rate_limit_ok( $token ) {
		$limit = (int) get_option( self::OPTION_RATE_PER_MIN, 60 );
		if ( $limit <= 0 ) {
			return true;
		}

		$key   = self::TRANSIENT_RATE_PREFIX . md5( $token );
		$count = (int) get_transient( $key );
		if ( $count >= $limit ) {
			return false;
		}

		set_transient( $key, $count + 1, MINUTE_IN_SECONDS );
		return true;
	}

	public static function generate_token() {
		return bin2hex( random_bytes( 32 ) );
	}
}

}
