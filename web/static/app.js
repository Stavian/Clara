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

// ============ Auth ============
let _authToken = localStorage.getItem('authToken');

function _getAuthHeaders() {
    return (_authToken && _authToken !== 'disabled')
        ? { 'Authorization': `Bearer ${_authToken}` } : {};
}

async function _authedFetch(url, opts = {}) {
    const resp = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), ..._getAuthHeaders() } });
    if (resp.status === 401) { _logout(); return null; }
    return resp;
}

function _logout() {
    localStorage.removeItem('authToken');
    _authToken = null;
    document.getElementById('loginOverlay').classList.remove('hidden');
}

async function initAuth() {
    let authEnabled = true;
    try {
        const chk = await fetch('/api/auth/check');
        const data = await chk.json();
        authEnabled = data.auth_enabled;
    } catch (_) { /* assume auth required */ }

    if (!authEnabled) {
        _authToken = 'disabled';
        document.getElementById('loginOverlay').classList.add('hidden');
        _afterLogin();
        return;
    }

    // Try existing stored token
    if (_authToken && _authToken !== 'disabled') {
        const probe = await fetch('/api/agents', { headers: _getAuthHeaders() });
        if (probe.ok) {
            document.getElementById('loginOverlay').classList.add('hidden');
            _afterLogin();
            return;
        }
        localStorage.removeItem('authToken');
        _authToken = null;
    }

    document.getElementById('loginOverlay').classList.remove('hidden');
}

function _afterLogin() {
    connect();
    loadAgents();
    const initHash = location.hash.slice(1);
    if (initHash && _views[initHash]) {
        switchView(initHash);
    }
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('loginPassword').value;
    const btn = document.getElementById('loginBtn');
    const err = document.getElementById('loginError');
    err.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = '...';
    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password }),
        });
        if (res.status === 429) {
            err.textContent = 'Zu viele Versuche. Bitte warten.';
            err.classList.remove('hidden');
            return;
        }
        if (!res.ok) {
            err.textContent = 'Falsches Passwort';
            err.classList.remove('hidden');
            return;
        }
        const { token } = await res.json();
        _authToken = token;
        localStorage.setItem('authToken', token);
        document.getElementById('loginOverlay').classList.add('hidden');
        _afterLogin();
    } catch (_) {
        err.textContent = 'Verbindungsfehler';
        err.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Anmelden';
    }
});

// Init TTS toggle state
function updateTtsIcon() {
    ttsIconOn.style.display = ttsEnabled ? '' : 'none';
    ttsIconOff.style.display = ttsEnabled ? 'none' : '';
    ttsToggle.classList.toggle('active', ttsEnabled);
}

// ============ WebSocket ============

function connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const tokenParam = (_authToken && _authToken !== 'disabled')
        ? `?token=${encodeURIComponent(_authToken)}` : '';
    ws = new WebSocket(`${protocol}//${location.host}/api/chat${tokenParam}`);

    ws.onopen = () => {
        isConnected = true;
        statusIndicator.className = 'status-indicator connected';
        statusIndicator.title = 'Verbunden';
        updateSendBtn();
    };

    ws.onclose = (event) => {
        isConnected = false;
        statusIndicator.className = 'status-indicator error';
        updateSendBtn();
        if (event.code === 4401) {
            // Token rejected — show login instead of reconnecting
            _logout();
            return;
        }
        statusIndicator.title = 'Getrennt - Verbindung wird wiederhergestellt...';
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
            showToast(data.content, 'error');
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
        applyHighlighting(textEl);
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
    applyHighlighting(msg);
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
    screenshot: {
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
        label: 'Screenshot erstellt',
        activeLabel: 'Erstellt Screenshot...',
        color: '#60a5fa',
    },
    clipboard: {
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>',
        label: 'Zwischenablage verarbeitet',
        activeLabel: 'Zugriff auf Zwischenablage...',
        color: '#a3e635',
    },
    pdf_reader: {
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
        label: 'PDF verarbeitet',
        activeLabel: 'Liest PDF...',
        color: '#f87171',
    },
    calculator: {
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="10" y2="10"/><line x1="14" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="10" y2="14"/><line x1="14" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="16" y2="18"/></svg>',
        label: 'Berechnung abgeschlossen',
        activeLabel: 'Berechnet...',
        color: '#2dd4bf',
    },
    calendar_manager: {
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
        label: 'Kalender aktualisiert',
        activeLabel: 'Zugriff auf Kalender...',
        color: '#fbbf24',
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
            applyHighlighting(textEl);
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
    _hideSlashMenu();

    if (!text && !pendingUploadPath) return;

    // Handle slash commands client-side
    if (text.startsWith('/')) {
        input.value = '';
        input.style.height = 'auto';
        updateSendBtn();
        handleSlashCommand(text);
        return;
    }

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
    const codeBlocks = [];
    const inlineCodes = [];

    // 1. Extract fenced code blocks
    let s = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
        const idx = codeBlocks.length;
        codeBlocks.push({ lang: lang.toLowerCase(), code });
        return `%%CODE_${idx}%%`;
    });

    // 2. Extract inline code
    s = s.replace(/`([^`\n]+)`/g, (_, code) => {
        const idx = inlineCodes.length;
        inlineCodes.push(code);
        return `%%IC${idx}%%`;
    });

    // 3. HTML-escape remaining text
    s = escapeHtml(s);

    // 4. Block-level: trusted images ![alt](/generated/...)
    s = s.replace(/!\[([^\]]*)\]\((\/generated\/[^)]+)\)/g,
        '<img class="msg-image" src="$2" alt="$1" loading="lazy">');

    // 5. Block-level formatting (process line by line)
    const lines = s.split('\n');
    const out = [];
    let inUl = false, inOl = false, inBlockquote = false;

    function closeBlocks() {
        if (inUl)        { out.push('</ul>');         inUl = false; }
        if (inOl)        { out.push('</ol>');         inOl = false; }
        if (inBlockquote){ out.push('</blockquote>'); inBlockquote = false; }
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Headings
        const hMatch = line.match(/^(#{1,4})\s+(.*)/);
        if (hMatch) {
            closeBlocks();
            const level = hMatch[1].length;
            out.push(`<h${level} class="md-h">${hMatch[2]}</h${level}>`);
            continue;
        }

        // Horizontal rule
        if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
            closeBlocks();
            out.push('<hr class="md-hr">');
            continue;
        }

        // Blockquote
        const bqMatch = line.match(/^&gt;\s?(.*)/);
        if (bqMatch) {
            if (!inBlockquote) { closeBlocks(); out.push('<blockquote class="md-bq">'); inBlockquote = true; }
            out.push(bqMatch[1]);
            continue;
        }

        // Unordered list
        const ulMatch = line.match(/^[-*]\s+(.*)/);
        if (ulMatch) {
            if (inBlockquote) { closeBlocks(); }
            if (!inUl) { if (inOl) { out.push('</ol>'); inOl = false; } out.push('<ul class="md-ul">'); inUl = true; }
            out.push(`<li>${ulMatch[1]}</li>`);
            continue;
        }

        // Ordered list
        const olMatch = line.match(/^\d+\.\s+(.*)/);
        if (olMatch) {
            if (inBlockquote) { closeBlocks(); }
            if (!inOl) { if (inUl) { out.push('</ul>'); inUl = false; } out.push('<ol class="md-ol">'); inOl = true; }
            out.push(`<li>${olMatch[1]}</li>`);
            continue;
        }

        // Empty line — close open blocks, emit paragraph break
        if (line.trim() === '') {
            closeBlocks();
            out.push('<div class="md-spacer"></div>');
            continue;
        }

        closeBlocks();
        out.push(line);
    }
    closeBlocks();
    s = out.join('\n');

    // 6. Inline formatting
    s = s.replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_, a, b) => `<strong>${a || b}</strong>`);
    s = s.replace(/\*(.+?)\*|_(.+?)_/g, (_, a, b) => `<em>${a || b}</em>`);
    s = s.replace(/~~(.+?)~~/g, '<s>$1</s>');

    // 7. Restore inline code
    s = s.replace(/%%IC(\d+)%%/g, (_, i) =>
        `<code class="inline-code">${escapeHtml(inlineCodes[parseInt(i)])}</code>`);

    // 8. Restore fenced code blocks
    s = s.replace(/%%CODE_(\d+)%%/g, (_, i) => {
        const { lang, code } = codeBlocks[parseInt(i)];
        const escapedCode = escapeHtml(code);
        const langLabel = lang || 'code';
        const langClass = lang ? `language-${lang}` : '';
        return `<div class="code-block-wrapper"><div class="code-block-header"><span class="code-lang">${escapeHtml(langLabel)}</span><button class="code-copy-btn" type="button">Kopieren</button></div><pre><code class="${langClass}">${escapedCode}</code></pre></div>`;
    });

    return s;
}

function applyHighlighting(containerEl) {
    if (typeof hljs === 'undefined') return;
    containerEl.querySelectorAll('pre code').forEach(block => {
        hljs.highlightElement(block);
    });
}

function scrollToBottom() {
    requestAnimationFrame(() => {
        chatArea.scrollTop = chatArea.scrollHeight;
    });
}

// ============ Toast Notifications ============

function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    // Trigger animation
    requestAnimationFrame(() => toast.classList.add('toast-visible'));
    setTimeout(() => {
        toast.classList.remove('toast-visible');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, duration);
}

// ============ Lightbox ============

const _lightbox = document.getElementById('lightbox');
const _lightboxImg = document.getElementById('lightboxImg');

function openLightbox(src, alt) {
    _lightboxImg.src = src;
    _lightboxImg.alt = alt || '';
    _lightbox.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    _lightbox.classList.add('hidden');
    document.body.style.overflow = '';
    _lightboxImg.src = '';
}

_lightbox.addEventListener('click', (e) => {
    if (e.target === _lightbox) closeLightbox();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !_lightbox.classList.contains('hidden')) closeLightbox();
});

// Delegate image clicks to lightbox
messagesEl.addEventListener('click', (e) => {
    const img = e.target.closest('.msg-image');
    if (img) openLightbox(img.src, img.alt);
});

// Delegate copy button clicks
messagesEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.code-copy-btn');
    if (!btn) return;
    const code = btn.closest('.code-block-wrapper')?.querySelector('code');
    if (!code) return;
    navigator.clipboard.writeText(code.textContent).then(() => {
        btn.textContent = 'Kopiert!';
        setTimeout(() => { btn.textContent = 'Kopieren'; }, 1500);
    }).catch(() => showToast('Kopieren fehlgeschlagen', 'error'));
});

// ============ Slash Commands ============

const _slashCommands = [
    { cmd: '/clear',      desc: 'Chat leeren' },
    { cmd: '/help',       desc: 'Hilfe anzeigen' },
    { cmd: '/dashboard',  desc: 'Dashboard öffnen' },
    { cmd: '/projekte',   desc: 'Projekte öffnen' },
    { cmd: '/settings',   desc: 'Einstellungen öffnen' },
    { cmd: '/agent',      desc: 'Agent wechseln: /agent [name]' },
];

const _slashMenu = document.getElementById('slashMenu');
let _slashSelected = -1;

function _showSlashMenu(value) {
    const query = value.slice(1).toLowerCase();
    const matches = _slashCommands.filter(c => c.cmd.slice(1).startsWith(query));
    if (matches.length === 0) { _hideSlashMenu(); return; }

    _slashMenu.innerHTML = matches.map((c, i) =>
        `<div class="slash-menu-item" data-cmd="${c.cmd}"><span class="slash-cmd">${c.cmd}</span><span class="slash-desc">${c.desc}</span></div>`
    ).join('');
    _slashMenu.classList.remove('hidden');
    _slashSelected = -1;

    _slashMenu.querySelectorAll('.slash-menu-item').forEach(item => {
        item.addEventListener('click', () => {
            input.value = item.dataset.cmd + ' ';
            _hideSlashMenu();
            input.focus();
            updateSendBtn();
        });
    });
}

function _hideSlashMenu() {
    _slashMenu.classList.add('hidden');
    _slashSelected = -1;
}

function _slashMenuNavigate(dir) {
    const items = _slashMenu.querySelectorAll('.slash-menu-item');
    if (items.length === 0) return false;
    items.forEach(i => i.classList.remove('active'));
    _slashSelected = Math.max(0, Math.min(items.length - 1, _slashSelected + dir));
    items[_slashSelected].classList.add('active');
    return true;
}

function handleSlashCommand(text) {
    const parts = text.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const arg = parts.slice(1).join(' ');

    switch (cmd) {
        case '/clear':
            clearChat();
            break;
        case '/help':
            appendAssistantMessage(
                '**Verfügbare Slash-Befehle:**\n' +
                '- `/clear` — Chat leeren\n' +
                '- `/help` — Diese Hilfe anzeigen\n' +
                '- `/dashboard` — Dashboard öffnen\n' +
                '- `/projekte` — Projekte öffnen\n' +
                '- `/settings` — Einstellungen öffnen\n' +
                '- `/agent [name]` — Agent wechseln'
            );
            break;
        case '/dashboard':
            switchView('dashboard');
            break;
        case '/projekte':
            switchView('projekte');
            break;
        case '/settings':
            switchView('settings');
            break;
        case '/agent':
            if (!arg) { showToast('Verwendung: /agent [name]', 'info'); return; }
            // Find agent by name (case-insensitive)
            const agentOpt = document.querySelector(`.agent-option[data-agent="${arg}"]`);
            if (agentOpt) {
                agentOpt.click();
                showToast(`Agent gewechselt: ${arg}`, 'success');
            } else {
                showToast(`Agent nicht gefunden: ${arg}`, 'error');
            }
            break;
        default:
            showToast(`Unbekannter Befehl: ${cmd}`, 'error');
    }
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
        const resp = await _authedFetch('/api/upload', { method: 'POST', body: formData });
        if (!resp || !resp.ok) throw new Error('Upload fehlgeschlagen');
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

// Auto-resize textarea + slash menu
input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 200) + 'px';
    updateSendBtn();
    const val = input.value;
    if (val.startsWith('/') && val.length > 0) {
        _showSlashMenu(val);
    } else {
        _hideSlashMenu();
    }
});

// Enter to send, Shift+Enter for newline, arrow keys for slash menu
input.addEventListener('keydown', (e) => {
    if (!_slashMenu.classList.contains('hidden')) {
        if (e.key === 'ArrowDown') { e.preventDefault(); _slashMenuNavigate(1); return; }
        if (e.key === 'ArrowUp')   { e.preventDefault(); _slashMenuNavigate(-1); return; }
        if (e.key === 'Tab' || e.key === 'Enter') {
            const active = _slashMenu.querySelector('.slash-menu-item.active');
            if (active) {
                e.preventDefault();
                input.value = active.dataset.cmd + ' ';
                _hideSlashMenu();
                updateSendBtn();
                return;
            }
        }
        if (e.key === 'Escape') { e.preventDefault(); _hideSlashMenu(); return; }
    }
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
        const resp = await _authedFetch('/api/agents');
        if (!resp) return;
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

// ============ View Router ============

const _views = { chat: 'viewChat', dashboard: 'viewDashboard', projekte: 'viewProjekte', settings: 'viewSettings' };
const _viewTitles = { chat: 'Clara', dashboard: 'Dashboard', projekte: 'Projekte', settings: 'Einstellungen' };
let _currentView = 'chat';
let _dashboardInterval = null;

function switchView(viewName) {
    if (!_views[viewName]) viewName = 'chat';
    _currentView = viewName;

    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById(_views[viewName]).classList.remove('hidden');

    document.querySelectorAll('.nav-item').forEach(n => {
        n.classList.toggle('active', n.dataset.view === viewName);
    });

    document.getElementById('topbarTitle').textContent = _viewTitles[viewName];

    // Show/hide chat-specific topbar actions
    clearBtn.style.display = viewName === 'chat' ? '' : 'none';

    if (viewName === 'dashboard') {
        loadDashboard();
        _dashboardInterval = setInterval(loadDashboard, 30000);
    } else {
        if (_dashboardInterval) { clearInterval(_dashboardInterval); _dashboardInterval = null; }
    }
    if (viewName === 'projekte') loadProjekte();
    if (viewName === 'settings') loadSettings();

    history.replaceState(null, '', '#' + viewName);
}

// Nav click handlers
document.querySelectorAll('.nav-item').forEach(nav => {
    nav.addEventListener('click', (e) => {
        e.preventDefault();
        switchView(nav.dataset.view);
    });
});

// ============ Dashboard ============

async function loadDashboard() {
    const [statsRes, statusRes, activityRes, overviewRes, storageRes] = await Promise.all([
        _authedFetch('/api/dashboard/stats').catch(() => null),
        _authedFetch('/api/dashboard/status').catch(() => null),
        _authedFetch('/api/dashboard/activity').catch(() => null),
        _authedFetch('/api/dashboard/overview').catch(() => null),
        _authedFetch('/api/dashboard/storage').catch(() => null),
    ]);

    if (statusRes?.ok) renderStatusCards(await statusRes.json());
    if (statsRes?.ok) renderStatsGrid(await statsRes.json());
    if (storageRes?.ok) renderStorageDisplay(await storageRes.json());
    if (activityRes?.ok) renderActivityList((await activityRes.json()).events);
    if (overviewRes?.ok) {
        const ov = await overviewRes.json();
        renderSkillList(ov.skills);
        renderAgentDashList(ov.agents);
        renderJobsList(ov.jobs);
    }
}

function renderStatusCards(status) {
    const el = document.getElementById('statusCards');
    el.innerHTML = [
        { name: 'Ollama', ok: status.ollama },
        { name: 'Stable Diffusion', ok: status.stable_diffusion },
        { name: 'Discord', ok: status.discord },
    ].map(s => `
        <div class="status-pill">
            <span class="status-dot ${s.ok ? 'ok' : 'error'}"></span>
            <span>${s.name}</span>
        </div>
    `).join('') + `
        <div class="status-pill">
            <span style="color:var(--accent);font-weight:600;">${escapeHtml(status.model || '')}</span>
        </div>
    `;
}

function renderStatsGrid(stats) {
    const el = document.getElementById('statsGrid');
    const items = [
        { value: stats.conversations || 0, label: 'Konversationen' },
        { value: stats.memories || 0, label: 'Erinnerungen' },
        { value: stats.projects?.total || 0, label: 'Projekte' },
        { value: stats.tasks?.total || 0, label: 'Aufgaben' },
    ];
    el.innerHTML = items.map(i => `
        <div class="stat-card">
            <div class="stat-value">${i.value}</div>
            <div class="stat-label">${i.label}</div>
        </div>
    `).join('');
}

function renderActivityList(events) {
    const el = document.getElementById('activityList');
    if (!events || events.length === 0) {
        el.innerHTML = '<div class="dash-empty">Keine aktuellen Ereignisse</div>';
        return;
    }
    el.innerHTML = events.map(e => {
        const time = e.timestamp ? new Date(e.timestamp).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
        return `
            <div class="event-item">
                <span class="event-type">${escapeHtml(e.type)}</span>
                <span class="event-source">${escapeHtml(e.source)}</span>
                <span class="event-time">${time}</span>
            </div>
        `;
    }).join('');
}

function renderSkillList(skills) {
    const el = document.getElementById('skillList');
    if (!skills || skills.length === 0) {
        el.innerHTML = '<div class="dash-empty">Keine Skills</div>';
        return;
    }
    el.innerHTML = skills.map(s => `
        <div class="list-item">
            <span class="list-item-name">${escapeHtml(s.name)}</span>
            <span class="list-item-desc">${escapeHtml(s.description || '')}</span>
        </div>
    `).join('');
}

function renderAgentDashList(agents) {
    const el = document.getElementById('agentDashList');
    if (!agents || agents.length === 0) {
        el.innerHTML = '<div class="dash-empty">Keine Agenten</div>';
        return;
    }
    el.innerHTML = agents.map(a => `
        <div class="list-item">
            <span class="list-item-name">${escapeHtml(a.name)}</span>
            <span class="list-item-badge">${escapeHtml(a.model || '')}</span>
        </div>
    `).join('');
}

function renderJobsList(jobs) {
    const el = document.getElementById('jobsList');
    if (!jobs || jobs.length === 0) {
        el.innerHTML = '<div class="dash-empty">Keine geplanten Aufgaben</div>';
        return;
    }
    el.innerHTML = jobs.map(j => `
        <div class="list-item">
            <span class="list-item-name">${escapeHtml(j.name)}</span>
            <span class="list-item-desc" style="font-family:monospace;">${escapeHtml(j.cron || '')}</span>
            <span class="list-item-desc">${escapeHtml(j.command || '')}</span>
        </div>
    `).join('');
}

// ============ Storage Display ============

function _formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

function renderStorageDisplay(data) {
    const el = document.getElementById('storageDisplay');
    const bars = [
        { label: 'Datenbank', size: data.db_size, color: 'var(--accent)' },
        { label: 'Generierte Bilder', size: data.images_size, color: '#a78bfa' },
        { label: 'Audio', size: data.audio_size, color: '#f472b6' },
        { label: 'Uploads', size: data.uploads_size, color: '#fbbf24' },
    ];
    const maxSize = Math.max(...bars.map(b => b.size), 1);

    let html = `<div class="storage-total">
        <span class="storage-total-label">Gesamt</span>
        <span class="storage-total-value">${_formatBytes(data.total_size)}</span>
    </div>`;

    html += '<div class="storage-bars">';
    for (const bar of bars) {
        const pct = Math.max((bar.size / maxSize) * 100, 2);
        html += `
            <div class="storage-bar-row">
                <span class="storage-bar-label">${bar.label}</span>
                <div class="storage-bar-track">
                    <div class="storage-bar-fill" style="width:${pct}%;background:${bar.color}"></div>
                </div>
                <span class="storage-bar-value">${_formatBytes(bar.size)}</span>
            </div>
        `;
    }
    html += '</div>';

    if (data.memory_by_category && data.memory_by_category.length > 0) {
        html += '<div class="storage-memory-cats">';
        html += '<div class="storage-subtitle">Erinnerungen nach Kategorie</div>';
        for (const cat of data.memory_by_category) {
            html += `
                <div class="storage-cat-row">
                    <span class="storage-cat-name">${escapeHtml(cat.category)}</span>
                    <span class="storage-cat-count">${cat.count}</span>
                </div>
            `;
        }
        html += '</div>';
    }

    html += `<div class="storage-conv-count">${data.conversations} Konversationen gespeichert</div>`;
    el.innerHTML = html;
}

// ============ Projekte ============

let _projekteData = [];

async function loadProjekte() {
    const res = await _authedFetch('/api/projects').catch(() => null);
    if (res?.ok) {
        const data = await res.json();
        _projekteData = data.projects || [];
        renderProjectList();
    }
}

function renderProjectList() {
    const el = document.getElementById('projectList');
    if (_projekteData.length === 0) {
        el.innerHTML = '<div class="dash-empty">Keine Projekte vorhanden</div>';
        return;
    }

    el.innerHTML = _projekteData.map(p => {
        const statusClass = p.status === 'active' ? 'active' : p.status === 'completed' ? 'completed' : 'archived';
        const statusLabel = p.status === 'active' ? 'Aktiv' : p.status === 'completed' ? 'Abgeschlossen' : 'Archiviert';
        const taskTotal = p.task_count || 0;
        const tasksDone = p.tasks_done || 0;
        const progress = taskTotal > 0 ? Math.round((tasksDone / taskTotal) * 100) : 0;

        return `
            <div class="project-card" data-project-id="${p.id}">
                <div class="project-card-header" onclick="toggleProjectTasks(${p.id})">
                    <div class="project-card-info">
                        <div class="project-card-name">${escapeHtml(p.name)}</div>
                        ${p.description ? `<div class="project-card-desc">${escapeHtml(p.description)}</div>` : ''}
                    </div>
                    <div class="project-card-meta">
                        <span class="project-status-badge ${statusClass}">${statusLabel}</span>
                        <span class="project-task-count">${tasksDone}/${taskTotal} Aufgaben</span>
                        ${taskTotal > 0 ? `
                            <div class="project-progress">
                                <div class="project-progress-fill" style="width:${progress}%"></div>
                            </div>
                        ` : ''}
                    </div>
                    <div class="project-card-actions">
                        <button class="project-delete-btn" onclick="event.stopPropagation();deleteProject(${p.id},'${escapeHtml(p.name).replace(/'/g, "\\'")}')" title="Projekt loeschen">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                        </button>
                        <svg class="project-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
                    </div>
                </div>
                <div class="project-tasks-panel hidden" id="tasks-${p.id}"></div>
            </div>
        `;
    }).join('');
}

async function toggleProjectTasks(projectId) {
    const panel = document.getElementById(`tasks-${projectId}`);
    const card = panel.closest('.project-card');

    if (!panel.classList.contains('hidden')) {
        panel.classList.add('hidden');
        card.classList.remove('expanded');
        return;
    }

    card.classList.add('expanded');
    panel.classList.remove('hidden');
    panel.innerHTML = '<div class="dash-empty">Laden...</div>';

    const res = await _authedFetch(`/api/projects/${projectId}/tasks`).catch(() => null);
    if (!res?.ok) {
        panel.innerHTML = '<div class="dash-empty">Fehler beim Laden</div>';
        return;
    }
    const data = await res.json();
    renderTaskPanel(panel, projectId, data.tasks || []);
}

function renderTaskPanel(panel, projectId, tasks) {
    let html = `
        <div class="task-add-row">
            <input type="text" class="task-input" id="taskInput-${projectId}" placeholder="Neue Aufgabe..." onkeydown="if(event.key==='Enter')addTask(${projectId})">
            <select class="task-priority-select" id="taskPriority-${projectId}">
                <option value="0">Normal</option>
                <option value="1">Hoch</option>
                <option value="2">Dringend</option>
            </select>
            <button class="task-add-btn" onclick="addTask(${projectId})">Hinzufuegen</button>
        </div>
    `;

    if (tasks.length === 0) {
        html += '<div class="dash-empty">Keine Aufgaben</div>';
    } else {
        const statusOrder = { pending: 0, in_progress: 1, done: 2 };
        tasks.sort((a, b) => (statusOrder[a.status] ?? 0) - (statusOrder[b.status] ?? 0));

        html += tasks.map(t => {
            const statusIcon = t.status === 'done'
                ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
                : t.status === 'in_progress'
                ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
                : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>';

            const priorityBadge = t.priority >= 2
                ? '<span class="task-priority urgent">Dringend</span>'
                : t.priority === 1
                ? '<span class="task-priority high">Hoch</span>'
                : '';

            const nextStatus = t.status === 'pending' ? 'in_progress' : t.status === 'in_progress' ? 'done' : null;
            const statusBtn = nextStatus
                ? `<button class="task-status-btn" onclick="updateTaskStatus(${t.id},${projectId},'${nextStatus}')" title="${nextStatus === 'in_progress' ? 'Starten' : 'Abschliessen'}">${statusIcon}</button>`
                : `<span class="task-status-done">${statusIcon}</span>`;

            const dueDateStr = t.due_date ? `<span class="task-due">${escapeHtml(t.due_date)}</span>` : '';

            return `
                <div class="task-item ${t.status}">
                    ${statusBtn}
                    <div class="task-item-content">
                        <span class="task-item-title">${escapeHtml(t.title)}</span>
                        ${t.description ? `<span class="task-item-desc">${escapeHtml(t.description)}</span>` : ''}
                    </div>
                    ${priorityBadge}
                    ${dueDateStr}
                    <button class="task-delete-btn" onclick="deleteTask(${t.id},${projectId})" title="Loeschen">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                </div>
            `;
        }).join('');
    }

    panel.innerHTML = html;
}

async function addTask(projectId) {
    const titleInput = document.getElementById(`taskInput-${projectId}`);
    const prioritySelect = document.getElementById(`taskPriority-${projectId}`);
    const title = titleInput.value.trim();
    if (!title) return;

    await _authedFetch(`/api/projects/${projectId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, priority: parseInt(prioritySelect.value) }),
    });
    titleInput.value = '';
    await refreshTaskPanel(projectId);
    loadProjekte();
}

