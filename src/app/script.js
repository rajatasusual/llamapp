const State = {
    replyingToMessageId: null
};

document.getElementById('user-input').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

function sendMessage() {
    const inputBox = document.getElementById('user-input');
    const message = inputBox.value.trim();

    if (message) {

        // Add user's message
        addMessage('user', message);
        inputBox.value = '';

        // Show typing indicator
        showTypingIndicator();

        fetch('http://localhost:3000/respond', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ question: message, messageId: State.replyingToMessageId })
        })
        .then(response => response.json())
        .then(data => {
            hideTypingIndicator();
            const formattedMessage = marked.parse(data.answer.answer);
            addMessage('bot', formattedMessage, data.answer.context, data.messageId);
        })
        .catch(error => {
            hideTypingIndicator();
            addMessage('bot', 'Oops! Something went wrong. Please try again later.<br>Error: ' + error.message, '', [], null);
        });
    }
}

function addMessage(sender, message, citations = [], messageId = null) {
    const chatBox = document.getElementById('chat-box');
    const messageElement = document.createElement('div');
    messageElement.className = `message ${sender}`;

    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    messageContent.innerHTML = message;

    if (sender === 'bot') {
        const replyButton = document.createElement('button');
        replyButton.className = 'reply-button';
        replyButton.textContent = 'Reply';
        replyButton.onclick = () => {
            document.getElementById('user-input').value = `Replying to message [${messageId}]: `;
            State.replyingToMessageId = messageId;
            document.getElementById('user-input').focus();
        };
        messageContent.appendChild(document.createElement('br'));
        messageContent.appendChild(replyButton);
    }

    if (citations.length > 0) {
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
        citationsElement.className = 'citations';
        citationsElement.appendChild(document.createElement('hr'));

        let index = 1;
        citationsMap.forEach((contents, source) => {
            const citationLink = document.createElement('span');
            citationLink.className = 'citation';
            citationLink.textContent = `[${index}]`;
            citationLink.dataset.id = randomUUID + index;

            const tooltip = document.createElement('div');
            tooltip.className = 'citation-tooltip';
            const segments = contents.map(content => `<p>${content.slice(0, 50)}...</p>`).join('<hr>');
            tooltip.innerHTML = `
                <h4>Source: ${source}</h4>
                ${segments}
                <span class="read-more" data-id="${randomUUID + index}">Read more</span>
            `;
            citationLink.appendChild(tooltip);
            citationsElement.appendChild(citationLink);

            citationLink.querySelector('.read-more').addEventListener('click', () => {
                showPopup({ metadata: { source }, pageContent: contents });
            });

            index++;
        });

        messageContent.appendChild(citationsElement);
    }

    messageElement.appendChild(messageContent);
    chatBox.appendChild(messageElement);

    chatBox.scrollTop = chatBox.scrollHeight;
}

function showPopup(citation) {
    const popup = document.createElement('div');
    popup.className = 'popup';
    const segments = citation.pageContent.map(content => `<p>${content}</p>`).join('<hr>');
    popup.innerHTML = `
        <h4>Source: ${citation.metadata.source}</h4>
        ${segments}
        <span class="close-btn">Close</span>
    `;

    document.body.appendChild(popup);

    popup.querySelector('.close-btn').addEventListener('click', () => {
        popup.remove();
    });

    popup.style.display = 'block';
}

function showTypingIndicator() {
    const chatBox = document.getElementById('chat-box');
    const typingIndicator = document.createElement('div');
    typingIndicator.id = 'typing-indicator';
    typingIndicator.className = 'message bot';

    const typingContent = document.createElement('div');
    typingContent.className = 'message-content';
    typingContent.innerText = 'Bot is typing...';

    typingIndicator.appendChild(typingContent);
    chatBox.appendChild(typingIndicator);

    chatBox.scrollTop = chatBox.scrollHeight;
}

function hideTypingIndicator() {
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
}