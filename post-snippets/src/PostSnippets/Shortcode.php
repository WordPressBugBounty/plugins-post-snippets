<?php
namespace PostSnippets;

if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * Shortcode Handling.
 *
 */
class Shortcode
{
    public function __construct()
    {
        $this->create();
    }

    /**
     * Create the functions for shortcodes dynamically and register them
     */
    public function create()
    {
        global $wpdb;
        
        $table_name = $wpdb->prefix . \PostSnippets::TABLE_NAME;

        $snippets = $wpdb->get_results($wpdb->prepare("SELECT * FROM $table_name WHERE snippet_shortcode = %d AND snippet_status = 1 AND snippet_content != ''", 1), ARRAY_A );

        foreach ($snippets as $snippet) {
            add_shortcode( $snippet['snippet_title'], 
            function ( $atts, $content = null ) use ( $snippet ){
                return $this->evaluateSnippet($snippet, $atts, $content);
            });
        }    
    }

    public static function evaluateSnippet($snippet, $atts = array(), $content = null){

        if( !empty($snippet) ){

            $default_atts = self::filterVars( $snippet['snippet_vars'] );
            $render_raw_html = self::shouldRenderRawHtml( $snippet );

            foreach ((array) $atts as $key => $val) {
                if ( is_numeric($key) ) {
                    $attribute = explode('=', $val, 2);
                    
                    if (count($attribute) < 2) {
                        continue;
                    }
                    
                    $keyName  = trim($attribute[0]);
                    $keyValue = trim($attribute[1], " \t\n\r\0\x0B\"'");
                    
                    $atts[$keyName] = $keyValue;
                    unset($atts[$key]);
                }
            }

            $short_atts = shortcode_atts( $default_atts, $atts );

            $snippet_content =  $snippet['snippet_content'];

            if ( ! empty( $snippet['snippet_php'] ) && (int) $snippet['snippet_php'] === 1 ) {
                $snippet_content = stripslashes( $snippet_content );
            }

            if ( $content != null ) {
                $short_atts["content"] = $content;
            }
            $snippet_content = self::replaceSnippetVariables(
                $snippet_content,
                $short_atts,
                ! empty( $snippet['snippet_php'] ) && (int) $snippet['snippet_php'] === 1,
                $render_raw_html
            );

            // There might be the case that a snippet contains
            // the post snippets reserved variable {content} to
            // capture the content in enclosed shortcodes, but
            // the shortcode is used without enclosing it. To
            // avoid outputting {content} as part of the string
            // lets remove possible occurences.
            $snippet_content = str_replace( "{content}", "", $snippet_content );

            // Handle PHP shortcodes
            if ( $snippet['snippet_php'] == 1 ) {
                $snippet_content = self::phpEval( $snippet_content );
                
                // WPTexturize the Snippet
                if ( ! empty( $snippet['snippet_wptexturize'] ) && ( $snippet['snippet_wptexturize'] == true ) ) {
                    $snippet_content = html_entity_decode( addslashes ( wptexturize ( htmlentities( stripslashes ( $snippet_content ), ENT_NOQUOTES ) ) ) );
                }

            } else {
                if ( ! empty( $snippet['snippet_wptexturize'] ) && ( $snippet['snippet_wptexturize'] == true ) ) {
                    $snippet_content = addslashes( wptexturize( stripslashes( $snippet_content ) ) );
                }
            }            
            
            $snippet_content = do_shortcode( stripslashes( $snippet_content ) );
            
            return  $snippet_content;
        }
    }

    /**
     * Evaluate a snippet as PHP code.
     *
     * @since   Post Snippets 1.9
     * @param   string  $content    The snippet to evaluate
     * @return  string              The result of the evaluation
     */
    public static function phpEval($content)
    {
        if (defined('POST_SNIPPETS_DISABLE_PHP')) {
            return $content;
        }

        /**Removing Initial PHP Tag */
        $content = ltrim($content, "<?php<?PHP<?=");
        
        ob_start();
        eval($content);
        $content = ob_get_clean();

        return addslashes($content);
    }

