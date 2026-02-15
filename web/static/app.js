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
const ttsToggle = document.getElementById('ttsToggle');
const ttsIconOn = document.getElementById('ttsIconOn');
const ttsIconOff = document.getElementById('ttsIconOff');
const ttsAudio = document.getElementById('ttsAudio');
const uploadBtn = document.getElementById('uploadBtn');
const fileInput = document.getElementById('fileInput');
const uploadPreview = document.getElementById('uploadPreview');
const uploadThumb = document.getElementById('uploadThumb');
const uploadRemove = document.getElementById('uploadRemove');

let ws = null;
let isConnected = false;
let chatHistory = [];
let ttsEnabled = localStorage.getItem('ttsEnabled') === 'true';
let pendingUploadPath = null;
let selectedAgent = null;

// Init TTS toggle state
function updateTtsIcon() {
    ttsIconOn.style.display = ttsEnabled ? '' : 'none';
    ttsIconOff.style.display = ttsEnabled ? 'none' : '';
    ttsToggle.classList.toggle('active', ttsEnabled);
}

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
        } else if (data.type === 'stream') {
            appendStreamToken(data.token);
        } else if (data.type === 'stream_end') {
            finalizeStream();
        } else if (data.type === 'image') {
            appendImage(data.src, data.alt);
        } else if (data.type === 'tool_call') {
            appendToolCall(data.tool, data.args);
        } else if (data.type === 'audio') {
            playTtsAudio(data.src);
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

function appendUserMessage(text, imagePath) {
    hideWelcome();
    chatHistory.push({ role: 'user', content: text });

    let imageHtml = '';
    if (imagePath) {
        imageHtml = `<img class="msg-image" src="${imagePath}" alt="Hochgeladenes Bild" loading="lazy">`;
    }

    const msg = document.createElement('div');
    msg.className = 'msg';
    msg.innerHTML = `
        <div class="msg-row">
            <div class="msg-avatar user">M</div>
            <div class="msg-body">
                <div class="msg-sender user">Du</div>
                ${imageHtml}
                <div class="msg-text">${escapeHtml(text)}</div>
            </div>
        </div>
    `;
    messagesEl.appendChild(msg);
    scrollToBottom();
}

function appendAssistantMessage(text) {
    hideWelcome();
    _markAllActivitiesDone();
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

// Tool display config: icon SVG, labels, color
const TOOL_META = {
    image_generation: {
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
        label: 'Bild generiert',
        activeLabel: 'Generiert Bild...',
        color: '#a78bfa',
    },
    web_browse: {
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>',
        label: 'Web-Suche abgeschlossen',
        activeLabel: 'Sucht im Web...',
        color: '#38bdf8',
    },
    web_fetch: {
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>',
        label: 'Seite abgerufen',
        activeLabel: 'Ruft Webseite ab...',
        color: '#38bdf8',
    },
    file_manager: {
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>',
        label: 'Datei-Zugriff abgeschlossen',
        activeLabel: 'Greift auf Datei zu...',
        color: '#fbbf24',
    },
    system_command: {
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
        label: 'Befehl ausgefuehrt',
        activeLabel: 'Fuehrt Befehl aus...',
        color: '#f472b6',
    },
    project_manager: {
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>',
        label: 'Projekt verwaltet',
        activeLabel: 'Verwaltet Projekt...',
        color: '#34d399',
    },
    task_scheduler: {
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
        label: 'Aufgabe geplant',
        activeLabel: 'Plant Aufgabe...',
        color: '#fb923c',
    },
    memory_manager: {
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/><path d="M12 16v-4M12 8h.01"/></svg>',
        label: 'Gedaechtnis aktualisiert',
        activeLabel: 'Zugriff auf Gedaechtnis...',
        color: '#c084fc',
    },
};

const _AGENT_META = {
    coding:       { label: 'Coding-Agent fertig', activeLabel: 'Coding-Agent arbeitet...', color: '#f472b6' },
    research:     { label: 'Recherche abgeschlossen', activeLabel: 'Research-Agent recherchiert...', color: '#38bdf8' },
    image_prompt: { label: 'Bild-Agent fertig', activeLabel: 'Bild-Agent erstellt Prompt...', color: '#a78bfa' },
};

const _AGENT_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>';

const _DEFAULT_TOOL_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>';

function _getToolMeta(toolName) {
    // agent:name format
    if (toolName.startsWith('agent:')) {
        const agentName = toolName.split(':')[1];
        const m = _AGENT_META[agentName] || { label: agentName, activeLabel: `${agentName} arbeitet...`, color: '#c084fc' };
        return { icon: _AGENT_ICON, ...m };
    }
    // sub-agent tool format (coding:file_manager)
    const baseName = toolName.includes(':') ? toolName.split(':')[1] : toolName;
    return TOOL_META[baseName] || {
        icon: _DEFAULT_TOOL_ICON,
        label: baseName,
        activeLabel: `${baseName}...`,
        color: 'var(--accent)',
    };
}

function _markActivityDone(card) {
    if (card.classList.contains('done')) return;
    card.classList.add('done');
    const spinner = card.querySelector('.activity-spinner');
    if (spinner) {
        spinner.outerHTML = '<svg class="activity-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
    }
    const label = card.querySelector('.activity-label');
    if (label && card.dataset.toolName) {
        const meta = _getToolMeta(card.dataset.toolName);
        label.textContent = meta.label;
    }
}

function _markAllActivitiesDone() {
    document.querySelectorAll('.activity-card:not(.done)').forEach(c => _markActivityDone(c));
}

function appendToolCall(tool, args) {
    hideWelcome();
    const meta = _getToolMeta(tool);

    // Build a concise detail string
    const argsStr = Object.entries(args || {}).map(([k, v]) => {
        const s = String(v);
        return `${k}: ${s.length > 100 ? s.substring(0, 100) + '...' : s}`;
    }).join('\n');

    // Mark any previous still-active cards as done
    _markAllActivitiesDone();

    // Get or create assistant message block
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

    const card = document.createElement('div');
    card.className = 'activity-card';
    card.dataset.toolName = tool;
    card.style.setProperty('--activity-color', meta.color);
    card.innerHTML = `
        <div class="activity-header">
            <span class="activity-icon">${meta.icon}</span>
            <span class="activity-label">${escapeHtml(meta.activeLabel)}</span>
            <span class="activity-spinner"></span>
        </div>
        ${argsStr ? `<div class="activity-detail">${escapeHtml(argsStr)}</div>` : ''}
    `;
    body.appendChild(card);
    scrollToBottom();
}

function appendImage(src, alt) {
    hideWelcome();
    _markAllActivitiesDone();

    // Attach to existing pending assistant message or create new one
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

    const imgEl = document.createElement('div');
    imgEl.className = 'msg-text';
    imgEl.innerHTML = `<img class="msg-image" src="${src}" alt="${escapeHtml(alt)}" loading="lazy">`;
    body.appendChild(imgEl);
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

// ============ Streaming ============

let _streamingMsg = null;
let _streamingText = '';

function appendStreamToken(token) {
    hideWelcome();
    _markAllActivitiesDone();
    _streamingText += token;

    if (!_streamingMsg) {
        // Check if there's a pending assistant message (from tool calls)
        const lastMsg = messagesEl.lastElementChild;
        if (lastMsg && lastMsg.dataset.pendingAssistant) {
            _streamingMsg = lastMsg;
            const textEl = document.createElement('div');
            textEl.className = 'msg-text streaming-text';
            textEl.innerHTML = renderMessage(_streamingText);
            _streamingMsg.querySelector('.msg-body').appendChild(textEl);
        } else {
            _streamingMsg = document.createElement('div');
            _streamingMsg.className = 'msg';
            _streamingMsg.innerHTML = `
                <div class="msg-row">
                    <div class="msg-avatar assistant">C</div>
                    <div class="msg-body">
                        <div class="msg-sender assistant">Clara</div>
                        <div class="msg-text streaming-text">${renderMessage(_streamingText)}</div>
                    </div>
                </div>
            `;
            messagesEl.appendChild(_streamingMsg);
        }
    } else {
        const textEl = _streamingMsg.querySelector('.streaming-text');
        if (textEl) {
            textEl.innerHTML = renderMessage(_streamingText);
        }
    }
    scrollToBottom();
}

function finalizeStream() {
    if (_streamingMsg) {
        const textEl = _streamingMsg.querySelector('.streaming-text');
        if (textEl) {
            textEl.classList.remove('streaming-text');
        }
        delete _streamingMsg.dataset.pendingAssistant;
        chatHistory.push({ role: 'assistant', content: _streamingText });
        updateChatList(_streamingText);
    }
    _streamingMsg = null;
    _streamingText = '';
}

// ============ Actions ============

function send() {
    const text = input.value.trim();
    if (!text && !pendingUploadPath) return;
    if (!isConnected) return;

    const displayText = pendingUploadPath
        ? (text ? `[Bild] ${text}` : '[Bild angehängt]')
        : text;
    appendUserMessage(displayText, pendingUploadPath);

    const payload = { message: text, tts: ttsEnabled };
    if (pendingUploadPath) {
        payload.image = pendingUploadPath;
    }
    if (selectedAgent) {
        payload.agent = selectedAgent;
    }
    ws.send(JSON.stringify(payload));

    input.value = '';
    input.style.height = 'auto';
    clearUploadPreview();
    updateSendBtn();
    showTyping();
}

function clearChat() {
    messagesEl.innerHTML = '';
    chatHistory = [];
    welcome.classList.remove('hidden');
}

function updateSendBtn() {
    const hasContent = input.value.trim().length > 0 || pendingUploadPath;
    sendBtn.disabled = !hasContent || !isConnected;
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

// ============ TTS ============

function playTtsAudio(src) {
    ttsAudio.pause();
    ttsAudio.src = src;
    ttsAudio.play().catch(e => console.log('Audio playback skipped:', e));
}

// ============ Image Upload ============

async function uploadImage(file) {
    const formData = new FormData();
    formData.append('file', file);

    try {
        const resp = await fetch('/api/upload', { method: 'POST', body: formData });
        if (!resp.ok) throw new Error('Upload fehlgeschlagen');
        const data = await resp.json();
        pendingUploadPath = data.path;

        uploadThumb.src = data.path;
        uploadPreview.style.display = 'flex';
        updateSendBtn();
    } catch (e) {
        console.error('Upload error:', e);
    }
}

function clearUploadPreview() {
    pendingUploadPath = null;
    uploadPreview.style.display = 'none';
    uploadThumb.src = '';
    fileInput.value = '';
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

// TTS toggle
ttsToggle.addEventListener('click', () => {
    ttsEnabled = !ttsEnabled;
    localStorage.setItem('ttsEnabled', ttsEnabled);
    updateTtsIcon();
});

// Upload button
uploadBtn.addEventListener('click', () => fileInput.click());

// File input change
fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
        uploadImage(fileInput.files[0]);
    }
});

// Remove uploaded image
uploadRemove.addEventListener('click', clearUploadPreview);

// Paste image from clipboard
input.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
        if (item.type.startsWith('image/')) {
            e.preventDefault();
            const file = item.getAsFile();
            if (file) uploadImage(file);
            break;
        }
    }
});