async function refreshTaskPanel(projectId) {
    const panel = document.getElementById(`tasks-${projectId}`);
    if (!panel || panel.classList.contains('hidden')) return;
    const res = await _authedFetch(`/api/projects/${projectId}/tasks`).catch(() => null);
    if (res?.ok) {
        const data = await res.json();
        renderTaskPanel(panel, projectId, data.tasks || []);
    }
}

async function updateTaskStatus(taskId, projectId, newStatus) {
    await _authedFetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
    });
    await refreshTaskPanel(projectId);
    loadProjekte();
}

async function deleteTask(taskId, projectId) {
    await _authedFetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    await refreshTaskPanel(projectId);
    loadProjekte();
}

async function deleteProject(projectId, projectName) {
    if (!confirm(`Projekt "${projectName}" und alle Aufgaben löschen?`)) return;
    await _authedFetch(`/api/projects/${projectId}`, { method: 'DELETE' });
    showToast('Projekt gelöscht', 'success');
    loadProjekte();
}

// Project form handlers
document.getElementById('newProjectBtn').addEventListener('click', () => {
    document.getElementById('projectForm').classList.toggle('hidden');
    document.getElementById('projectNameInput').focus();
});

document.getElementById('projectCancelBtn').addEventListener('click', () => {
    document.getElementById('projectForm').classList.add('hidden');
    document.getElementById('projectNameInput').value = '';
    document.getElementById('projectDescInput').value = '';
});

