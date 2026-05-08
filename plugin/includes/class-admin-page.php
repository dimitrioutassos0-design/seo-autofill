<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class SEO_Autofill_Admin_Page {

	const SLUG = 'seo-autofill';

	public function register() {
		add_options_page(
			'SEO Autofill',
			'SEO Autofill',
			'manage_options',
			self::SLUG,
			array( $this, 'render' )
		);
		add_action( 'admin_init', array( $this, 'register_settings' ) );
	}

	public function register_settings() {
		register_setting( 'seo_autofill', SEO_Autofill_Auth::OPTION_RATE_PER_MIN, array( 'type' => 'integer', 'default' => 60 ) );
		register_setting( 'seo_autofill', 'seo_autofill_token_user_id', array( 'type' => 'integer', 'default' => 0 ) );
	}

	public function render() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		if ( isset( $_POST['seo_autofill_rotate_token'] ) && check_admin_referer( 'seo_autofill_rotate' ) ) {
			$token = SEO_Autofill_Auth::generate_token();
			update_option( SEO_Autofill_Auth::OPTION_TOKEN, $token );
			echo '<div class="notice notice-success"><p>New token generated. Copy it now &mdash; it will not be shown again in plain text after you leave this page:</p><p><code>' . esc_html( $token ) . '</code></p></div>';
		}

		$rate    = (int) get_option( SEO_Autofill_Auth::OPTION_RATE_PER_MIN, 60 );
		$user_id = (int) get_option( 'seo_autofill_token_user_id', 0 );
		$token   = (string) get_option( SEO_Autofill_Auth::OPTION_TOKEN, '' );

		?>
		<div class="wrap">
			<h1>SEO Autofill</h1>

			<h2>Token</h2>
			<p>Status: <?php echo $token === '' ? '<strong>not set</strong>' : '<strong>set (hidden)</strong>'; ?></p>
			<form method="post">
				<?php wp_nonce_field( 'seo_autofill_rotate' ); ?>
				<p><button type="submit" name="seo_autofill_rotate_token" class="button button-primary">Generate / Rotate Token</button></p>
			</form>

			<h2>Settings</h2>
			<form method="post" action="options.php">
				<?php settings_fields( 'seo_autofill' ); ?>
				<table class="form-table">
					<tr>
						<th scope="row"><label for="rate">Requests per minute</label></th>
						<td><input type="number" id="rate" name="<?php echo esc_attr( SEO_Autofill_Auth::OPTION_RATE_PER_MIN ); ?>" value="<?php echo esc_attr( $rate ); ?>" min="0" /></td>
					</tr>
					<tr>
						<th scope="row"><label for="user">Token user ID (must have manage_woocommerce)</label></th>
						<td><input type="number" id="user" name="seo_autofill_token_user_id" value="<?php echo esc_attr( $user_id ); ?>" min="0" /></td>
					</tr>
				</table>
				<?php submit_button(); ?>
			</form>

			<h2>Endpoints</h2>
			<ul>
				<li><code>GET <?php echo esc_html( rest_url( SEO_AUTOFILL_NAMESPACE . '/scan' ) ); ?></code></li>
				<li><code>POST <?php echo esc_html( rest_url( SEO_AUTOFILL_NAMESPACE . '/updates/batch' ) ); ?></code></li>
				<li><code>GET <?php echo esc_html( rest_url( SEO_AUTOFILL_NAMESPACE . '/history' ) ); ?></code></li>
				<li><code>POST <?php echo esc_html( rest_url( SEO_AUTOFILL_NAMESPACE . '/rollback' ) ); ?></code></li>
			</ul>
		</div>
		<?php
	}
}