    public static function replaceSnippetVariables($snippet_content, $short_atts, $php_snippet = false, $render_raw_html = true)
    {
        foreach ( $short_atts as $key => $val ) {
            $short_atts[ $key ] = self::sanitizeVariableValue( $key, $val, $php_snippet, $render_raw_html );
        }

        if ( $php_snippet ) {
            return self::replacePhpVariables( $snippet_content, $short_atts );
        }

        foreach ( $short_atts as $key => $val ) {
            $snippet_content = str_replace( '{' . $key . '}', $val, $snippet_content );
        }

        return $snippet_content;
    }

    public static function sanitizeVariableValue($key, $val, $php_snippet = false, $render_raw_html = true)
    {
        $val = (string) $val;

        $colon = strpos($key, ':');

        if ( $colon !== false ) {
            $text = explode(":", $key);

            switch (strtolower($text[1])) {
                case 'url':
                    $val = esc_url( $val );
                    break;
                case 'text':
                    $val = esc_html( $val );
                    break;
                case 'attr':
                    $val = esc_attr( $val );
                    break;
                case 'xml':
                    $val = esc_xml( $val );
                    break;
                case 'textarea':
                    $val = esc_textarea( $val );
                    break;
            }
        }

        if ( $php_snippet ) {
            return $val;
        }

        if ( $colon !== false ) {
            return $val;
        }

        // Normalize entity-encoded HTML first, then either allow it through (raw mode) or escape it once (text mode)
        $val = html_entity_decode( $val, ENT_QUOTES );

        return $render_raw_html ? $val : esc_html( $val );
    }

    public static function shouldRenderRawHtml( $snippet )
    {
        if ( ! array_key_exists( 'snippet_rawhtml', $snippet ) ) {
            return true;
        }

        return (int) $snippet['snippet_rawhtml'] === 1;
    }

    public static function replacePhpVariables($snippet_content, $short_atts)
    {
        $string_pattern = '/\'(?:\\\\.|[^\'\\\\])*\'|"(?:\\\\.|[^"\\\\])*"/s';

        $snippet_content = preg_replace_callback(
            $string_pattern,
            function ( $matches ) use ( $short_atts ) {
                $literal = $matches[0];
                $quote = $literal[0];
                $body = substr( $literal, 1, -1 );

                foreach ( $short_atts as $key => $val ) {
                    $body = str_replace(
                        '{' . $key . '}',
                        self::escapePhpStringLiteralValue( $val, $quote ),
                        $body
                    );
                }

                return $quote . $body . $quote;
            },
            $snippet_content
        );

        foreach ( $short_atts as $key => $val ) {
            $snippet_content = str_replace( '{' . $key . '}', var_export( $val, true ), $snippet_content );
        }

        return $snippet_content;
    }

    public static function escapePhpStringLiteralValue($val, $quote)
    {
        if ( $quote === '"' ) {
            return str_replace(
                array( '\\', '"', '$' ),
                array( '\\\\', '\\"', '\\$' ),
                $val
            );
        }

        return str_replace(
            array( '\\', "'" ),
            array( '\\\\', "\\'" ),
            $val
        );
    }

    /**
     * Filters Snippet Variables
     * of Undesired Text.
     *
     * @since   Post Snippets 3.1.4
     * @param   string  $vars       The snippet variable string
     * @return  array               The result of the evaluation
     */
    public static function filterVars($vars = '')
    {
        if ( empty($vars) ) {
            return array();
        }

        if ( is_string($vars) ) {
            $vars = explode(",", $vars);
        }

        if ( is_array($vars) ) {
            $default_atts = array();

            foreach ($vars as $key => $var) {
                if ( !is_numeric($key) ) {
                    $default_atts[$key] = is_scalar($var) ? (string)$var : '';
                    continue;
                }

                if ( !is_string($var) ) {
                    continue;
                }

                $attribute = explode('=', $var);        /**This Results in array seperated by = sign */

                foreach ($attribute as $attr_key => $value) {    //Filtering Empty Values generated with such variable texts one,two=,,,=xx=one,,==two
                    if( empty($value) ) unset($attribute[$attr_key]);
                }

                if( empty($attribute) ) continue;   /**After Unsetting Empty values above, any empty array still remains, so this line is skipping that */

                $attribute = array_values($attribute);      //resetting index to start with zero

                $default_value = (count($attribute) > 1) ? $attribute[1] : '';      /**Default values of vars, if set any */

                $default_atts[$attribute[0]] = $default_value;      /**Setting Default Atts for shortcode_atts  */
            }

            return $default_atts;
        }

        return array();
    }
}
