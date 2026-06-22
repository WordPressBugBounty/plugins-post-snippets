/*
* Chatbot JS (Premium Sync)
*/

jQuery(document).ready(function ($) {
    const chatbotState = {
        conversationMessages: [],
        apiKeyValidated: false,
        currentEditor: null,
        editors: {
            custom: null,
            css: null,
            js: null
        }
    };

    const icons = {
        ai: `<div class="msg-icon ai-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg></div>`,
        user: `<div class="msg-icon user-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>`,
        warning: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
        success: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
        book: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6.5 2H20v20H6.5"/></svg>`
    };



    initializeChatbot();

    function initializeChatbot() {
        $('#chatbot-wrapper').hide();
        bindEventHandlers();
        initializeCodeMirrorDetection();
    }

    function bindEventHandlers() {
        $('#chatbot-toggle').on('click', handleChatbotToggle);
        $('#chatbot-close').on('click', () => $('#chatbot-wrapper').fadeOut('fast'));
        $('#chatbot-send').on('click', handleSendMessage);
        $('#chatbot-input').on('keypress', handleInputKeypress);
        $(document).on('click', '#chatbot-input-container', () => $('#chatbot-input').focus());
        $('#chatbot-input').on('input', handleInputResize);
        $(document).on('click', '.apply-snippet-btn', handleApplySnippet);
        $(document).on('click', '.read-code-btn', handleReadCode);
    }

    function handleChatbotToggle() {
        const wrapper = $('#chatbot-wrapper');
        if (wrapper.is(':visible')) {
            wrapper.fadeOut('fast');
        } else {
            wrapper.css('display', 'flex').hide().fadeIn('fast');
            if (!chatbotState.apiKeyValidated) {
                checkApiKey();
            }
        }
    }

    function handleClearChat() {
        if (confirm('Are you sure you want to clear this conversation?')) {
            chatbotState.conversationMessages = [];
            $('#chatbot-messages').empty();
            showWelcomeMessage();
        }
    }

    function handleSendMessage(e) {
        e.preventDefault();
        sendMessage();
    }

    function handleInputKeypress(e) {
        if (e.which === 13 && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    }

    function handleInputResize() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    }

    function handleApplySnippet() {
        const codeId = $(this).data('code-id');
        const language = $(this).data('language');
        const codeElement = $('#' + codeId);

        if (codeElement.length) {
            const rawCode = decodeURIComponent(codeElement.attr('data-raw') || '');
            const code = rawCode || codeElement.text();

            applyCodeToEditor(code, language);
            showButtonFeedback($(this), 'Applied!');
        }
    }

    function handleReadCode() {
        const editorType = $(this).data('editor-type');
        const code = readCodeFromEditor(editorType);

        if (code) {
            const messages = $('#chatbot-messages');
            messages.append(createReadCodeMessage(editorType, code));
            scrollToBottom();
        }
    }

    function checkApiKey() {
        $.ajax({
            type: 'POST',
            url: PSchatbot.ajaxurl,
            data: {
                action: 'check_api_key',
                nonce: PSchatbot.nonce
            },
            success: function (response) {
                if (response.success) {
                    chatbotState.apiKeyValidated = true;
                    showWelcomeMessage();
                } else {
                    showApiKeyError();
                }
            },
            error: function () {
                showApiKeyError();
            }
        });
    }

    function showWelcomeMessage() {
        const messages = $('#chatbot-messages');
        if (messages.children().length === 0) {
            messages.append(`
                <div class="welcome-message">
                    <div class="message-content">
                        <strong>AI Assistant</strong> Hello! I'm your AI coding assistant. I can help you with PHP, JavaScript, CSS, and general programming questions. I can also read and analyze your current code. What would you like to work on today?
                    </div>
                </div>
            `);
        }
    }

    function showApiKeyError() {
        const messages = $('#chatbot-messages');
        messages.html(`
            <div class="error-message">
                <div class="message-content">
                    <strong>Configuration Required</strong> 
                    Please add your OpenAI API key in the 
                    <a href="${PSchatbot.settings_url}" target="_blank" style="color: inherit; text-decoration: underline;">
                        AI Chatbot settings
                    </a> 
                    before starting the chat.
                </div>
            </div>
        `);
        $('#chatbot-input').prop('disabled', true);
        $('#chatbot-send').prop('disabled', true);
    }

    function sendMessage() {
        if (!chatbotState.apiKeyValidated) {
            checkApiKey();
            return;
        }

        const input = $('#chatbot-input');
        const userMessage = $.trim(input.val());

        if (!userMessage) return;

        const codeAnalysisKeywords = ['syntax error', 'fix', 'debug', 'error in my file', 'check my code', 'analyze'];
        const needsCodeAnalysis = codeAnalysisKeywords.some(keyword =>
            userMessage.toLowerCase().includes(keyword)
        );

        let messageToSend = userMessage;
        let currentCode = '';

        if (needsCodeAnalysis) {
            const detectedEditor = detectActiveEditor();
            if (detectedEditor) {
                currentCode = readCodeFromEditor(detectedEditor);
                if (currentCode) {
                    messageToSend = `${userMessage}\n\nCurrent code from ${detectedEditor} editor:\n\`\`\`${getLanguageFromEditor(detectedEditor)}\n${currentCode}\n\`\`\``;
                }
            }
        }

        displayUserMessage(userMessage);
        input.val('');
        scrollToBottom();

        const loadingId = showLoadingMessage();
        disableSendButton();

        sendAjaxRequest(messageToSend, loadingId);
    }

    function detectActiveEditor() {
        const editors = ['custom', 'css', 'js'];

        for (const editorType of editors) {
            const editor = getEditorByType(editorType);
            if (editor && editor.hasFocus && editor.hasFocus()) {
                return editorType;
            }
        }

        for (const editorType of editors) {
            const code = readCodeFromEditor(editorType);
            if (code && code.trim().length > 0) {
                return editorType;
            }
        }

        return 'custom';
    }

    function getLanguageFromEditor(editorType) {
        const languageMap = {
            'custom': 'php',
            'css': 'css',
            'js': 'javascript'
        };
        return languageMap[editorType] || 'text';
    }

    function displayUserMessage(message) {
        const messages = $('#chatbot-messages');
        messages.append(`
            <div class="user-message">
                ${icons.user}
                <div class="message-content">
                    <strong>You</strong> ${escapeHtml(message)}
                </div>
            </div>
        `);
    }

    function showLoadingMessage() {
        const loadingId = 'loading-' + Date.now();
        const messages = $('#chatbot-messages');
        messages.append(`
            <div id="${loadingId}" class="ai-message loading">
                ${icons.ai}
                <div class="message-content">
                    <strong>AI Assistant</strong> 
                    <span class="typing-indicator">
                        <span></span>
                        <span></span>
                        <span></span>
                    </span>
                </div>
            </div>
        `);
        scrollToBottom();
        return loadingId;
    }

    function disableSendButton() {
        $('#chatbot-send').prop('disabled', true);
    }

    function enableSendButton() {
        $('#chatbot-send').prop('disabled', false);
        $('#chatbot-input').focus();
    }

    function sendAjaxRequest(message, loadingId) {
        $.ajax({
            type: 'POST',
            url: PSchatbot.ajaxurl,
            data: {
                action: 'chatbot_ask',
                prompt: message,
                messages: JSON.stringify(chatbotState.conversationMessages),
                nonce: PSchatbot.nonce
            },
            timeout: 60000,
            success: function (response) {
                handleAjaxSuccess(response, loadingId);
            },
            error: function (xhr, status, error) {
                handleAjaxError(xhr, status, error, loadingId);
            },
            complete: function () {
                enableSendButton();
            }
        });
    }

    function handleAjaxSuccess(response, loadingId) {
        $('#' + loadingId).remove();

        if (response.success && response.data) {
            const content = response.data.content || response.data;
            const processedContent = processAIResponse(content);

            displayAIMessage(processedContent);

            if (response.data.messages) {
                chatbotState.conversationMessages = response.data.messages;
            }
        } else {
            const errorMsg = response.data ? response.data : 'Unknown error occurred';
            showErrorMessage(errorMsg);
        }

        scrollToBottom();
    }

    function handleAjaxError(xhr, status, error, loadingId) {
        $('#' + loadingId).remove();

        let errorMessage;
        if (status === 'timeout') {
            errorMessage = 'Request timed out. Please try again with a shorter message.';
        } else if (xhr.responseJSON && xhr.responseJSON.data) {
            errorMessage = xhr.responseJSON.data;
        } else if (xhr.responseText) {
            try {
                const errorData = JSON.parse(xhr.responseText);
                errorMessage = errorData.data || 'Server error occurred';
            } catch (e) {
                errorMessage = 'Server error occurred. Please try again.';
            }
        } else {
            errorMessage = 'Network error. Please check your connection and try again.';
        }

        showErrorMessage(errorMessage);
        scrollToBottom();
    }

    function displayAIMessage(content) {
        const messages = $('#chatbot-messages');
        messages.append(`
            <div class="ai-message">
                ${icons.ai}
                <div class="message-content">
                    <strong>AI Assistant</strong>
                    <div class="ai-response">${content}</div>
                </div>
            </div>
        `);
    }

    function processAIResponse(content) {
        content = content.replace(/```(\w+)?\n([\s\S]*?)```/g, function (match, language, code) {
            const lang = language || 'text';
            const escapedCode = escapeHtml(code.trim());
            const rawCode = code.trim();
            const uniqueId = 'code-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

            return `<div class="code-block" data-language="${lang}">
                <div class="code-header">
                    <span class="language-label">${lang.toUpperCase()}</span>
                </div>
                <pre><code class="language-${lang}" id="${uniqueId}" data-raw="${encodeURIComponent(rawCode)}">${escapedCode}</code></pre>
                <div class="code-actions">
                    <button class="apply-snippet-btn" data-code-id="${uniqueId}" data-language="${lang}">Apply Snippet</button>
                    <button class="copy-code-btn" data-code-id="${uniqueId}">Copy Code</button>
                </div>
            </div>`;
        });

        content = content.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
        content = content.replace(/\n/g, '<br>');

        return content;
    }

    function readCodeFromEditor(editorType) {
        const editor = getEditorByType(editorType);

        if (editor) {
            try {
                return editor.getValue();
            } catch (error) {
                console.error('Error reading from CodeMirror:', error);
            }
        }

        const textarea = getTextareaByType(editorType);
        if (textarea.length) {
            return textarea.val();
        }

        return '';
    }

    function getEditorByType(editorType) {
        if (chatbotState.editors[editorType]) {
            return chatbotState.editors[editorType];
        }

        const selectors = {
            'custom': '.post-snippets-edit:not(.post-snippets-edit-css):not(.post-snippets-edit-js)',
            'css': '.post-snippets-edit-css',
            'js': '.post-snippets-edit-js'
        };

        const selector = selectors[editorType];
        if (selector) {
            const editorElement = $(selector).closest('.CodeMirror')[0];
            if (editorElement && editorElement.CodeMirror) {
                chatbotState.editors[editorType] = editorElement.CodeMirror;
                return editorElement.CodeMirror;
            }
        }

        return null;
    }

    function getTextareaByType(editorType) {
        const textareaSelectors = {
            'custom': 'textarea[name="snippet_code"], textarea#snippet_code',
            'css': 'textarea[name="snippet_css"], textarea#snippet_css',
            'js': 'textarea[name="snippet_js"], textarea#snippet_js'
        };

        const selector = textareaSelectors[editorType];
        return selector ? $(selector) : $();
    }

    function createReadCodeMessage(editorType, code) {
        const truncatedCode = code.length > 500 ? code.substring(0, 500) + '...' : code;
        return `
            <div class="system-message">
                <div class="message-content">
                    <strong>Editor Snippet Read</strong>
                    <pre class="code-preview"><code>${escapeHtml(truncatedCode)}</code></pre>
                    <small>Total characters: ${code.length}</small>
                </div>
            </div>
        `;
    }

    function applyCodeToEditor(code, language) {
        const editorType = detectEditorTypeFromLanguage(language);
        const editor = getEditorByType(editorType);

        if (editor) {
            try {
                // If there's no selection, this will insert at the cursor.
                // If there is a selection, it will replace it.
                editor.replaceSelection(code);
                editor.focus();
                editor.refresh();

                $(editor.getWrapperElement()).trigger('change');
                const textarea = $(editor.getTextArea());
                if (textarea.length) {
                    textarea.trigger('change');
                }

                showSuccessMessage(`Code applied to ${editorType} editor successfully!`);
                return true;
            } catch (error) {
                console.error('Error applying code to CodeMirror:', error);
            }
        }

        const textarea = getTextareaByType(editorType);
        if (textarea.length) {
            insertAtCaret(textarea, code);
            showSuccessMessage(`Code applied to ${editorType} editor successfully!`);
            return true;
        }

        copyToClipboard(code);
        showSuccessMessage('Code copied to clipboard! Please paste it into your editor.');
        return false;
    }

    function insertAtCaret(textarea, text) {
        const el = textarea[0];
        const scrollPos = el.scrollTop;
        const strPos = el.selectionStart;
        const front = (el.value).substring(0, strPos);
        const back = (el.value).substring(el.selectionEnd, el.value.length);

        el.value = front + text + back;
        textarea.trigger('change').focus();
        el.selectionStart = strPos + text.length;
        el.selectionEnd = strPos + text.length;
        el.scrollTop = scrollPos;
    }

    function detectEditorTypeFromLanguage(language) {
        const languageMap = {
            'php': 'custom',
            'html': 'custom',
            'css': 'css',
            'javascript': 'js',
            'js': 'js'
        };
        return languageMap[language] || 'custom';
    }

    function showButtonFeedback(button, text) {
        const originalText = button.text();
        button.text(text).addClass('applied');

        setTimeout(() => {
            button.text(originalText).removeClass('applied');
        }, 2000);
    }

    function copyToClipboard(text) {
        const tempTextarea = document.createElement('textarea');
        tempTextarea.value = text;
        document.body.appendChild(tempTextarea);
        tempTextarea.select();
        tempTextarea.setSelectionRange(0, 99999);

        try {
            document.execCommand('copy');
        } catch (err) {
            console.error('Failed to copy text:', err);
        }

        document.body.removeChild(tempTextarea);
    }

    function showSuccessMessage(message) {
        const messages = $('#chatbot-messages');
        const successDiv = $(`
            <div class="success-message">
                <div class="message-content">
                    <strong>Success</strong> ${escapeHtml(message)}
                </div>
            </div>
        `);

        messages.append(successDiv);
        scrollToBottom();

        setTimeout(() => {
            successDiv.fadeOut(() => successDiv.remove());
        }, 3000);
    }

    function showErrorMessage(message) {
        const messages = $('#chatbot-messages');
        messages.append(`
            <div class="error-message">
                <div class="message-content">
                    <strong>Error</strong> ${escapeHtml(message)}
                </div>
            </div>
        `);
    }

    function scrollToBottom() {
        const messages = $('#chatbot-messages');
        messages.scrollTop(messages[0].scrollHeight);
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function initializeCodeMirrorDetection() {
        setTimeout(() => {
            detectAllEditors();
        }, 1000);

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === 1 && node.classList && node.classList.contains('CodeMirror')) {
                            if (node.CodeMirror) {
                                cacheEditorInstance(node.CodeMirror);
                            }
                        }
                    });
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        setTimeout(() => observer.disconnect(), 10000);
    }

    function detectAllEditors() {
        const editorSelectors = {
            'custom': '.post-snippets-edit:not(.post-snippets-edit-css):not(.post-snippets-edit-js)',
            'css': '.post-snippets-edit-css',
            'js': '.post-snippets-edit-js'
        };

        Object.keys(editorSelectors).forEach(editorType => {
            const selector = editorSelectors[editorType];
            $(selector).each(function () {
                const codeMirrorElement = $(this).closest('.CodeMirror')[0];
                if (codeMirrorElement && codeMirrorElement.CodeMirror) {
                    chatbotState.editors[editorType] = codeMirrorElement.CodeMirror;
                }
            });
        });
    }

    function cacheEditorInstance(editor) {
        const wrapper = $(editor.getWrapperElement());

        if (wrapper.find('.post-snippets-edit-css').length) {
            chatbotState.editors.css = editor;
        } else if (wrapper.find('.post-snippets-edit-js').length) {
            chatbotState.editors.js = editor;
        } else {
            chatbotState.editors.custom = editor;
        }
    }

    $(document).on('click', '.copy-code-btn', function () {
        const codeId = $(this).data('code-id');
        const codeElement = $('#' + codeId);

        if (codeElement.length) {
            const code = codeElement.text();
            copyToClipboard(code);
            showButtonFeedback($(this), 'Copied!');
        }
    });
});