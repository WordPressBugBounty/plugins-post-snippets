<?php
/**
 * Post Snippets AI Integration - Enhanced Version
 */

defined( 'ABSPATH' ) || exit;

class PS_chatbot {

    /**
     * Constructor
     */
    public function __construct() {
        add_action('wp_ajax_chatbot_ask', array($this, 'chatbot_ask'));
        add_action('wp_ajax_check_api_key', array($this, 'check_api_key'));
    }

    /**
     * Check if API key is configured
     */
    public function check_api_key() {
        if (!wp_verify_nonce($_POST['nonce'], 'chatbot_nonce')) {
            wp_send_json_error('Invalid nonce');
            return;
        }

        $api_key = trim(get_option('ps_openai_api_key'));
        
        if (empty($api_key)) {
            wp_send_json_error('No API key configured');
        } else {
            wp_send_json_success('API key is configured');
        }
    }

    /**
     * Handle AI Chat requests
     */
    public function chatbot_ask() {
        if (!wp_verify_nonce($_POST['nonce'], 'chatbot_nonce')) {
            wp_send_json_error('Invalid nonce');
            return;
        }

        $api_key = trim(get_option('ps_openai_api_key'));
        
        if (empty($api_key)) {
            wp_send_json_error('Please add your API key first before starting the chat.');
            return;
        }

        $prompt = isset($_POST['prompt']) ? sanitize_text_field($_POST['prompt']) : '';
        $messages = json_decode(stripslashes($_POST['messages']), true);

        if (!$messages) {
            $messages = [
                ['role' => 'system', 'content' => 'You are an advanced AI code completion assistant for PHP. Given the current file content and cursor position, suggest the most likely next code block, statement, or completion. If the user types a PHP keyword or partial statement, expand it into a complete, correct code block. When providing code, always wrap it in proper code blocks using triple backticks with language specification (```php for PHP code, ```javascript for JavaScript, etc.). For regular text responses, use normal formatting.'],
                ['role' => 'user', 'content' => $prompt]
            ];
        } else {
            $messages[] = ['role' => 'user', 'content' => $prompt];
        }

        $response = wp_remote_post('https://api.openai.com/v1/chat/completions', [
            'headers' => [
                'Authorization' => 'Bearer ' . $api_key,
                'Content-Type' => 'application/json',
            ],
            'body' => json_encode([
                'model' => 'gpt-3.5-turbo',
                'messages' => $messages,
                'temperature' => 0.7,
                'max_tokens' => 4000
            ]),
            'timeout' => 30,
            'sslverify' => false, 
            'httpversion' => '1.1',
            'blocking' => true,
            'data_format' => 'body'
        ]);

        if (is_wp_error($response)) {
            wp_send_json_error('Request failed: ' . $response->get_error_message());
            return;
        }

        $http_code = wp_remote_retrieve_response_code($response);
        $body = json_decode(wp_remote_retrieve_body($response), true);

        if ($http_code === 401) {
            wp_send_json_error('Invalid API key. Please check your OpenAI API key in settings.');
            return;
        } elseif ($http_code === 429) {
            wp_send_json_error('Rate limit exceeded. Please try again later.');
            return;
        } elseif ($http_code !== 200) {
            wp_send_json_error('API request failed with status: ' . $http_code);
            return;
        }

        if (!empty($body['choices'][0]['message']['content'])) {
            $ai_response = trim($body['choices'][0]['message']['content']);
            
            $messages[] = ['role' => 'assistant', 'content' => $ai_response];
            
            wp_send_json_success([
                'content' => $ai_response,
                'messages' => $messages
            ]);
        } else {
            $error_message = 'Invalid AI response';
            if (isset($body['error']['message'])) {
                $error_message = $body['error']['message'];
            }
            wp_send_json_error($error_message);
        }
    }
}

new PS_chatbot();