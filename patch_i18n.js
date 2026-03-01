const fs = require('fs');
let content = fs.readFileSync('src/i18n.ts', 'utf8');

const s_en = `
      "chat": {
        "responses": {
          "0": "Hello! How can I help you today?",
          "1": "I am ready to help you."
        },
        "tools": {
          "search": "Search",
          "code": "Code",
          "photo": "Photo",
          "music": "Music"
        }
      },
      "suggestions": {
        "gpt-5.2-codex": {
          "0": "Write a python script",
          "1": "Explain React hooks",
          "2": "Create a CSS grid layout",
          "3": "How to center a div?"
        },
        "claude-opus-4.6": {
          "0": "Write an essay about AI",
          "1": "Summarize this article",
          "2": "Help me translate a text",
          "3": "Draft a formal email"
        },
        "claude-sonnet-4.6": {
          "0": "Write a sonnet about the sea",
          "1": "Help me brainstorm ideas",
          "2": "Create a pros/cons list",
          "3": "Write a polite decline email"
        },
        "gemini-3.1-pro": {
          "0": "Analyze this dataset",
          "1": "Help me with math",
          "2": "Write a regular expression",
          "3": "Explain quantum computing"
        },
        "mistral-large-latest": {
          "0": "Write a bash script",
          "1": "Explain system architecture",
          "2": "Create a deployment plan",
          "3": "Write a README file"
        },
        "deepseek-v3.2-exp": {
          "0": "Write a C++ class",
          "1": "Solve a leetcode problem",
          "2": "Explain memory management",
          "3": "Write a sorting algorithm"
        },
        "qwen-3-max": {
          "0": "Translate to Chinese",
          "1": "Write a poem",
          "2": "Explain machine learning",
          "3": "Help with data analysis"
        }
      },`;

const s_ru = `
      "chat": {
        "responses": {
          "0": "Привет! Чем я могу помочь сегодня?",
          "1": "Я готов помочь вам."
        },
        "tools": {
          "search": "Поиск",
          "code": "Код",
          "photo": "Фото",
          "music": "Музыка"
        }
      },
      "suggestions": {
        "gpt-5.2-codex": {
          "0": "Напиши скрипт на Python",
          "1": "Объясни хуки в React",
          "2": "Создай CSS grid",
          "3": "Как центрировать div?"
        },
        "claude-opus-4.6": {
          "0": "Напиши эссе про ИИ",
          "1": "Сделай краткое содержание",
          "2": "Помоги перевести текст",
          "3": "Напиши формальное письмо"
        },
        "claude-sonnet-4.6": {
          "0": "Напиши стих о море",
          "1": "Помоги придумать идеи",
          "2": "Сделай список за/против",
          "3": "Напиши вежливый отказ"
        },
        "gemini-3.1-pro": {
          "0": "Проанализируй данные",
          "1": "Помоги с математикой",
          "2": "Напиши регулярное выражение",
          "3": "Объясни квантовые компьютеры"
        },
        "mistral-large-latest": {
          "0": "Напиши bash скрипт",
          "1": "Объясни архитектуру",
          "2": "Создай план деплоя",
          "3": "Напиши README"
        },
        "deepseek-v3.2-exp": {
          "0": "Напиши класс на C++",
          "1": "Реши задачу leetcode",
          "2": "Объясни управление памятью",
          "3": "Напиши алгоритм сортировки"
        },
        "qwen-3-max": {
          "0": "Переведи на китайский",
          "1": "Напиши стихотворение",
          "2": "Объясни машинное обучение",
          "3": "Помоги с анализом данных"
        }
      },`;

const snippets = { en: s_en, ru: s_ru, uk: s_ru, kz: s_ru, by: s_ru };

for (const lang of Object.keys(snippets)) {
    const targetRegex = new RegExp('\"' + lang + '\": \\{\\r?\\n\\\\s*\"translation\": \\{', 'm');

    if (targetRegex.test(content)) {
        content = content.replace(targetRegex, '"' + lang + '": {\\n    "translation": {' + snippets[lang]);
        console.log('patched ' + lang);
    } else {
        console.log('not found ' + lang);
    }
}

fs.writeFileSync('src/i18n.ts', content, 'utf8');
console.log('Done.');
