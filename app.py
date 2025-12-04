from flask import Flask, render_template, send_from_directory, request, jsonify
import json
import logging
import os
import random
from copy import deepcopy
from typing import Any, Dict, List, Optional, Tuple

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None  # type: ignore

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

app = Flask(__name__, static_folder='static', template_folder='templates')

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
MOONSHOT_API_KEY = os.environ.get("MOONSHOT_API_KEY", "sk-erYfJYvgFRuuHZtKSU7SumdzolnfDQk5nek9zWfAqAfNJxLG")
MOONSHOT_MODEL = os.environ.get("MOONSHOT_MODEL", "kimi-k2-turbo-preview")
MOONSHOT_BASE_URL = os.environ.get("MOONSHOT_BASE_URL", "https://api.moonshot.cn/v1")

ALT_OPENAI_KEY = os.environ.get("OPENAI_API_KEY")
ALT_OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
ALT_OPENAI_BASE = os.environ.get("OPENAI_BASE_URL")
# 在第 27 行之后添加
GOOGLE_AI_API_KEY = os.environ.get("GOOGLE_AI_API_KEY", "AIzaSyBRLKap4ECROcdXwXsGB7JqJpvZePZKn8k")
GOOGLE_AI_MODEL = os.environ.get("GOOGLE_AI_MODEL", "gemini-pro")
GOOGLE_AI_BASE_URL = os.environ.get("GOOGLE_AI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta")

KNOWLEDGE_BASE: Dict[str, Any] = {"concepts": []}


# ---------------------------------------------------------------------------
# Knowledge Base
# ---------------------------------------------------------------------------
def load_knowledge_base() -> Dict[str, Any]:
    try:
        with open('static/knowledge.json', 'r', encoding='utf-8') as f:
            kb = json.load(f)
        logging.info("✅ Knowledge base loaded: %s concepts", len(kb.get("concepts", [])))
        return kb
    except Exception as exc:  # noqa: BLE001
        logging.warning("⚠️ Failed to load knowledge base: %s", exc)
        return {"concepts": []}


KNOWLEDGE_BASE = load_knowledge_base()


