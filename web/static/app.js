// Elements
const chatArea = document.getElementById('chatArea');
const messagesEl = document.getElementById('messages');
const input = document.getElementById('input');
const sendBtn = document.getElementById('sendBtn');
const welcome = document.getElementById('welcome');
const statusIndicator = document.getElementById('statusIndicator');
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const newChatBtn = document.getElementById('newChatBtn');
const clearBtn = document.getElementById('clearBtn');
const chatList = document.getElementById('chatList');

let ws = null;
let isConnected = false;
let chatHistory = [];

// ============ WebSocket ============

function connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${location.host}/api/chat`);

    ws.onopen = () => {
        isConnected = true;
        statusIndicator.className = 'status-indicator connected';
        statusIndicator.title = 'Verbunden';
        updateSendBtn();
    };

    ws.onclose = () => {
        isConnected = false;
        statusIndicator.className = 'status-indicator error';
        statusIndicator.title = 'Getrennt - Verbindung wird wiederhergestellt...';
        updateSendBtn();
        setTimeout(connect, 3000);
    };

    ws.onerror = () => {
        statusIndicator.className = 'status-indicator error';
        statusIndicator.title = 'Verbindungsfehler';
    };

    ws.onmessage = (event) => {
        removeTyping();
        const data = JSON.parse(event.data);

        if (data.type === 'message') {
            appendAssistantMessage(data.content);
        } else if (data.type === 'tool_call') {
            appendToolCall(data.tool, data.args);
        } else if (data.type === 'error') {
            appendAssistantMessage(`Fehler: ${data.content}`);
        }
    };
}

// ============ Messages ============

function hideWelcome() {
    if (welcome && !welcome.classList.contains('hidden')) {
        welcome.classList.add('hidden');
    }
}

function appendUserMessage(text) {
    hideWelcome();
    chatHistory.push({ role: 'user', content: text });

    const msg = document.createElement('div');
    msg.className = 'msg';
    msg.innerHTML = `
        <div class="msg-row">
            <div class="msg-avatar user">M</div>
            <div class="msg-body">
                <div class="msg-sender user">Du</div>
                <div class="msg-text">${escapeHtml(text)}</div>
            </div>
        </div>
    `;
    messagesEl.appendChild(msg);
    scrollToBottom();
}

function appendAssistantMessage(text) {
    hideWelcome();
    chatHistory.push({ role: 'assistant', content: text });

    // Check if last element is an assistant msg we can reuse (for tool calls followed by message)
    const lastMsg = messagesEl.lastElementChild;
    if (lastMsg && lastMsg.dataset.pendingAssistant) {
        const textEl = document.createElement('div');
        textEl.className = 'msg-text';
        textEl.innerHTML = renderMessage(text);
        lastMsg.querySelector('.msg-body').appendChild(textEl);
        delete lastMsg.dataset.pendingAssistant;
        scrollToBottom();
        return;
    }

    const msg = document.createElement('div');
    msg.className = 'msg';
    msg.innerHTML = `
        <div class="msg-row">
            <div class="msg-avatar assistant">C</div>
            <div class="msg-body">
                <div class="msg-sender assistant">Clara</div>
                <div class="msg-text">${renderMessage(text)}</div>
            </div>
        </div>
    `;
    messagesEl.appendChild(msg);
    scrollToBottom();
    updateChatList(text);
}

function appendToolCall(tool, args) {
    hideWelcome();
    const argsStr = Object.entries(args || {}).map(([k, v]) => `${k}: ${v}`).join('\n');

    // Check if there's already an assistant message block we can attach to
    let lastMsg = messagesEl.lastElementChild;
    let body;

    if (lastMsg && lastMsg.dataset.pendingAssistant) {
        body = lastMsg.querySelector('.msg-body');
    } else {
        lastMsg = document.createElement('div');
        lastMsg.className = 'msg';
        lastMsg.dataset.pendingAssistant = '1';
        lastMsg.innerHTML = `
            <div class="msg-row">
                <div class="msg-avatar assistant">C</div>
                <div class="msg-body">
                    <div class="msg-sender assistant">Clara</div>
                </div>
            </div>
        `;
        messagesEl.appendChild(lastMsg);
        body = lastMsg.querySelector('.msg-body');
    }

    const toolEl = document.createElement('div');
    toolEl.className = 'tool-call';
    toolEl.innerHTML = `
        <div class="tool-call-header">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>
            ${escapeHtml(tool)}
        </div>
        <div class="tool-call-body">${escapeHtml(argsStr)}</div>
    `;
    body.appendChild(toolEl);
    scrollToBottom();
}

function showTyping() {
    if (document.querySelector('.typing-indicator')) return;
    hideWelcome();

    const msg = document.createElement('div');
    msg.className = 'msg';
    msg.id = 'typingMsg';
    msg.innerHTML = `
        <div class="msg-row">
            <div class="msg-avatar assistant">C</div>
            <div class="msg-body">
                <div class="msg-sender assistant">Clara</div>
                <div class="typing-indicator"><span></span><span></span><span></span></div>
            </div>
        </div>
    `;
    messagesEl.appendChild(msg);
    scrollToBottom();
}

function removeTyping() {
    const el = document.getElementById('typingMsg');
    if (el) el.remove();
}

// ============ Actions ============

function send() {
    const text = input.value.trim();
    if (!text || !isConnected) return;

    appendUserMessage(text);
    ws.send(JSON.stringify({ message: text }));
    input.value = '';
    input.style.height = 'auto';
    updateSendBtn();
    showTyping();
}

function clearChat() {
    messagesEl.innerHTML = '';
    chatHistory = [];
    welcome.classList.remove('hidden');
}

function updateSendBtn() {
    const hasText = input.value.trim().length > 0;
    sendBtn.disabled = !hasText || !isConnected;
}

function updateChatList(lastMessage) {
    // Add current chat to sidebar if it's the first message
    if (chatHistory.length <= 2) {
        const item = document.createElement('div');
        item.className = 'chat-item active';
        const preview = chatHistory[0]?.content || lastMessage;
        item.textContent = preview.substring(0, 40) + (preview.length > 40 ? '...' : '');
        chatList.appendChild(item);
    }
}

// ============ Utilities ============

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function renderMessage(text) {
    // Escape HTML first for safety
    let html = escapeHtml(text);
    // Render markdown images that point to /generated/ (trusted local path only)
    html = html.replace(/!\[([^\]]*)\]\((\/generated\/[^)]+)\)/g,
        '<img class="msg-image" src="$2" alt="$1" loading="lazy">');
    return html;
}

function scrollToBottom() {
    requestAnimationFrame(() => {
        chatArea.scrollTop = chatArea.scrollHeight;
    });
}

// ============ Event Listeners ============

// Auto-resize textarea
input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 200) + 'px';
    updateSendBtn();
});

// Enter to send, Shift+Enter for newline
input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
    }
});

sendBtn.addEventListener('click', send);

// Sidebar toggle
sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('hidden');
});

// New chat
newChatBtn.addEventListener('click', () => {
    clearChat();
    // Reconnect for fresh session
    if (ws) ws.close();
});

// Clear chat
clearBtn.addEventListener('click', clearChat);

// Suggestion buttons
document.querySelectorAll('.suggestion').forEach(btn => {
    btn.addEventListener('click', () => {
        input.value = btn.dataset.msg;
        updateSendBtn();
        send();
    });
});

// ============ Init ============
connect();
