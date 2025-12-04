document.addEventListener('DOMContentLoaded', () => {
    // Initialize Engine
    const engine = new window.MindFlowEngine();

    // DOM Elements
    const chatMessages = document.getElementById('chatMessages');
    const welcomeTemplate = chatMessages.innerHTML;
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');
    const historyToggle = document.getElementById('historyToggle');
    const historySidebar = document.getElementById('historySidebar');
    const panelToggle = document.getElementById('panelToggle');
    const analysisPanel = document.getElementById('analysisPanel');
    const radarCanvas = document.getElementById('radarChart');

    // Configuration
    const GEMINI_API_KEY = "AIzaSyAqHVogirGA2hFDi_E1MWCy5rym9ryQOSM";
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`;

    // State
    let isTyping = false;
    let knowledgeBase = { concepts: [] };
    const conversationHistory = [];
    const chatTranscript = [];
    const stateSnapshots = [];
    const MAX_HISTORY = 12;
    const MAX_TREND_POINTS = 8;
    let activeHistoryId = null;
    let currentSessionId = null;

    // --- Initialization ---
    loadKnowledgeBase();

    async function loadKnowledgeBase() {
        try {
            const response = await fetch('/static/knowledge.json');
            if (response.ok) {
                knowledgeBase = await response.json();
                console.log("📚 Knowledge Base loaded:", knowledgeBase.concepts.length, "concepts");
            }
        } catch (e) {
            console.warn("⚠️ Failed to load Knowledge Base:", e);
        }
    }

    // --- Event Listeners ---

    sendBtn.addEventListener('click', handleSendMessage);

    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });

    // Auto-resize textarea
    userInput.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        if (this.value === '') this.style.height = 'auto';
    });

    historyToggle.addEventListener('click', () => {
        historySidebar.classList.toggle('active');
    });

    panelToggle.addEventListener('click', () => {
        analysisPanel.classList.toggle('active');
    });

    // --- Core Logic ---

    function retrieveKnowledge(text) {
        text = text.toLowerCase();
        const relevant = [];
        if (knowledgeBase && knowledgeBase.concepts) {
            for (const concept of knowledgeBase.concepts) {
                for (const keyword of concept.keywords) {
                    if (text.includes(keyword.toLowerCase())) {
                        relevant.push(concept);
                        break;
                    }
                }
            }
        }
        return relevant;
    }

    async function handleSendMessage() {
        const text = userInput.value.trim();
        if (!text || isTyping) return;

        // 1. Add User Message
        addMessage(text, 'user');
        userInput.value = '';
        userInput.style.height = 'auto';
        addToConversationHistory({ role: 'user', content: text });
        appendTranscript({ role: 'user', content: text });

        // 2. Immediately show loading message
        const loadingMessageDiv = addMessage('正在思考...', 'ai');
        loadingMessageDiv.classList.add('loading');
        const loadingText = loadingMessageDiv.querySelector('.message-text');
        let loadingDots = 0;
        const loadingInterval = setInterval(() => {
            loadingDots = (loadingDots + 1) % 4;
            loadingText.textContent = '正在思考' + '.'.repeat(loadingDots);
        }, 300);

        isTyping = true;
        let result;

        try {
            // 3. Call Backend API
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    history: conversationHistory
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Backend Error');
            }

            const aiJson = await response.json();

            // 4. Adapt to local format
            result = {
                response: {
                    content: aiJson.response,
                    microAction: aiJson.microAction
                },
                analysis: aiJson.analysis,
                strategy: {
                    type: aiJson.strategy,
                    zone: aiJson.analysis.zone,
                    reasoning: "AI Analysis"
                },
                state: aiJson.radar,
                fromApi: true
            };

            // Sync local engine state
            engine.context.emotionState = aiJson.radar;

            // Record assistant turn
            addToConversationHistory({
                role: 'assistant',
                content: aiJson.response,
                analysis: aiJson.analysis,
                radar: aiJson.radar,
                strategy: aiJson.strategy
            });

        } catch (e) {
            console.log("Falling back to simulation:", e);
            // 5. Fallback to Simulation
            result = engine.process(text);
            result.fromApi = false;

            addToConversationHistory({
                role: 'assistant',
                content: result.response.content,
                analysis: result.analysis,
                radar: result.state,
                strategy: result.strategy
            });

            console.warn("Using simulation mode due to API error.");
        }

        // 6. Stop loading animation and replace with actual content
        clearInterval(loadingInterval);
        loadingMessageDiv.classList.remove('loading');
        const messageTextEl = loadingMessageDiv.querySelector('.message-text');
        messageTextEl.textContent = '';

        // 7. Update Analysis Panel & State Pulse
        updateAnalysisPanel(result);
        pushStateSnapshot(result);

        // 8. Typewriter Effect for actual response
        await typeWriter(messageTextEl, result.response.content);

        // 9. Add Micro-Action
        if (result.response.microAction) {
            const actionDiv = document.createElement('div');
            actionDiv.className = 'micro-action';
            actionDiv.innerHTML = `<strong>⚡ Micro-Action:</strong> ${result.response.microAction}`;
            loadingMessageDiv.querySelector('.message-content').appendChild(actionDiv);
        }
        appendTranscript({
            role: 'assistant',
            content: result.response.content,
            microAction: result.response.microAction
        });

        isTyping = false;
        saveHistory(text, result);
    }

    // --- UI Helpers ---

    function addMessage(text, type) {
        const div = document.createElement('div');
        div.className = `message ${type}`;

        const avatar = type === 'user' ? '👤' : '🧭';

        div.innerHTML = `
            <div class="avatar">${avatar}</div>
            <div class="message-content">
                <div class="message-text">${text}</div>
            </div>
        `;

        chatMessages.appendChild(div);
        scrollToBottom();
        return div;
    }

    function updateAnalysisPanel(result) {
        if (!result || !result.analysis) return;

        const safeState = result.state || engine.context.emotionState;
        drawRadarChart(safeState);

        const setText = (id, text) => {
            const el = document.getElementById(id);
            if (!el) return;
            const textNode = el.querySelector('.analysis-text');
            if (textNode) textNode.textContent = text;
        };

        const cognition = result.analysis.cognition || 'Processing';
        const emotion = result.analysis.emotion || 'Neutral';
        setText('detectResult', `Emotion: ${emotion} | Cognition: ${cognition}`);

        const zoneLabel = (result.strategy && result.strategy.zone) || result.analysis.zone || 'Learning';
        const normalized = normalizeZone(zoneLabel);
        setText('locateResult', `${zoneLabel} ｜ ${getZoneFocus(normalized)}`);

        const strategyType = (result.strategy && result.strategy.type) || 'Adaptive Guidance';
        setText('strategyResult', `${strategyType} ｜ ${getStrategyNarrative(strategyType)}`);

        setText('knowledgeResult', formatKnowledgeText(result.analysis.knowledge_used));

        const level = result.analysis.understanding_level || 'Assessing...';
        setText('levelResult', `${level} ｜ ${getLevelNarrative(level)}`);

        const zoneIndicator = document.getElementById('zoneIndicator');
        const zoneSummaryEl = document.getElementById('zoneSummary');
        if (!zoneIndicator) return;

        const zoneClass = zoneClassName(normalized);
        const zoneIcon = getZoneIcon(normalized);

        zoneIndicator.innerHTML = `
            <div class="zone-badge ${zoneClass}">
                <span class="zone-icon">${zoneIcon}</span>
                <span class="zone-name">${zoneLabel}</span>
            </div>
        `;

        if (zoneSummaryEl) {
            zoneSummaryEl.textContent = getZoneSummary(normalized);
        }
    }

    function typeWriter(element, text) {
        return new Promise(resolve => {
            let i = 0;
            const speed = 30;

            function type() {
                if (i < text.length) {
                    element.textContent += text.charAt(i);
                    i++;
                    scrollToBottom();
                    setTimeout(type, speed);
                } else {
                    resolve();
                }
            }
            type();
        });
    }

    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function addToConversationHistory(entry) {
        conversationHistory.push(entry);
        while (conversationHistory.length > MAX_HISTORY) {
            conversationHistory.shift();
        }
    }

    function saveHistory(userText, result) {
        ensureSessionId();

        const snapshot = {
            conversation: deepClone(conversationHistory),
            transcript: deepClone(chatTranscript),
            lastAnalysis: result.analysis,
            lastStrategy: result.strategy,
            lastState: result.state,
            trend: deepClone(stateSnapshots)
        };

        const entry = {
            id: currentSessionId,
            preview: userText.substring(0, 20) + (userText.length > 20 ? '...' : ''),
            timestamp: new Date().toLocaleTimeString(),
            zone: (result.strategy && result.strategy.zone) || 'Learning',
            snapshot
        };

        let history = JSON.parse(localStorage.getItem('mindflow_history') || '[]');
        history = history.filter(item => item.id !== currentSessionId);
        history.unshift(entry);
        if (history.length > 20) history.pop();
        localStorage.setItem('mindflow_history', JSON.stringify(history));

        activeHistoryId = currentSessionId;
        renderHistory();
    }

    function ensureSessionId() {
        if (!currentSessionId) {
            currentSessionId = Date.now();
            activeHistoryId = currentSessionId;
        }
    }

    function renderHistory() {
        const historyList = document.getElementById('historyList');
        const history = JSON.parse(localStorage.getItem('mindflow_history') || '[]');

        if (!history.length) {
            historyList.innerHTML = `<div class="history-item" style="cursor:default; opacity:0.7;">暂无历史记录</div>`;
            return;
        }

        historyList.innerHTML = history.map(item => `
            <div class="history-item ${item.id === activeHistoryId ? 'active' : ''}" data-id="${item.id}">
                <div class="history-content" style="flex: 1;">
                    <div style="font-weight:500">${item.preview}</div>
                    <div style="font-size:0.7em; opacity:0.7">${item.timestamp} • ${item.zone || 'Learning'}</div>
                </div>
                <button class="history-delete-btn" data-id="${item.id}" title="删除" onclick="event.stopPropagation(); deleteHistoryEntry(${item.id})">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>
            </div>
        `).join('');

        historyList.querySelectorAll('.history-item').forEach(node => {
            const id = Number(node.getAttribute('data-id'));
            if (!id) return;
            const content = node.querySelector('.history-content');
            if (content) {
                content.addEventListener('click', () => loadHistoryEntry(id));
            }
        });
    }

    function deleteHistoryEntry(entryId) {
        if (!confirm('确定要删除这条历史记录吗？')) {
            return;
        }

        let history = JSON.parse(localStorage.getItem('mindflow_history') || '[]');
        history = history.filter(item => item.id !== entryId);
        localStorage.setItem('mindflow_history', JSON.stringify(history));

        if (activeHistoryId === entryId) {
            activeHistoryId = null;
            currentSessionId = null;
            resetConversationState();
        } else {
            renderHistory();
        }
    }

    window.deleteHistoryEntry = deleteHistoryEntry;

    function loadHistoryEntry(entryId) {
        const history = JSON.parse(localStorage.getItem('mindflow_history') || '[]');
        const entry = history.find(item => item.id === entryId);

        if (!entry || !entry.snapshot) {
            alert('该历史记录缺少详细内容，无法回溯。');
            return;
        }

        currentSessionId = entryId;
        activeHistoryId = entryId;
        isTyping = false;

        conversationHistory.length = 0;
        chatTranscript.length = 0;
        stateSnapshots.length = 0;

        if (Array.isArray(entry.snapshot.conversation)) {
            entry.snapshot.conversation.forEach(item => conversationHistory.push(item));
        }

        if (Array.isArray(entry.snapshot.transcript)) {
            entry.snapshot.transcript.forEach(item => chatTranscript.push(item));
        }
        renderTranscript(chatTranscript);

        if (Array.isArray(entry.snapshot.trend)) {
            entry.snapshot.trend.forEach(item => stateSnapshots.push(item));
        }
        renderStateTimeline();

        if (entry.snapshot.lastState) {
            engine.context.emotionState = entry.snapshot.lastState;
        }

        const lastAnalysisRaw = entry.snapshot.lastAnalysis || {};
        const lastStrategyRaw = entry.snapshot.lastStrategy || {};
        const safeAnalysis = {
            emotion: lastAnalysisRaw.emotion || 'Neutral',
            cognition: lastAnalysisRaw.cognition || 'History Review',
            knowledge_used: lastAnalysisRaw.knowledge_used || null,
            understanding_level: lastAnalysisRaw.understanding_level || '回顾',
            zone: lastAnalysisRaw.zone || lastStrategyRaw.zone || 'History'
        };
        const safeStrategy = {
            type: lastStrategyRaw.type || 'History Review',
            zone: lastStrategyRaw.zone || safeAnalysis.zone
        };

        updateAnalysisPanel({
            analysis: safeAnalysis,
            strategy: safeStrategy,
            state: entry.snapshot.lastState || engine.context.emotionState
        });

        renderHistory();
    }

    function renderTranscript(transcript = []) {
        chatMessages.innerHTML = '';
        if (!transcript.length) {
            chatMessages.innerHTML = welcomeTemplate;
            scrollToBottom();
            return;
        }

        transcript.forEach(entry => {
            const type = entry.role === 'user' ? 'user' : 'ai';
            const node = addMessage(entry.content, type === 'user' ? 'user' : 'ai');
            if (type !== 'user' && entry.microAction) {
                const actionDiv = document.createElement('div');
                actionDiv.className = 'micro-action';
                actionDiv.innerHTML = `<strong>⚡ Micro-Action:</strong> ${entry.microAction}`;
                node.querySelector('.message-content').appendChild(actionDiv);
            }
        });
        scrollToBottom();
    }

    function appendTranscript(entry) {
        chatTranscript.push(entry);
    }

    function pushStateSnapshot(result) {
        if (!result || !result.state) return;
        stateSnapshots.push({
            zone: (result.strategy && result.strategy.zone) || result.analysis.zone || 'Learning',
            emotion: result.analysis.emotion || 'Neutral',
            timestamp: new Date().toLocaleTimeString()
        });
        if (stateSnapshots.length > MAX_TREND_POINTS) stateSnapshots.shift();
        renderStateTimeline();
    }

    function renderStateTimeline() {
        const container = document.getElementById('stateTimeline');
        if (!container) return;
        if (!stateSnapshots.length) {
            container.innerHTML = '<span class="timeline-empty">还没有数据</span>';
            return;
        }

        container.innerHTML = stateSnapshots.map(snapshot => {
            const zone = snapshot.zone || 'Learning';
            const normalized = normalizeZone(zone);
            return `
                <div class="timeline-chip ${zoneClassName(normalized)}">
                    <strong>${zone}</strong>
                    <span>${snapshot.emotion || '未检测'} · ${snapshot.timestamp}</span>
                </div>
            `;
        }).join('');
    }

    function normalizeZone(zone = '') {
        const lower = zone.toLowerCase();
        if (lower.includes('panic')) return 'panic';
        if (lower.includes('boredom')) return 'boredom';
        if (lower.includes('flow')) return 'flow';
        if (lower.includes('learning')) return 'learning';
        return 'neutral';
    }

    function zoneClassName(zoneKey) {
        switch (zoneKey) {
            case 'panic': return 'zone-panic';
            case 'boredom': return 'zone-boredom';
            case 'flow':
            case 'learning': return 'zone-learning';
            default: return 'zone-neutral';
        }
    }

    function getZoneIcon(zoneKey) {
        switch (zoneKey) {
            case 'panic': return '🚨';
            case 'boredom': return '😴';
            case 'flow':
            case 'learning': return '🌊';
            default: return '⏳';
        }
    }

    function getZoneSummary(zoneKey) {
        const summaries = {
            panic: '焦虑或认知负荷偏高，建议先舒缓情绪，再拆解问题。',
            boredom: '挑战度不足或动力下降，可以加入限制条件或进阶问题。',
            flow: '挑战与能力匹配，保持深挖与反思。',
            learning: '处于学习区，可以通过提问或实践深化理解。',
            neutral: '等待输入或状态稳定，随时准备进入学习流程。'
        };
        return summaries[zoneKey] || summaries.neutral;
    }

    function getZoneFocus(zoneKey) {
        const focus = {
            panic: '先减载再拆小步',
            boredom: '提升挑战与深度',
            flow: '保持节奏并记录洞察',
            learning: '结合提问与反馈',
            neutral: '等待输入或准备切换'
        };
        return focus[zoneKey] || focus.neutral;
    }

    function getStrategyNarrative(type = '') {
        const key = type.toUpperCase();
        const map = {
            EMPATHY_DECONSTRUCT: '拆解任务，确认首要步骤，再逐层推进。',
            CHALLENGE_REDIRECT: '重新定义目标，引入限制或反向思考以激活动机。',
            SOCRATIC_GUIDE: '通过连续提问暴露假设，促发自我解释。',
            THANKS: '回顾收获，并规划下一步迁移。',
            GREETING: '了解背景，锁定接下来要解决的核心问题。',
            INIT: '初始化，等待用户输入。'
        };
        return map[key] || '根据当前状态自动调节提问与反馈力度。';
    }

    function getLevelNarrative(level = '') {
        const lc = level.toLowerCase();
        if (lc.includes('beginner')) return '以例子和可视化为主，避免一次涌入过多概念。';
        if (lc.includes('advanced')) return '可以讨论假设、边界条件与方案权衡。';
        if (lc.includes('intermediate')) return '将新概念与已知知识点建立映射。';
        if (lc.includes('回顾')) return '回溯上一次的思路，确认知识断点。';
        return '根据反馈自适应，必要时再次评估理解程度。';
    }

    function formatKnowledgeText(keyword) {
        if (!keyword) return 'General Knowledge';
        if (!knowledgeBase || !knowledgeBase.concepts) return keyword;
        const lower = String(keyword).toLowerCase();
        const concept = knowledgeBase.concepts.find(con =>
            Array.isArray(con.keywords) && con.keywords.some(k => lower.includes(k.toLowerCase()))
        );
        if (!concept) return keyword;
        const analogy = concept.analogies && concept.analogies[0] ? `｜类比：${concept.analogies[0]}` : '';
        return `${concept.definition}${analogy ? ` ${analogy}` : ''}`;
    }

    function deepClone(source) {
        try {
            return JSON.parse(JSON.stringify(source));
        } catch (e) {
            return source;
        }
    }

    function resetConversationState() {
        chatMessages.innerHTML = welcomeTemplate;
        conversationHistory.length = 0;
        chatTranscript.length = 0;
        stateSnapshots.length = 0;
        activeHistoryId = null;
        currentSessionId = null;
        renderHistory();
        renderStateTimeline();

        const baseline = {
            anxiety: 20,
            cognitiveLoad: 30,
            challenge: 50,
            understanding: 40,
            engagement: 60
        };
        engine.context.emotionState = baseline;
        updateAnalysisPanel({
            analysis: {
                emotion: 'Neutral',
                cognition: 'Initializing',
                knowledge_used: null,
                understanding_level: 'Assessing...',
                zone: 'Neutral'
            },
            strategy: { type: 'Init', zone: 'Neutral' },
            state: baseline
        });
    }

    // Initial render
    renderHistory();
    resetConversationState();

    // New Chat Button
    document.getElementById('newChatBtn').addEventListener('click', () => {
        if (confirm('确定要开始新对话吗？当前对话将被清空。')) {
            resetConversationState();
        }
    });

    // --- Radar Chart Renderer (Canvas) ---
    function drawRadarChart(data) {
        const ctx = radarCanvas.getContext('2d');
        const width = radarCanvas.width;
        const height = radarCanvas.height;
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(centerX, centerY) - 40;

        // Clear
        ctx.clearRect(0, 0, width, height);

        // Config
        const axes = [
            { label: 'Anxiety', value: data.anxiety, color: '#FF6B6B' },
            { label: 'Load', value: data.cognitiveLoad, color: '#4ECDC4' },
            { label: 'Challenge', value: data.challenge, color: '#FFE66D' },
            { label: 'Depth', value: data.understanding, color: '#A8E6CF' },
            { label: 'Engage', value: data.engagement, color: '#C7CEEA' }
        ];
        const totalAxes = axes.length;

        // Draw Grid (Pentagon)
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 1;

        for (let level = 1; level <= 5; level++) {
            ctx.beginPath();
            for (let i = 0; i < totalAxes; i++) {
                const angle = (Math.PI * 2 * i) / totalAxes - Math.PI / 2;
                const r = (radius / 5) * level;
                const x = centerX + Math.cos(angle) * r;
                const y = centerY + Math.sin(angle) * r;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.stroke();
        }

        // Draw Axes Lines & Labels
        ctx.font = '10px Inter';
        ctx.fillStyle = '#666';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let i = 0; i < totalAxes; i++) {
            const angle = (Math.PI * 2 * i) / totalAxes - Math.PI / 2;
            const x = centerX + Math.cos(angle) * radius;
            const y = centerY + Math.sin(angle) * radius;

            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(x, y);
            ctx.strokeStyle = '#eee';
            ctx.stroke();

            // Labels
            const labelX = centerX + Math.cos(angle) * (radius + 20);
            const labelY = centerY + Math.sin(angle) * (radius + 20);
            ctx.fillText(axes[i].label, labelX, labelY);
        }

        // Draw Data Area
        ctx.beginPath();
        for (let i = 0; i < totalAxes; i++) {
            const angle = (Math.PI * 2 * i) / totalAxes - Math.PI / 2;
            const val = axes[i].value / 100; // Normalize 0-1
            const r = radius * val;
            const x = centerX + Math.cos(angle) * r;
            const y = centerY + Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(74, 144, 226, 0.2)';
        ctx.fill();
        ctx.strokeStyle = '#4A90E2';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw Points
        for (let i = 0; i < totalAxes; i++) {
            const angle = (Math.PI * 2 * i) / totalAxes - Math.PI / 2;
            const val = axes[i].value / 100;
            const r = radius * val;
            const x = centerX + Math.cos(angle) * r;
            const y = centerY + Math.sin(angle) * r;

            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fillStyle = axes[i].color;
            ctx.fill();
        }
    }

    // Initial Draw
    drawRadarChart(engine.context.emotionState);
});