document.getElementById('projectSaveBtn').addEventListener('click', async () => {
    const name = document.getElementById('projectNameInput').value.trim();
    if (!name) return;
    const desc = document.getElementById('projectDescInput').value.trim();
    const res = await _authedFetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: desc }),
    });
    if (res?.ok) {
        document.getElementById('projectForm').classList.add('hidden');
        document.getElementById('projectNameInput').value = '';
        document.getElementById('projectDescInput').value = '';
        showToast('Projekt erstellt', 'success');
        loadProjekte();
    } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Fehler beim Erstellen', 'error');
    }
});

document.getElementById('projectNameInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('projectSaveBtn').click();
});

// ============ Settings ============

let _memoryCategory = null;

async function loadSettings() {
    const [modelsRes, memoriesRes, configRes, agentsRes] = await Promise.all([
        _authedFetch('/api/settings/models').catch(() => null),
        _authedFetch('/api/settings/memories').catch(() => null),
        _authedFetch('/api/settings/config').catch(() => null),
        _authedFetch('/api/agents').catch(() => null),
    ]);

    if (modelsRes?.ok) renderModelSelector(await modelsRes.json());
    if (memoriesRes?.ok) renderMemoryBrowser(await memoriesRes.json());
    if (configRes?.ok) renderSysInfo(await configRes.json());
    if (agentsRes?.ok) renderTemplateList((await agentsRes.json()).agents);
}

