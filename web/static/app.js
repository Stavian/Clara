const chat = document.getElementById('chat');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');
const statusDot = document.querySelector('.status-dot');
const statusText = document.querySelector('.status-text');

let ws = null;
let isConnected = false;

function connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${location.host}/api/chat`);

    ws.onopen = () => {
        isConnected = true;
        statusDot.className = 'status-dot connected';
        statusText.textContent = 'Verbunden';
        sendBtn.disabled = false;
    };

    ws.onclose = () => {
        isConnected = false;
        statusDot.className = 'status-dot error';
        statusText.textContent = 'Getrennt';
        sendBtn.disabled = true;
        setTimeout(connect, 3000);
    };

    ws.onerror = () => {
        statusDot.className = 'status-dot error';
        statusText.textContent = 'Fehler';
    };

    ws.onmessage = (event) => {
        removeTyping();
        const data = JSON.parse(event.data);

        if (data.type === 'message') {
            addMessage('assistant', data.content);
        } else if (data.type === 'tool_call') {
            addToolCall(data.tool, data.args);
        } else if (data.type === 'error') {
            addMessage('assistant', `Fehler: ${data.content}`);
        }
    };
}

function addMessage(role, content) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.innerHTML = `<div class="message-content">${escapeHtml(content)}</div>`;
    chat.appendChild(div);
    scrollToBottom();
}

function addToolCall(tool, args) {
    const div = document.createElement('div');
    div.className = 'message tool';
    const argsStr = Object.entries(args).map(([k, v]) => `${k}: ${v}`).join(', ');
    div.innerHTML = `
        <div class="tool-label">🔧 ${escapeHtml(tool)}</div>
        <div class="message-content">${escapeHtml(argsStr)}</div>
    `;
    chat.appendChild(div);
    scrollToBottom();
}

function showTyping() {
    if (document.querySelector('.typing')) return;
    const div = document.createElement('div');
    div.className = 'message assistant';
    div.innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
    chat.appendChild(div);
    scrollToBottom();
}

function removeTyping() {
    const typing = document.querySelector('.typing');
    if (typing) typing.closest('.message').remove();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function scrollToBottom() {
    chat.scrollTop = chat.scrollHeight;
}

function send() {
    const text = input.value.trim();
    if (!text || !isConnected) return;

    addMessage('user', text);
    ws.send(JSON.stringify({ message: text }));
    input.value = '';
    input.style.height = 'auto';
    showTyping();
}

// Auto-resize textarea
input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 150) + 'px';
});

// Send on Enter (Shift+Enter for newline)
input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
    }
});

sendBtn.addEventListener('click', send);

connect();
