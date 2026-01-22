// コードエディタ機能
let editor = null;
let outputTerminal = null;

// Monaco Editorの初期化
export async function initCodeEditor() {
  // Monaco Editorのロード
  if (typeof monaco === 'undefined') {
    await loadMonacoEditor();
  }

  const editorContainer = document.getElementById('code-editor-container');
  if (!editorContainer) return;

  // エディタの初期化
  editor = monaco.editor.create(editorContainer, {
    value: getDefaultCode('javascript'),
    language: 'javascript',
    theme: 'vs-dark',
    fontSize: 14,
    minimap: { enabled: true },
    automaticLayout: true,
    scrollBeyondLastLine: false,
    wordWrap: 'on'
  });

  // 言語選択のイベントリスナー
  const languageSelect = document.getElementById('code-language-select');
  if (languageSelect) {
    languageSelect.addEventListener('change', (e) => {
      const language = e.target.value;
      monaco.editor.setModelLanguage(editor.getModel(), language);
      editor.setValue(getDefaultCode(language));
    });
  }

  // 実行ボタンのイベントリスナー
  const runButton = document.getElementById('code-run-btn');
  if (runButton) {
    runButton.addEventListener('click', executeCode);
  }

  // クリアボタンのイベントリスナー
  const clearButton = document.getElementById('code-clear-btn');
  if (clearButton) {
    clearButton.addEventListener('click', clearOutput);
  }

  // 出力エリアの初期化
  initOutputArea();
}

// Monaco Editorのロード
function loadMonacoEditor() {
  return new Promise((resolve, reject) => {
    if (typeof monaco !== 'undefined') {
      resolve();
      return;
    }

    if (typeof require === 'undefined') {
      reject(new Error('Monaco Editorのローダーが読み込まれていません'));
      return;
    }

    require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });
    require(['vs/editor/editor.main'], () => {
      resolve();
    }, (error) => {
      reject(error);
    });
  });
}

// デフォルトコードの取得
function getDefaultCode(language) {
  const defaults = {
    javascript: `// JavaScriptコードをここに記述
console.log("Hello, World!");

function greet(name) {
  return \`こんにちは、\${name}さん！\`;
}

console.log(greet("CTF学習者"));`,
    python: `# Pythonコードをここに記述
print("Hello, World!")

def greet(name):
    return f"こんにちは、{name}さん！"

print(greet("CTF学習者"))`,
    c: `// Cコードをここに記述
#include <stdio.h>

int main() {
    printf("Hello, World!\\n");
    return 0;
}`,
    cpp: `// C++コードをここに記述
#include <iostream>
using namespace std;

int main() {
    cout << "Hello, World!" << endl;
    return 0;
}`,
    java: `// Javaコードをここに記述
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}`
  };
  return defaults[language] || defaults.javascript;
}

// コードの実行
async function executeCode() {
  if (!editor) return;

  const code = editor.getValue();
  const language = document.getElementById('code-language-select')?.value || 'javascript';
  const runButton = document.getElementById('code-run-btn');
  const outputArea = document.getElementById('code-output');

  // 実行中状態
  if (runButton) {
    runButton.disabled = true;
    runButton.textContent = '実行中...';
  }

  if (outputArea) {
    outputArea.innerHTML = '<div style="color: #888;">実行中...</div>';
  }

  try {
    let result;

    // JavaScriptはクライアント側で実行
    if (language === 'javascript') {
      result = await executeJavaScript(code);
    } else {
      // その他の言語はサーバー側で実行
      result = await executeCodeOnServer(code, language);
    }

    displayOutput(result, outputArea);
  } catch (error) {
    displayError(error.message, outputArea);
  } finally {
    if (runButton) {
      runButton.disabled = false;
      runButton.textContent = '実行';
    }
  }
}

// JavaScriptの実行（クライアント側）
async function executeJavaScript(code) {
  return new Promise((resolve) => {
    const output = [];
    const errors = [];

    // console.logをオーバーライド
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    console.log = (...args) => {
      output.push(args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' '));
    };

    console.error = (...args) => {
      errors.push(args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' '));
    };

    console.warn = (...args) => {
      output.push('警告: ' + args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' '));
    };

    try {
      // コードを実行（安全のため、evalではなくFunctionコンストラクタを使用）
      const func = new Function(code);
      func();

      // 元に戻す
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;

      if (errors.length > 0) {
        resolve({
          success: false,
          output: errors.join('\n'),
          error: errors.join('\n')
        });
      } else {
        resolve({
          success: true,
          output: output.length > 0 ? output.join('\n') : '（出力なし）'
        });
      }
    } catch (error) {
      // 元に戻す
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;

      resolve({
        success: false,
        output: '',
        error: error.toString()
      });
    }
  });
}

// サーバー側でのコード実行
async function executeCodeOnServer(code, language) {
  const response = await fetch('/api/execute-code', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({ code, language })
  });

  if (!response.ok) {
    throw new Error(`サーバーエラー: ${response.status}`);
  }

  return await response.json();
}

// 出力の表示
function displayOutput(result, outputArea) {
  if (!outputArea) return;

  if (result.success) {
    outputArea.innerHTML = `<div style="color: #4caf50; white-space: pre-wrap; font-family: 'Courier New', monospace;">${escapeHtml(result.output)}</div>`;
  } else {
    outputArea.innerHTML = `<div style="color: #f44336; white-space: pre-wrap; font-family: 'Courier New', monospace;">エラー:\n${escapeHtml(result.error || result.output)}</div>`;
  }
}

// エラーの表示
function displayError(message, outputArea) {
  if (!outputArea) return;
  outputArea.innerHTML = `<div style="color: #f44336; white-space: pre-wrap; font-family: 'Courier New', monospace;">エラー: ${escapeHtml(message)}</div>`;
}

// 出力エリアのクリア
function clearOutput() {
  const outputArea = document.getElementById('code-output');
  if (outputArea) {
    outputArea.innerHTML = '';
  }
}

// HTMLエスケープ
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 出力エリアの初期化
function initOutputArea() {
  const outputArea = document.getElementById('code-output');
  if (outputArea) {
    outputArea.style.cssText = `
      background: #1e1e1e;
      color: #d4d4d4;
      padding: 15px;
      border-radius: 8px;
      min-height: 100px;
      max-height: 400px;
      overflow-y: auto;
      font-family: 'Courier New', monospace;
      font-size: 14px;
      line-height: 1.5;
    `;
  }
}