function renderModelSelector(data) {
    const el = document.getElementById('modelSelector');
    const current = data.current || '';
    const models = data.models || [];
    if (models.length === 0) {
        el.innerHTML = '<div class="dash-empty">Keine Modelle gefunden</div>';
        return;
    }
    el.innerHTML = models.map(m => {
        const name = m.name || '';
        const isCurrent = name === current || name === current + ':latest' || current === name.replace(':latest', '');
        const size = m.size ? (m.size / 1e9).toFixed(1) + ' GB' : '';
        return `
            <div class="model-card ${isCurrent ? 'current' : ''}">
                <div>
                    <div class="model-name">${escapeHtml(name)}</div>
                    ${size ? `<div class="model-size">${size}</div>` : ''}
                </div>
                ${isCurrent ? '<span class="model-current-badge">Aktiv</span>' : ''}
            </div>
        `;
    }).join('');
}

function renderMemoryBrowser(data) {
    const el = document.getElementById('memoryBrowser');
    const categories = data.categories || [];
    const memories = data.memories || [];

    // Tab bar
    const allActive = !_memoryCategory ? 'active' : '';
    let tabs = `<button class="memory-tab ${allActive}" data-cat="">Alle</button>`;
    tabs += categories.map(c => {
        const active = _memoryCategory === c ? 'active' : '';
        return `<button class="memory-tab ${active}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`;
    }).join('');

    // Entries
    const filtered = _memoryCategory
        ? memories.filter(m => m.category === _memoryCategory)
        : memories;

    let entries = '';
    if (filtered.length === 0) {
        entries = '<div class="dash-empty">Keine Erinnerungen</div>';
    } else {
        entries = filtered.map(m => `
            <div class="memory-entry" data-cat="${escapeHtml(m.category || '')}" data-key="${escapeHtml(m.key || '')}">
                <div class="memory-entry-content">
                    <div class="memory-entry-key">${escapeHtml(m.key || '')}</div>
                    <div class="memory-entry-value">${escapeHtml(m.value || '')}</div>
                    ${m.category ? `<div class="memory-entry-category">${escapeHtml(m.category)}</div>` : ''}
                </div>
                <button class="memory-delete-btn" title="Loeschen">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                </button>
            </div>
        `).join('');
    }

    el.innerHTML = `<div class="memory-tabs">${tabs}</div><div>${entries}</div>`;

    // Tab click handlers
    el.querySelectorAll('.memory-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            _memoryCategory = tab.dataset.cat || null;
            renderMemoryBrowser(data);
        });
    });

    // Delete handlers
    el.querySelectorAll('.memory-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const entry = btn.closest('.memory-entry');
            const cat = entry.dataset.cat;
            const key = entry.dataset.key;
            await _authedFetch(`/api/settings/memories/${encodeURIComponent(cat)}/${encodeURIComponent(key)}`, { method: 'DELETE' });
            entry.remove();
        });
    });
}