// ============ Agent Selector ============

async function loadAgents() {
    try {
        const resp = await fetch('/api/agents');
        const data = await resp.json();
        populateAgentDropdown(data.agents);
    } catch (e) {
        console.error('Failed to load agents:', e);
    }
}

function populateAgentDropdown(agents) {
    const dropdown = document.getElementById('agentDropdown');
    if (!dropdown) return;
    dropdown.innerHTML = '';

    // "Clara" option (normal mode)
    const claraOpt = document.createElement('div');
    claraOpt.className = 'agent-option active';
    claraOpt.dataset.agent = '';
    claraOpt.innerHTML = `
        <div class="agent-option-radio"></div>
        <div class="agent-option-info">
            <div class="agent-option-name">Clara</div>
            <div class="agent-option-desc">Normaler Modus - kann an Agenten delegieren</div>
        </div>
    `;
    claraOpt.addEventListener('click', () => selectAgent(null, 'Clara', null));
    dropdown.appendChild(claraOpt);

    for (const agent of agents) {
        const opt = document.createElement('div');
        opt.className = 'agent-option';
        opt.dataset.agent = agent.name;
        opt.innerHTML = `
            <div class="agent-option-radio"></div>
            <div class="agent-option-info">
                <div class="agent-option-name">${escapeHtml(agent.name)}</div>
                <div class="agent-option-desc">${escapeHtml(agent.description)}</div>
            </div>
        `;
        opt.addEventListener('click', () => selectAgent(agent.name, agent.name, agent.model));
        dropdown.appendChild(opt);
    }
}

function selectAgent(agentName, displayLabel, model) {
    selectedAgent = agentName;
    document.getElementById('agentLabel').textContent = displayLabel;

    const badge = document.getElementById('modelBadge');
    badge.textContent = model ? model.split('/').pop().split(':')[0] : 'qwen3-abliterated';

    const target = agentName || '';
    document.querySelectorAll('.agent-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.agent === target);
    });

    document.getElementById('agentSelector').classList.remove('open');

    input.placeholder = agentName
        ? `Nachricht an ${displayLabel}...`
        : 'Nachricht an Clara...';
}

// Agent selector toggle
document.getElementById('agentSelectorBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('agentSelector').classList.toggle('open');
});

// Close dropdown on outside click
document.addEventListener('click', (e) => {
    const selector = document.getElementById('agentSelector');
    if (!selector.contains(e.target)) {
        selector.classList.remove('open');
    }
});

// ============ Init ============
updateTtsIcon();
connect();
loadAgents();
