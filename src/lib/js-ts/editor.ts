import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching';
import 'monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution';
import 'monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController';
import 'monaco-editor/esm/vs/editor/contrib/toggleTabFocusMode/browser/toggleTabFocusMode';
import 'monaco-editor/esm/vs/language/typescript/monaco.contribution';
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution';
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution';
import 'monaco-editor/esm/vs/basic-languages/go/go.contribution';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import TypeScriptWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import type { Language } from '../../data/js-ts/types';

self.MonacoEnvironment = {
  getWorker(_id, type) {
    return type === 'typescript' || type === 'javascript' ? new TypeScriptWorker() : new EditorWorker();
  },
};

const typescript = monaco.languages.typescript;
typescript.typescriptDefaults.setCompilerOptions({
  target: typescript.ScriptTarget.ESNext,
  module: typescript.ModuleKind.ESNext,
  lib: ['lib.es2022.d.ts', 'lib.webworker.d.ts'],
  strict: true,
  // ModuleDetectionKind.Force is not exposed by Monaco 0.52's enum exports.
  moduleDetection: 3,
});

monaco.languages.registerCompletionItemProvider('go', {
  provideCompletionItems(model, position) {
    const word = model.getWordUntilPosition(position);
    const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
    const keywords = 'package import func var const type struct interface if else for range switch case default return defer go chan select break continue map nil make append len cap copy delete panic recover error';
    return {
      suggestions: keywords.split(' ').map(label => ({
        label, insertText: label, range, kind: monaco.languages.CompletionItemKind.Keyword,
      })),
    };
  },
});

export function mountEditor(
  container: HTMLElement, language: Language, initial: string, run: () => void, change: (value: string) => void,
) {
  const theme = () => monaco.editor.setTheme(document.documentElement.dataset.theme === 'dark' ? 'vs-dark' : 'vs');
  theme();
  const observer = new MutationObserver(theme);
  observer.observe(document.documentElement, { attributeFilter: ['data-theme'] });
  const filename = language === 'go' ? 'lesson.go' : language === 'typescript' ? 'lesson.ts' : 'lesson.js';
  const model = monaco.editor.createModel(initial, language, monaco.Uri.parse('file:///practice/' + filename));
  const editor = monaco.editor.create(container, {
    model,
    ariaLabel: '课程代码编辑器',
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 14,
    tabSize: language === 'go' ? 4 : 2,
    ...(language === 'go' ? { insertSpaces: false, detectIndentation: false } : {}),
    tabFocusMode: false,
    scrollBeyondLastLine: false,
    padding: { top: 10, bottom: 10 },
  });
  model.onDidChangeContent(() => change(model.getValue()));
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, run);
  let snapshotNumber = 0;

  return {
    getValue: () => model.getValue(),
    setValue: (value: string) => model.setValue(value),
    async compile() {
      const source = model.getValue();
      if (language !== 'typescript') return { code: source, diagnostics: [] };
      const getWorker = await typescript.getTypeScriptWorker();
      // Use a snapshot model so edits made while diagnostics are in flight do not change this run.
      const uri = monaco.Uri.parse('file:///practice/snapshot-' + ++snapshotNumber + '.ts');
      const snapshot = monaco.editor.createModel(source, language, uri);
      try {
        const compiler = await getWorker(snapshot.uri);
        const filename = uri.toString();
        const [syntax, semantic, output] = await Promise.all([
          compiler.getSyntacticDiagnostics(filename),
          compiler.getSemanticDiagnostics(filename),
          compiler.getEmitOutput(filename),
        ]);
        const diagnostics = [...syntax, ...semantic].slice(0, 20).map(diagnostic => {
          const position = snapshot.getPositionAt(diagnostic.start ?? 0);
          const message = typeof diagnostic.messageText === 'string' ? diagnostic.messageText : diagnostic.messageText.messageText;
          return '第 ' + position.lineNumber + ' 行，第 ' + position.column + ' 列 · ' + message;
        });
        return { code: output.outputFiles.find(file => file.name.endsWith('.js'))?.text, diagnostics };
      } finally {
        snapshot.dispose();
      }
    },
    layout: () => editor.layout(),
    focus: () => editor.focus(),
  };
}