# ---------------------------------------------------------------------------
# FlowMentor Core
# ---------------------------------------------------------------------------
class FlowMentorEngine:
    """
    轻量级心智感知引擎，即使外部 LLM 故障，也能在 antigravity 环境下保持可用。
    """

    def __init__(self, knowledge_base: Dict[str, Any]) -> None:
        self.knowledge_base = knowledge_base
        self.base_radar = {
            "anxiety": 25,
            "cognitiveLoad": 35,
            "challenge": 55,
            "understanding": 45,
            "engagement": 60,
        }
        self.patterns = {
            "panic": ["难", "不懂", "放弃", "救命", "崩溃", "太复杂", "hard", "fail", "stupid"],
            "boredom": ["简单", "无聊", "快点", "答案", "帮我写", "easy"],
            "curiosity": ["为什么", "怎么", "原理", "底层", "why", "how", "what if"],
            "frustration": ["bug", "error", "又错", "还是不行", "烦", "卡住"],
        }

    def analyze(self, text: str, history: Optional[List[Dict[str, Any]]] = None,
                context: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        history = history or []
        lowered = text.lower()

        emotion = "Flow"
        cognition = "steady"
        understanding_level = "Intermediate"

        if any(word in lowered for word in self.patterns["panic"]):
            emotion = "Anxiety"
            cognition = "overload"
            understanding_level = "Beginner"
        elif any(word in lowered for word in self.patterns["boredom"]):
            emotion = "Boredom"
            cognition = "seeking_shortcut"
            understanding_level = "Advanced"
        elif any(word in lowered for word in self.patterns["frustration"]):
            emotion = "Frustration"
            cognition = "blocked"
        elif any(word in lowered for word in self.patterns["curiosity"]):
            emotion = "Curiosity"
            cognition = "exploring"
            understanding_level = "Advanced"

        recent_zone = self._recent_zone(history)
        state = self._estimate_radar(emotion, recent_zone)
        zone = self._deduce_zone(state, cognition)
        knowledge_used = self._pick_concept_name(context)
        strategy = {
            "Panic": "EMPATHY_DECONSTRUCT",
            "Boredom": "CHALLENGE_REDIRECT",
            "Learning": "SOCRATIC_GUIDE",
        }.get(zone, "SOCRATIC_GUIDE")

        return {
            "analysis": {
                "emotion": emotion,
                "zone": zone,
                "understanding_level": understanding_level,
                "knowledge_used": knowledge_used,
                "cognition": cognition,
            },
            "radar": state,
            "strategy": strategy,
        }

    def _estimate_radar(self, emotion: str, recent_zone: Optional[str]) -> Dict[str, int]:
        radar = deepcopy(self.base_radar)
        emotion = emotion.lower()

        if emotion == "anxiety":
            radar["anxiety"] += 35
            radar["cognitiveLoad"] += 20
            radar["understanding"] -= 15
            radar["engagement"] -= 10
        elif emotion == "boredom":
            radar["challenge"] -= 25
            radar["engagement"] -= 20
            radar["cognitiveLoad"] -= 10
        elif emotion == "frustration":
            radar["anxiety"] += 15
            radar["challenge"] += 10
            radar["cognitiveLoad"] += 15
        elif emotion == "curiosity":
            radar["challenge"] += 5
            radar["understanding"] += 10
            radar["engagement"] += 15
            radar["anxiety"] -= 10

        if recent_zone == "Panic" and emotion == "anxiety":
            radar["anxiety"] = min(100, radar["anxiety"] + 10)

        for key, value in radar.items():
            radar[key] = max(0, min(100, int(value)))

        return radar

    @staticmethod
    def _deduce_zone(radar: Dict[str, int], cognition: str) -> str:
        if radar["anxiety"] >= 60 or cognition == "overload":
            return "Panic"
        if radar["challenge"] <= 30 or cognition == "seeking_shortcut":
            return "Boredom"
        return "Learning"

    @staticmethod
    def _pick_concept_name(context: Optional[List[Dict[str, Any]]]) -> Optional[str]:
        if not context:
            return None
        if context[0].get("keywords"):
            return context[0]["keywords"][0]
        return context[0].get("definition")

    def simulate_response(self, text: str, context: List[Dict[str, Any]],
                          analysis_bundle: Dict[str, Any]) -> Dict[str, Any]:
        # 总是尝试直接回答问题，不使用引导性模板
        content = self._generate_direct_answer(text, context)
        micro_action = ""  # 直接回答时不需要微行动

        return {
            "response": content,
            "microAction": micro_action,
            "analysis": analysis_bundle["analysis"],
            "radar": analysis_bundle["radar"],
            "strategy": analysis_bundle["strategy"],
            "source": "simulation"
        }

    @staticmethod
    def _is_direct_question(text: str) -> bool:
        """检测是否是直接问题"""
        lowered = text.lower()
        direct_question_markers = [
            "什么", "如何", "为什么", "怎么", "是什么", "有哪些",
            "反映了", "说明了", "表达了", "体现了", "揭示了",
            "what", "how", "why", "explain", "describe", "tell me about"
        ]
        return any(marker in lowered for marker in direct_question_markers)

    def _generate_direct_answer(self, text: str, context: List[Dict[str, Any]]) -> str:
        """为问题生成直接回答"""
        # 如果有知识库匹配，使用知识库内容
        if context:
            concept = context[0]
            definition = concept.get("definition", "")
            analogies = concept.get("analogies", [])
            
            answer_parts = []
            if definition:
                answer_parts.append(definition)
            if analogies and len(answer_parts) < 2:
                answer_parts.append(f"可以用{analogies[0]}来类比理解。")
            
            if answer_parts:
                return " ".join(answer_parts)
        
        # 如果没有知识库匹配，说明这是本地降级模式
        # 这种情况应该很少发生，因为API可用时会优先使用API
        return f"抱歉，关于「{text}」这个问题，我暂时无法给出完整回答。这可能是API调用失败导致的降级模式。请检查网络连接或API配置。"


    def build_system_prompt(self, context_str: str) -> str:
        return f"""
你是 FlowMentor，运行在 antigravity 的教育×心理复合智能体。

**核心原则：直接回答问题，引导要少而精。**

对于用户的问题，你必须：
1. **直接给出完整、准确的答案**（这是最重要的，无论第几次对话）
2. 如果答案较长，可以适当分段，但必须完整
3. **绝对禁止**用"继续深挖"、"如果前提改写"、"与其他概念组合"这类引导性话语替代直接答案
4. 如果用户问"反映了什么"、"说明了什么"、"是什么"、"如何"、"为什么"等问题，直接给出你的分析和观点
5. 引导性内容（如果有）必须放在答案之后，且要简短

**重要规则（必须严格遵守）：**
- 用户问什么，你就直接答什么
- 不要用引导性话语替代答案
- 不要在回答开头或中间使用"继续深挖"、"如果前提改写"等引导性表达
- 即使是在后续对话中，也要直接回答问题，而不是引导

JSON 结构：
{{
    "response": "直接、完整的答案。绝对不要用引导性话语替代答案",
    "microAction": "可以立即执行的小行动（可选，如果确实有帮助，否则留空）",
    "analysis": {{
        "emotion": "...",
        "zone": "...",
        "understanding_level": "...",
        "knowledge_used": "...",
        "cognition": "..."
    }},
    "radar": {{
        "anxiety": 0-100,
        "cognitiveLoad": 0-100,
        "challenge": 0-100,
        "understanding": 0-100,
        "engagement": 0-100
    }},
    "strategy": "策略名称"
}}

{context_str}

策略规则（仅在用户明确表达困惑、需要帮助时使用）：
- Panic → 共情 + 拆解 + 类比；
- Boredom → 提升挑战 + 反向提问；
- Learning → 苏格拉底式追问。

保持冷静、专业的语气。**优先直接回答，不要用引导替代答案。**
microAction 只在确实有帮助时提供，否则留空。
"""

    @staticmethod
    def _recent_zone(history: Optional[List[Dict[str, Any]]]) -> Optional[str]:
        if not history:
            return None
        for item in reversed(history):
            if not isinstance(item, dict):
                continue
            analysis = item.get("analysis")
            if isinstance(analysis, dict) and analysis.get("zone"):
                return analysis["zone"]
        return None


flow_mentor_engine = FlowMentorEngine(KNOWLEDGE_BASE)


# ---------------------------------------------------------------------------
# LLM Manager
# ---------------------------------------------------------------------------
class LLMManager:
    def __init__(self) -> None:
        self.providers: List[Tuple[str, Any]] = []
        self.errors: List[str] = []

        if OpenAI and MOONSHOT_API_KEY:
            self.providers.append(("moonshot", self._call_moonshot))

        # 在第 294 行之后添加
        if OpenAI and GOOGLE_AI_API_KEY:
            self.providers.append(("google", self._call_google_ai))

        if OpenAI and ALT_OPENAI_KEY:
            self.providers.append(("openai", self._call_openai))

        if not self.providers:
            logging.warning("⚠️ 未配置外部 LLM，系统将使用本地 FlowMentor 模式。")

    def _call_moonshot(self, messages: List[Dict[str, str]]) -> str:
        client = OpenAI(api_key=MOONSHOT_API_KEY, base_url=MOONSHOT_BASE_URL)
        completion = client.chat.completions.create(
            model=MOONSHOT_MODEL,
            messages=messages,
            temperature=0.6,
        )
        return completion.choices[0].message.content
    # 在第 315 行（_call_openai 方法的 return 语句）之后添加
    def _call_google_ai(self, messages: List[Dict[str, str]]) -> str:
        client = OpenAI(
            api_key=GOOGLE_AI_API_KEY,
            base_url=f"{GOOGLE_AI_BASE_URL}/models/{GOOGLE_AI_MODEL}"
        )
        completion = client.chat.completions.create(
            model=GOOGLE_AI_MODEL,
            messages=messages,
            temperature=0.6,
        )
        return completion.choices[0].message.content


    def generate(self, messages: List[Dict[str, str]]) -> Tuple[str, str]:
        self.errors.clear()
        for name, provider in self.providers:
            try:
                text = provider(messages)
                return text, name
            except Exception as exc:  # noqa: BLE001
                message = f"{name} provider failed: {exc}"
                logging.warning(message)
                self.errors.append(message)
        raise RuntimeError("All LLM providers failed")

    @property
    def has_provider(self) -> bool:
        return bool(self.providers)


llm_manager = LLMManager()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.json or {}
    user_text = data.get('message', '').strip()
    history = data.get('history', [])

    if not user_text:
        return jsonify({"error": "message is required"}), 400

    context_concepts = retrieve_knowledge(user_text)
    context_str = format_context(context_concepts)

    analysis_bundle = flow_mentor_engine.analyze(user_text, history, context_concepts)
    system_prompt = flow_mentor_engine.build_system_prompt(context_str)

    payload = None
    source = "simulation"

    if llm_manager.has_provider:
        try:
            llm_messages = build_llm_messages(system_prompt, history, user_text)
            raw_text, provider = llm_manager.generate(llm_messages)
            payload = ensure_json_response(raw_text, analysis_bundle, context_concepts, user_text)
            payload["source"] = provider
            source = provider
        except Exception as exc:  # noqa: BLE001
            logging.warning("外部 LLM 不可用，自动降级到本地模式：%s", exc)

    if payload is None:
        payload = flow_mentor_engine.simulate_response(user_text, context_concepts, analysis_bundle)

    if source != "simulation" and "source" not in payload:
        payload["source"] = source

    if llm_manager.errors:
        payload["llm_errors"] = llm_manager.errors

    return jsonify(payload)


def retrieve_knowledge(text):
    """Simple keyword matching retrieval"""
    text = text.lower()
    relevant_concepts = []
    for concept in KNOWLEDGE_BASE['concepts']:
        for keyword in concept['keywords']:
            if keyword.lower() in text:
                relevant_concepts.append(concept)
                break
    return relevant_concepts


def format_context(concepts: List[Dict[str, Any]]) -> str:
    if not concepts:
        return "无匹配的知识库条目。"

    lines = ["相关知识库片段："]
    for c in concepts[:3]:
        keywords = ", ".join(c.get("keywords", [])[:2])
        definition = c.get("definition", "")
        analogies = ", ".join(c.get("analogies", [])[:2])
        psy = ", ".join(c.get("psychology_strategies", [])[:2]) if c.get("psychology_strategies") else "无"
        lines.append(
            f"- 概念: {keywords}\n  定义: {definition}\n  类比: {analogies}\n  心理策略: {psy}"
        )
    return "\n".join(lines)


def ensure_json_response(raw_text: str, fallback: Dict[str, Any],
                         context: List[Dict[str, Any]], user_text: str = "") -> Dict[str, Any]:
    cleaned = raw_text.strip()
    original_text = raw_text.strip()
    
    # 尝试提取JSON
    if "```json" in cleaned:
        cleaned = cleaned.split("```json", 1)[1].split("```", 1)[0]
    elif "```" in cleaned:
        cleaned = cleaned.split("```", 1)[1].split("```", 1)[0]

    try:
        parsed = json.loads(cleaned)
        required = {"response", "microAction", "analysis", "radar", "strategy"}
        if not required.issubset(parsed.keys()):
            raise ValueError("Missing keys in LLM response.")
        return parsed
    except Exception as exc:  # noqa: BLE001
        logging.warning("LLM JSON 解析失败，尝试从原始文本提取：%s", exc)
        
        # 如果API返回了任何内容，都优先使用API返回的内容
        # 即使不是标准JSON格式，也可能包含有用的回答
        if original_text and len(original_text.strip()) > 0:
            # 尝试从文本中提取可能的回答内容
            response_text = original_text.strip()
            # 移除可能的markdown格式标记
            if response_text.startswith("#") or response_text.startswith("```"):
                lines = response_text.split("\n")
                response_text = "\n".join([line for line in lines if not line.strip().startswith("#") and not line.strip().startswith("```")])
            
            # 使用API返回的文本作为回答，即使JSON解析失败
            result = fallback.copy()
            result["response"] = response_text[:2000]  # 限制长度
            result["microAction"] = ""
            result["source"] = "api_fallback"
            result["debug"] = "json_parse_failed_but_using_text"
            logging.info("使用API返回的原始文本作为回答（长度：%d）", len(response_text))
            return result
        
        # 只有在API完全没有返回内容时才降级到本地模拟
        logging.warning("API没有返回任何内容，降级到本地模拟")
        simulation = flow_mentor_engine.simulate_response(user_text or "解析错误，请重试", context, fallback)
        simulation["debug"] = "llm_parse_error_no_content"
        return simulation


def build_llm_messages(system_prompt: str, history: List[Dict[str, Any]], user_text: str) -> List[Dict[str, str]]:
    messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]

    if history:
        for item in history[-10:]:
            if not isinstance(item, dict):
                continue
            role = item.get("role")
            content = item.get("content") or item.get("response", {}).get("content")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})

    last_entry = history[-1] if history else None
    last_role = last_entry.get("role") if isinstance(last_entry, dict) else None
    if last_role != "user":
        messages.append({"role": "user", "content": user_text})

    return messages


@app.route('/static/<path:path>')
def send_static(path):
    return send_from_directory('static', path)


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)

