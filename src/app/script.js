document.addEventListener('DOMContentLoaded', () => {
    // Initial state object to keep track of the current state of the app
    const State = {
        replyingToMessageId: null
    };

    // Constants for different classes and IDs used in the app
    const USER = 'user';
    const LLAMA = 'llama';
    const TYPING_INDICATOR_ID = 'typing-indicator';
    const CITATION_CLASS = 'citation';
    const CITATION_TOOLTIP_CLASS = 'citation-tooltip';
    const CLOSE_BTN_CLASS = 'close-btn';
    const REPLY_BUTTON_CLASS = 'reply-button';
    const MESSAGE_CONTENT_CLASS = 'message-content';
    const MESSAGES_CLASS = 'message';
    const CITATIONS_CLASS = 'citations';

    // Event listener for user input field to detect 'Enter' key press
    document.getElementById('user-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    // Event listener for the send button
    document.getElementById('send-button').addEventListener('click', (e) => {
        sendMessage();
    });

    // Event listener for the settings button
    document.getElementById('settings-button').addEventListener('click', (e) => {
        openSettings();
    });

    // Event listener for the file input change event to handle file uploads
    document.getElementById('file-input').addEventListener('change', uploadFile);

    // Event listener for the upload button
    document.getElementById('upload-button').addEventListener('click', (e) => {
        document.getElementById('file-input').click();
    });


    /**
     * Function to handle file uploads. It retrieves the selected file, creates form data, 
     * and sends the file to the server via a POST request. 
     *
     * @param None
     * @return None
     */
    function uploadFile() {
        const fileInput = document.getElementById('file-input');
        const file = fileInput.files[0];

        if (file) {
            const formData = new FormData();
            formData.append('file', file);

            // Send the file to the server
            fetch('http://localhost:3000/upload', {
                method: 'POST',
                body: formData
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        if (data.fileId) {
                            addMessage('llama', 'File uploaded successfully. File ID: ' + data.fileId);
                        } else {
                            addMessage('llama', 'File already exists or could not be uploaded.');
                        }
                    } else {
                        addMessage('llama', 'File upload failed.');
                    }
                })
                .catch(error => {
                    addMessage('llama', 'Oops! Something went wrong. Please try again later.<br>Error: ' + error.message);
                });
        } else {
            addMessage('llama', 'No file selected.');
        }

        // Reset the file input value
        fileInput.value = '';
    }


    /**
     * Function to handle sending messages
     *
     * @param {void}
     * @return {void}
     */
    function sendMessage() {
        const inputBox = document.getElementById('user-input');
        const message = inputBox.value.trim();

        if (message) {
            addMessage(USER, message);
            inputBox.value = '';
            showTypingIndicator();

            // Send the message to the server and get a response
            fetch('http://localhost:3000/respond', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    question: message,
                    messageId: message.includes(':') ? State.replyingToMessageId : null,
                    config: getConfig()
                })
            })
                .then(response => response.json())
                .then(data => {
                    hideTypingIndicator();
                    const formattedMessage = marked.parse(data.answer.answer);
                    addMessage(LLAMA, formattedMessage, data.answer.context, data.messageId);
                    State.replyingToMessageId = null;
                })
                .catch(error => {
                    hideTypingIndicator();
                    addMessage(LLAMA, `Oops! Something went wrong. Please try again later.<br>Error: ${error.message}`);
                });
        }
    }

    /**
     * Function to get the current configuration.
     *
     * @return {Object} the current configuration object
     */
    function getConfig() {
        return {
            REWRITE: getConfigValue('REWRITE'),
            FUSION: getConfigValue('FUSION'),
            CHAT_TEMPERATURE: getConfigValue('CHAT_TEMPERATURE'),
            L2_INDEX_THRESHOLD: getConfigValue('L2_INDEX_THRESHOLD'),
            COSINE_INDEX_THRESHOLD: getConfigValue('COSINE_INDEX_THRESHOLD'),
            FUSION_THRESHOLD: getConfigValue('FUSION_THRESHOLD')
        };
    }

    /**
     * Adds a new message to the chat box.
     *
     * @param {string} sender - The sender of the message.
     * @param {string} message - The content of the message.
     * @param {Array} [citations=[]] - Optional array of citations.
     * @param {string|null} [messageId=null] - Optional message ID.
     * @return {void} This function does not return anything.
     */
    function addMessage(sender, message, citations = [], messageId = null) {
        const chatBox = document.getElementById('chat-box');
        const messageElement = document.createElement('div');
        messageElement.className = `${MESSAGES_CLASS} ${sender}`;

        const messageContent = document.createElement('div');
        messageContent.className = MESSAGE_CONTENT_CLASS;
        messageContent.innerHTML = message;

        // Append reply button if the sender is LLAMA and messageId is present
        if (sender === LLAMA && messageId) {
            appendReplyButton(messageContent, messageId);
        }

        // Append citations if present
        if (citations.length > 0) {
            appendCitations(messageContent, citations);
        }

        messageElement.appendChild(messageContent);
        chatBox.appendChild(messageElement);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    /**
     * Appends a reply button to a message content.
     *
     * @param {HTMLElement} messageContent - The HTML element where the reply button will be appended.
     * @param {number} messageId - The ID of the message.
     * @return {void} This function does not return a value.
     */
    function appendReplyButton(messageContent, messageId) {
        const replyButton = document.createElement('button');
        replyButton.className = REPLY_BUTTON_CLASS;
        replyButton.textContent = 'Reply';
        replyButton.onclick = () => {
            document.getElementById('user-input').value = `Replying to message [${messageId}]: `;
            State.replyingToMessageId = messageId;
            document.getElementById('user-input').focus();
        };
        messageContent.appendChild(document.createElement('br'));
        messageContent.appendChild(replyButton);
    }

    /**
     * Appends citations to a message content.
     *
     * @param {HTMLElement} messageContent - The element to append the citations to.
     * @param {Array} citations - An array of citation objects.
     * @return {void} This function does not return a value.
     */
    function appendCitations(messageContent, citations) {
        const citationsMap = new Map();

        // Collect unique citations and append duplicates as new segments
        citations.forEach((citation) => {
            const source = citation.metadata.source;
            if (!citationsMap.has(source)) {
                citationsMap.set(source, []);
            }
            citationsMap.get(source).push(citation.pageContent);
        });

        const randomUUID = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

        const citationsElement = document.createElement('div');
        citationsElement.className = CITATIONS_CLASS;
        citationsElement.appendChild(document.createElement('hr'));

        let index = 1;
        citationsMap.forEach((contents, source) => {
            const citationLink = document.createElement('span');
            citationLink.className = CITATION_CLASS;
            citationLink.textContent = `[${index}]`;
            citationLink.dataset.id = randomUUID + index;

            const tooltip = document.createElement('div');
            tooltip.className = CITATION_TOOLTIP_CLASS;
            const segments = contents.map(content => `<p>${content.slice(0, 50)}...</p>`).join('<hr>');
            tooltip.innerHTML = `
                    <h4>Source: ${source}</h4>
                    ${segments}
                    <span class="read-more" data-id="${randomUUID + index}">Read more</span>
                `;

            citationLink.appendChild(tooltip);
            citationsElement.appendChild(citationLink);

            // Show tooltip on mouse over
            citationLink.addEventListener('mouseover', () => {
                tooltip.style.display = 'block';
            });

            // Hide tooltip on mouse out
            citationLink.addEventListener('mouseout', () => {
                tooltip.style.display = 'none';
            });

            // Keep tooltip visible when mouse is over the tooltip itself
            tooltip.addEventListener('mouseover', () => {
                tooltip.style.display = 'block';
            });

            // Hide tooltip when mouse leaves the tooltip itself
            tooltip.addEventListener('mouseout', () => {
                tooltip.style.display = 'none';
            });

            // Show popup with full citation on 'Read more' click
            tooltip.querySelector('.read-more').addEventListener('click', () => {
                showPopup({ metadata: { source }, pageContent: contents });
            });

            index++;
        });

        messageContent.appendChild(citationsElement);
    }


    /**
     * Show a popup with the citation details.
     *
     * @param {Object} citation - The citation object containing page content and metadata
     * @return {void} This function does not return anything
     */
    function showPopup(citation) {
        const popup = document.createElement('div');
        popup.className = 'popup';
        const segments = citation.pageContent.map(content => `<p>${marked.parseInline(content)}</p>`).join('<hr>');
        popup.innerHTML = `
            <h4>Source: ${citation.metadata.source}</h4>
            ${segments}
            <span class="${CLOSE_BTN_CLASS}">Close</span>
        `;

        document.body.appendChild(popup);

        // Close the popup on clicking the close button
        popup.querySelector(`.${CLOSE_BTN_CLASS}`).addEventListener('click', () => {
            popup.remove();
        });

        popup.style.display = 'block';
    }

    /**
     * Shows a typing indicator in the chat box.
     *
     * @return {void} This function does not return anything.
     */
    function showTypingIndicator() {
        const chatBox = document.getElementById('chat-box');
        const typingIndicator = document.createElement('div');
        typingIndicator.id = TYPING_INDICATOR_ID;
        typingIndicator.className = `${MESSAGES_CLASS} ${LLAMA}`;

        const typingContent = document.createElement('div');
        typingContent.className = MESSAGE_CONTENT_CLASS;
        typingContent.innerText = 'Llama is munching...';

        typingIndicator.appendChild(typingContent);
        chatBox.appendChild(typingIndicator);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    /**
     * Hides the typing indicator from the chat box if it exists.
     *
     * @return {void} This function does not return anything.
     */
    function hideTypingIndicator() {
        const typingIndicator = document.getElementById(TYPING_INDICATOR_ID);
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }
});