function renderTemplateList(agents) {
    const el = document.getElementById('templateList');
    if (!agents || agents.length === 0) {
        el.innerHTML = '<div class="dash-empty">Keine Agenten-Vorlagen</div>';
        return;
    }
    el.innerHTML = agents.map(a => `
        <div class="list-item">
            <span class="list-item-name">${escapeHtml(a.name)}</span>
            <span class="list-item-desc">${escapeHtml(a.description || '')}</span>
            <span class="list-item-badge">${escapeHtml(a.model || '')}</span>
        </div>
    `).join('');
}

function renderSysInfo(config) {
    const el = document.getElementById('sysInfo');
    const rows = [
        ['Ollama URL', config.ollama_url],
        ['Modell', config.model],
        ['Embedding', config.embedding_model],
        ['SD URL', config.sd_url],
        ['TTS Stimme', config.tts_voice],
        ['Datenbank', config.db_path],
        ['Host', `${config.host}:${config.port}`],
    ];
    el.innerHTML = rows.map(([k, v]) => `
        <div class="sysinfo-row">
            <span class="sysinfo-key">${escapeHtml(k)}</span>
            <span class="sysinfo-value">${escapeHtml(v || '')}</span>
        </div>
    `).join('');
}

// ============ Init ============
updateTtsIcon();
initAuth(); // handles connect() + loadAgents() + hash routing after auth check
