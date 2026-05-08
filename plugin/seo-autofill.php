<?php
/**
 * Plugin Name: SEO Autofill
 * Description: Safe scan/update/rollback REST API for filling missing WooCommerce and Yoast SEO fields. Designed to be driven by an external agent.
 * Version: 0.1.0
 * Requires PHP: 7.4
 * Requires at least: 6.0
 * Author: SEO Autofill
 * License: GPL-2.0-or-later
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'SEO_AUTOFILL_VERSION', '0.1.0' );
define( 'SEO_AUTOFILL_NAMESPACE', 'seo-autofill/v1' );
define( 'SEO_AUTOFILL_PLUGIN_FILE', __FILE__ );
define( 'SEO_AUTOFILL_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );

require_once SEO_AUTOFILL_PLUGIN_DIR . 'includes/class-auth.php';
require_once SEO_AUTOFILL_PLUGIN_DIR . 'includes/class-rollback.php';
require_once SEO_AUTOFILL_PLUGIN_DIR . 'includes/class-scan.php';
require_once SEO_AUTOFILL_PLUGIN_DIR . 'includes/class-updater.php';
require_once SEO_AUTOFILL_PLUGIN_DIR . 'includes/class-rest-controller.php';
require_once SEO_AUTOFILL_PLUGIN_DIR . 'includes/class-admin-page.php';

register_activation_hook( __FILE__, array( 'SEO_Autofill_Rollback', 'install_table' ) );

add_action( 'rest_api_init', function () {
	( new SEO_Autofill_REST_Controller() )->register_routes();
} );

add_action( 'admin_menu', function () {
	( new SEO_Autofill_Admin_Page() )->register();
} );
