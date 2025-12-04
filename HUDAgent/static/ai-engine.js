class MindFlowEngine {
    constructor() {
        this.context = {
            history: [],
            currentZone: 'neutral',
            conversationCount: 0,
            lastEmotion: 'neutral',
            emotionState: {
                anxiety: 20,
                cognitiveLoad: 30,
                challenge: 50,
                understanding: 40,
                engagement: 60
            }
        };

        // Knowledge base for pattern matching
        this.patterns = {
            panic: ['难', '不懂', '放弃', '笨', '绝望', 'fail', 'hard', 'give up', 'stupid', '救命', '崩溃', '太复杂', '看不懂', '头疼'],
            boredom: ['简单', '直接', '答案', '帮我写', '无聊', 'easy', 'answer', 'code for me', 'boring', '给我', '快点'],
            curiosity: ['为什么', '怎么', '原理', '底层', 'why', 'how', 'principle', 'what if', '有趣', '能不能', '如果'],
            frustration: ['烦', '又错', '跑不通', 'bug', 'error', 'wrong', 'again', '还是不行', '试了很多次'],
            greeting: ['你好', 'hi', 'hello', '在吗', '开始'],
            thanks: ['谢谢', 'thanks', '感谢', '明白了', '懂了']
        };

        // Expanded response templates
        this.responseBank = {
            EMPATHY_DECONSTRUCT: [
                "先深呼吸。这种感觉很正常，说明你的大脑正在试图建立新的连接。我们把这个问题拆开来看：你最熟悉的部分是什么？",
                "别急，我们暂停一下。如果把这个复杂的问题比作切蛋糕，你觉得第一刀应该切在哪里？",
                "我完全理解这种卡住的感觉。这不代表你不行，只是信息量太大了。我们只看第一步，告诉我它在做什么？",
                "这个难度确实不小。但你知道吗？困难本身就是大脑在重构的信号。我们换个角度：如果用一个生活中的例子来类比，你会想到什么？",
                "停下来，喝口水。我们不急着解决整个问题。你能告诉我，这个问题里哪个词你是认识的？就从那个词开始。",
                "这种'脑子打结'的感觉，其实是你正在突破舒适区的证据。我们降低一个维度：如果只用三个字描述这个问题，你会说什么？"
            ],
            CHALLENGE_REDIRECT: [
                "我可以立刻给你答案，但那样你的大脑就失去了'健身'的机会。不如这样：假设你没有这个工具，你会怎么手动解决？",
                "这个太简单了，不符合你的水平。我们加个限制条件：如果不能用最直接的方法，你还有什么替代方案？",
                "直接给代码太无聊了。你能先用伪代码描述一下你的思路吗？我来帮你找漏洞。",
                "有意思，你想要捷径。但我有个更有趣的挑战：如果让你给一个5岁小孩解释这个问题的解法，你会怎么说？",
                "答案我当然知道，但我更好奇：你觉得这个问题背后的设计者，为什么要这样设计？",
                "我拒绝直接喂答案😏。不过我可以给你一个提示：如果反过来思考这个问题，会发生什么？"
            ],
            SOCRATIC_GUIDE: [
                "很有趣的视角。那么，如果在这个基础上改变一个变量，你觉得结果会发生什么变化？",
                "你抓住了关键。试着用费曼技巧，把这个逻辑讲给一个外行听，你会怎么说？",
                "没错。但你有没有想过，为什么设计者当初要选择这种方式，而不是另一种？",
                "好问题！这让我想到一个反例：如果条件反过来，这个结论还成立吗？",
                "你的思路是对的。现在试着往深挖一层：这个现象的本质原因是什么？",
                "不错的观察。那如果我们把这个概念应用到完全不同的领域，比如{analogy}，会怎样？"
            ],
            GREETING: [
                "你好！我是你的心流领航员🧭。我不会直接给你答案，但我会引导你找到自己的答案。告诉我，你现在最想攻克什么难题？",
                "嗨！准备好进入心流状态了吗？我会根据你的情绪和认知负荷，动态调整对话策略。来吧，说说你的困惑。",
                "欢迎！我的任务不是'教'你，而是帮你管理认知负荷。无论你现在是焦虑、无聊还是好奇，我都会调整策略。开始吧！"
            ],
            THANKS: [
                "很高兴能帮到你！记住，真正的理解来自你自己的思考💡",
                "不客气！你刚才的思考过程非常棒。继续保持这种主动探索的状态。",
                "这是你自己努力的结果。我只是提供了一些脚手架而已😊"
            ]
        };
    }

    /**
     * Main processing function
     */
    process(userText) {
        // 1. Detect Emotion & Cognition
        const analysis = this.analyzeInput(userText);

        // 2. Update State
        this.updateState(analysis);

        // 3. Determine Strategy
        const strategy = this.determineStrategy(analysis);

        // 4. Generate Response
        const response = this.generateResponse(strategy, userText);

        // 5. Save to history context
        this.context.history.push({
            userText,
            analysis,
            strategy,
            response,
            timestamp: Date.now()
        });
        this.context.conversationCount++;

        return {
            response,
            analysis,
            strategy,
            state: this.context.emotionState
        };
    }

    analyzeInput(text) {
        let emotion = 'neutral';
        let cognition = 'processing';
        const lowerText = text.toLowerCase();

        // Priority-based detection
        if (this.patterns.greeting.some(k => lowerText.includes(k))) {
            emotion = 'greeting';
            cognition = 'initiating';
        } else if (this.patterns.thanks.some(k => lowerText.includes(k))) {
            emotion = 'gratitude';
            cognition = 'consolidating';
        } else if (this.patterns.panic.some(k => lowerText.includes(k))) {
            emotion = 'anxiety';
            cognition = 'overload';
        } else if (this.patterns.boredom.some(k => lowerText.includes(k))) {
            emotion = 'boredom';
            cognition = 'seeking_shortcut';
        } else if (this.patterns.curiosity.some(k => lowerText.includes(k))) {
            emotion = 'curiosity';
            cognition = 'exploring';
        } else if (this.patterns.frustration.some(k => lowerText.includes(k))) {
            emotion = 'frustration';
            cognition = 'blocked';
        }

        // Context awareness: if emotion changed dramatically
        if (this.context.lastEmotion === 'anxiety' && emotion === 'curiosity') {
            cognition = 'recovering'; // Positive shift
        }

        this.context.lastEmotion = emotion;
        return { emotion, cognition, originalText: text };
    }

    updateState(analysis) {
        const s = this.context.emotionState;

        // Dynamic state adjustment based on input
        switch (analysis.emotion) {
            case 'anxiety':
                s.anxiety = Math.min(100, s.anxiety + 25);
                s.cognitiveLoad = Math.min(100, s.cognitiveLoad + 20);
                s.engagement = Math.max(20, s.engagement - 15);
                s.challenge = Math.min(100, s.challenge + 10);
                s.understanding = Math.max(10, s.understanding - 10);
                break;
            case 'frustration':
                s.anxiety = Math.min(100, s.anxiety + 15);
                s.challenge = Math.min(100, s.challenge + 10);
                s.cognitiveLoad = Math.min(100, s.cognitiveLoad + 10);
                s.engagement = Math.max(30, s.engagement - 5);
                break;
            case 'boredom':
                s.anxiety = Math.max(0, s.anxiety - 15);
                s.challenge = Math.max(0, s.challenge - 20);
                s.engagement = Math.max(0, s.engagement - 25);
                s.cognitiveLoad = Math.max(10, s.cognitiveLoad - 10);
                break;
            case 'curiosity':
                s.engagement = Math.min(100, s.engagement + 20);
                s.understanding = Math.min(100, s.understanding + 15);
                s.anxiety = Math.max(15, s.anxiety - 10);
                s.challenge = Math.min(80, s.challenge + 5);
                s.cognitiveLoad = Math.min(70, s.cognitiveLoad + 5);
                break;
            case 'gratitude':
                s.understanding = Math.min(100, s.understanding + 10);
                s.engagement = Math.min(100, s.engagement + 10);
                s.anxiety = Math.max(0, s.anxiety - 20);
                s.cognitiveLoad = Math.max(0, s.cognitiveLoad - 15);
                break;
            case 'greeting':
                // Reset to baseline
                s.anxiety = 20;
                s.cognitiveLoad = 30;
                s.engagement = 70;
                break;
            default:
                // Natural decay toward baseline
                s.anxiety = s.anxiety > 20 ? s.anxiety * 0.95 : s.anxiety;
                s.cognitiveLoad = s.cognitiveLoad > 30 ? s.cognitiveLoad * 0.95 : s.cognitiveLoad;
                s.engagement = s.engagement < 60 ? s.engagement * 1.05 : s.engagement;
        }

        // Ensure bounds
        Object.keys(s).forEach(key => {
            s[key] = Math.max(0, Math.min(100, s[key]));
        });
    }

    determineStrategy(analysis) {
        const s = this.context.emotionState;

        // Special cases
        if (analysis.emotion === 'greeting') return { zone: 'Neutral', type: 'GREETING', reasoning: '用户开始对话' };
        if (analysis.emotion === 'gratitude') return { zone: 'Flow Zone', type: 'THANKS', reasoning: '用户表示感谢' };

        // Zone Logic
        if (s.anxiety > 60 || analysis.cognition === 'overload') {
            return {
                zone: 'Panic Zone',
                type: 'EMPATHY_DECONSTRUCT',
                reasoning: '焦虑度高/认知过载 → 恐慌区'
            };
        } else if (s.challenge < 30 || analysis.cognition === 'seeking_shortcut') {
            return {
                zone: 'Boredom Zone',
                type: 'CHALLENGE_REDIRECT',
                reasoning: '挑战度低/寻求捷径 → 无聊区'
            };
        } else {
            return {
                zone: 'Flow Zone',
                type: 'SOCRATIC_GUIDE',
                reasoning: '状态匹配 → 心流区'
            };
        }
    }

    generateResponse(strategy, userText) {
        // Select template
        const options = this.responseBank[strategy.type] || this.responseBank['SOCRATIC_GUIDE'];
        const template = options[Math.floor(Math.random() * options.length)];

        // Simple context injection
        const concept = userText.length > 5 ? "这个概念" : "它";
        const analogy = ["乐高积木", "做饭", "开车", "玩游戏"][Math.floor(Math.random() * 4)];

        let content = template
            .replace("{concept}", concept)
            .replace("{analogy}", analogy);

        // Add Micro-Action
        const microAction = this.getMicroAction(strategy.type);

        return {
            content: content,
            microAction: microAction
        };
    }

    getMicroAction(type) {
        const actions = {
            EMPATHY_DECONSTRUCT: "微行动：找出问题中你唯一认识的一个术语。",
            CHALLENGE_REDIRECT: "微行动：写下你的第一步思路，不要超过10个字。",
            SOCRATIC_GUIDE: "微行动：尝试用一个生活中的例子来类比这个概念。",
            GREETING: "微行动：深呼吸，准备开始。",
            THANKS: "微行动：回顾一下刚才学到了什么。"
        };
        return actions[type] || "微行动：思考一下。";
    }
}

// Export for use
window.MindFlowEngine = MindFlowEngine;
