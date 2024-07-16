document.addEventListener('DOMContentLoaded', () => {
    const State = {
        replyingToMessageId: null
    };

    const USER = 'user';
    const BOT = 'bot';
    const TYPING_INDICATOR_ID = 'typing-indicator';
    const CITATION_CLASS = 'citation';
    const CITATION_TOOLTIP_CLASS = 'citation-tooltip';
    const CLOSE_BTN_CLASS = 'close-btn';
    const REPLY_BUTTON_CLASS = 'reply-button';
    const MESSAGE_CONTENT_CLASS = 'message-content';
    const MESSAGES_CLASS = 'message';
    const CITATIONS_CLASS = 'citations';

    document.getElementById('user-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    document.getElementById('send-button').addEventListener('click', (e) => {
        sendMessage();
    });

    document.getElementById('settings-button').addEventListener('click', (e) => {
        openSettings();
    });
    // Event listener for the file input change
    document.getElementById('file-input').addEventListener('change', uploadFile);

    document.getElementById('upload-button').addEventListener('click', (e) => {
        document.getElementById('file-input').click();
    });

    function uploadFile() {
        const fileInput = document.getElementById('file-input');
        const file = fileInput.files[0];

        if (file) {
            const formData = new FormData();
            formData.append('file', file);

            fetch('http://localhost:3000/upload', {
                method: 'POST',
                body: formData
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        if(data.fileId) {
                            addMessage('bot', 'File uploaded successfully. File ID: ' + data.fileId);
                        } else {
                            addMessage('bot', 'File already exists or could not be uploaded.');
                        }
                    } else {
                        addMessage('bot', 'File upload failed.');
                    }
                })
                .catch(error => {
                    addMessage('bot', 'Oops! Something went wrong. Please try again later.<br>Error: ' + error.message);
                });
        } else {
            addMessage('bot', 'No file selected.');
        }

        fileInput.value = '';
    }

    function sendMessage() {
        const inputBox = document.getElementById('user-input');
        const message = inputBox.value.trim();

        if (message) {
            addMessage(USER, message);
            inputBox.value = '';
            showTypingIndicator();

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
                    addMessage(BOT, formattedMessage, data.answer.context, data.messageId);
                    State.replyingToMessageId = null;
                })
                .catch(error => {
                    hideTypingIndicator();
                    addMessage(BOT, `Oops! Something went wrong. Please try again later.<br>Error: ${error.message}`);
                });
        }
    }

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

    function addMessage(sender, message, citations = [], messageId = null) {
        const chatBox = document.getElementById('chat-box');
        const messageElement = document.createElement('div');
        messageElement.className = `${MESSAGES_CLASS} ${sender}`;

        const messageContent = document.createElement('div');
        messageContent.className = MESSAGE_CONTENT_CLASS;
        messageContent.innerHTML = message;

        if (sender === BOT && messageId) {
            appendReplyButton(messageContent, messageId);
        }

        if (citations.length > 0) {
            appendCitations(messageContent, citations);
        }

        messageElement.appendChild(messageContent);
        chatBox.appendChild(messageElement);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

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

            citationLink.addEventListener('mouseover', () => {
                tooltip.style.display = 'block';
            });

            citationLink.addEventListener('mouseout', () => {
                tooltip.style.display = 'none';
            });

            tooltip.addEventListener('mouseover', () => {
                tooltip.style.display = 'block';
            });

            tooltip.addEventListener('mouseout', () => {
                tooltip.style.display = 'none';
            });

            tooltip.querySelector('.read-more').addEventListener('click', () => {
                showPopup({ metadata: { source }, pageContent: contents });
            });

            index++;
        });

        messageContent.appendChild(citationsElement);
    }

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

        popup.querySelector(`.${CLOSE_BTN_CLASS}`).addEventListener('click', () => {
            popup.remove();
        });

        popup.style.display = 'block';
    }

    function showTypingIndicator() {
        const chatBox = document.getElementById('chat-box');
        const typingIndicator = document.createElement('div');
        typingIndicator.id = TYPING_INDICATOR_ID;
        typingIndicator.className = `${MESSAGES_CLASS} ${BOT}`;

        const typingContent = document.createElement('div');
        typingContent.className = MESSAGE_CONTENT_CLASS;
        typingContent.innerText = 'Bot is typing...';

        typingIndicator.appendChild(typingContent);
        chatBox.appendChild(typingIndicator);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    function hideTypingIndicator() {
        const typingIndicator = document.getElementById(TYPING_INDICATOR_ID);
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }
});