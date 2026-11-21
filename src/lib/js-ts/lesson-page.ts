import type { Language, TestCase } from '../../data/js-ts/types';
import type { mountEditor } from './editor';
import { openProgress } from './progress';

type Mode = 'example' | 'exercise';
type View = 'reading' | 'editor' | 'navigation';
type Editor = ReturnType<typeof mountEditor>;

const app = document.querySelector<HTMLElement>('[data-lesson-app]');
if (app) initialize(app);

function initialize(root: HTMLElement) {
  const select = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const id = root.dataset.id!;
  const language = root.dataset.language as Language;
  const { getDraft, getProgress, pass, saveDraft, visit } = openProgress(root.dataset.courseId!);
  const cases: TestCase[] = JSON.parse(root.dataset.cases!);
  const defaults = { example: root.dataset.example!, exercise: root.dataset.starter! };
  const fallback = select<HTMLTextAreaElement>('[data-code-fallback]');
  const host = select('[data-monaco]');
  const resultStatus = select('[data-result-status]');
  const saveStatus = select('[data-save-status]');
  const output = select('[data-run-output]');
  const testOutput = select('[data-test-output]');
  const desktop = window.matchMedia('(min-width: 880px)');
  const action = (name: string) => select<HTMLButtonElement>('[data-editor-action="' + name + '"]');
  const badges = root.querySelectorAll<HTMLElement>('[data-nav-lesson]');
  let mode: Mode = location.hash === '#exercise' ? 'exercise' : 'example';
  let view: View = 'reading';
  let editor: Editor | undefined;
  let loading: Promise<void> | undefined;
  let busy = false;
  let switching = false;
  let fallbackTabMovesFocus = false;

  if (!visit(id)) saveStatus.textContent = '浏览器存储不可用，刷新后可能丢失进度。';
  updateBadges();

  function updateBadges() {
    const { passed, visited } = getProgress();
    for (const link of badges) {
      const lesson = link.dataset.navLesson!;
      const status = link.querySelector('[data-nav-status]')!;
      status.textContent = passed[lesson] ? '✓' : visited[lesson] ? '学习中' : '';
      status.classList.toggle('is-complete', Boolean(passed[lesson]));
      if (passed[lesson]) status.setAttribute('aria-label', '已完成');
    }
    for (const chapter of root.querySelectorAll<HTMLDetailsElement>('.lesson-nav details')) {
      const links = [...chapter.querySelectorAll<HTMLElement>('[data-nav-lesson]')];
      const complete = links.filter(link => passed[link.dataset.navLesson!]).length;
      chapter.querySelector('[data-nav-count]')!.textContent = complete + '/' + links.length;
    }
    const state = select('[data-lesson-status]');
    state.textContent = passed[id] ? '已完成' : '学习中';
    state.classList.toggle('is-complete', Boolean(passed[id]));
  }

  function currentValue() {
    return editor?.getValue() ?? fallback.value;
  }

  function setValue(value: string) {
    switching = true;
    fallback.value = value;
    editor?.setValue(value);
    switching = false;
  }

  function persist(code: string) {
    if (switching) return;
    if (!saveDraft(id, mode, code)) saveStatus.textContent = '浏览器存储不可用或已满，草稿可能无法恢复。';
  }

  function loadEditor() {
    loading ??= import('./editor').then(({ mountEditor }) => {
      host.hidden = false;
      editor = mountEditor(host, language, fallback.value, () => void run(false), persist);
      const hadFallbackFocus = document.activeElement === fallback;
      fallback.hidden = true;
      if (hadFallbackFocus) editor.focus();
    }).catch(() => {
      host.hidden = true;
      saveStatus.textContent = 'Monaco 加载失败，已切换到文本编辑器。刷新页面可重试。';
    });
    return loading;
  }

  function showView(target: View) {
    view = target;
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-view]')) {
      button.setAttribute('aria-pressed', String(button.dataset.view === view));
    }
    for (const panel of root.querySelectorAll<HTMLElement>('[data-view-panel]')) {
      panel.hidden = !desktop.matches && panel.dataset.viewPanel !== view;
    }
    if (desktop.matches || view === 'editor') void loadEditor().then(() => editor?.layout());
  }

  function resetResults() {
    output.textContent = '';
    output.hidden = true;
    testOutput.replaceChildren();
    testOutput.hidden = true;
    resultStatus.textContent = '待运行';
    resultStatus.removeAttribute('data-outcome');
  }

  function showMode(target: Mode, updateUrl = true) {
    if (busy) return;
    mode = target;
    if (updateUrl) history.replaceState(null, '', location.pathname + location.search + (mode === 'exercise' ? '#exercise' : ''));
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
      button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    }
    for (const panel of root.querySelectorAll<HTMLElement>('[data-mode-panel]')) {
      panel.hidden = panel.dataset.modePanel !== mode;
    }
    const filename = select('[data-filename]');
    filename.textContent = (mode === 'exercise' ? 'solve' : 'example') + '.' + filename.dataset.suffix;
    action('submit').hidden = mode !== 'exercise';
    setValue(getDraft(id, mode) ?? defaults[mode]);
    resetResults();
  }

  function print(lines: string[]) {
    output.textContent = lines.join('\n');
    output.hidden = !lines.length;
  }

  function showError(message: string, logs: string[] = []) {
    resultStatus.textContent = '运行失败';
    resultStatus.dataset.outcome = 'error';
    print([...logs, message]);
  }

  function showTests(result: import('./runner').CaseResult[], expected: TestCase[]) {
    for (const [index, test] of result.entries()) {
      const item = document.createElement('li');
      const label = document.createElement('strong');
      label.textContent = '用例 ' + (index + 1) + ' · ' + (test.passed ? '通过' : '失败');
      label.dataset.outcome = test.passed ? 'success' : 'error';
      const details = document.createElement('pre');
      details.textContent = [
        '输入 ' + (language === 'go' ? expected[index].args.join(', ') : JSON.stringify(expected[index].args)),
        '期望 ' + JSON.stringify(expected[index].expected),
        '实际 ' + test.actual,
        ...(test.error ? [test.error] : []),
      ].join('\n');
      item.append(label, details);
      testOutput.append(item);
    }
    testOutput.hidden = !result.length;
  }

  async function run(submit: boolean) {
    if (busy) return;
    resetResults();
    busy = true;
    resultStatus.textContent = '正在运行…';
    action('run').disabled = action('submit').disabled = true;
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-mode]')) button.disabled = true;
    try {
      const { execute, maxCodeLength } = await import('./runner');
      await loadEditor();
      const source = currentValue();
      if (source.length > maxCodeLength) {
        showError('代码最多 24,000 个字符。');
        return;
      }
      if (language === 'typescript' && !editor) {
        showError('TypeScript 需要语言服务，请刷新重试。');
        return;
      }
      const compiled = editor ? await editor.compile() : { code: source, diagnostics: [] };
      if (compiled.diagnostics.length || compiled.code === undefined) {
        resultStatus.textContent = 'TypeScript 检查失败';
        resultStatus.dataset.outcome = 'error';
        print(compiled.diagnostics.length ? compiled.diagnostics : ['编译器未生成 JavaScript。']);
        return;
      }
      const checks = mode === 'example' ? [] : submit ? cases : cases.slice(0, 1);
      if (language === 'go') resultStatus.textContent = '正在加载并运行 Go…';
      const runCode = language === 'go' ? (await import('../go/runner')).executeGo : execute;
      const result = await runCode(compiled.code, checks);
      if (result.error) {
        showError(result.error, result.logs);
        return;
      }
      print(result.logs.length || checks.length ? result.logs : ['运行结束，无控制台输出。']);
      showTests(result.cases, checks);
      const count = result.cases.filter(test => test.passed).length;
      const complete = count === checks.length;
      resultStatus.dataset.outcome = complete ? 'success' : 'error';
      resultStatus.textContent = checks.length ? count + ' / ' + checks.length + ' 通过' : '运行完成';
      if (submit && complete && checks.length) {
        const saved = pass(id);
        updateBadges();
        saveStatus.textContent = saved ? '本节已完成，进度已保存。' : '本节已通过，浏览器未能保存进度。';
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : '运行服务加载失败。');
    } finally {
      busy = false;
      action('run').disabled = action('submit').disabled = false;
      for (const button of root.querySelectorAll<HTMLButtonElement>('[data-mode]')) button.disabled = false;
    }
  }

  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-view]')) {
    button.addEventListener('click', () => showView(button.dataset.view as View));
  }
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
    button.addEventListener('click', () => showMode(button.dataset.mode as Mode));
  }
  select('[data-open-exercise]').addEventListener('click', () => showMode('exercise'));
  select('[data-show-editor]').addEventListener('click', () => {
    showView('editor');
    void loadEditor().then(() => editor ? editor.focus() : fallback.focus());
  });

  fallback.addEventListener('input', () => persist(fallback.value));
  fallback.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void run(false);
    }
    if (event.code === 'KeyM' && event.ctrlKey) {
      event.preventDefault();
      fallbackTabMovesFocus = !fallbackTabMovesFocus;
      saveStatus.textContent = fallbackTabMovesFocus ? 'Tab 移动焦点。' : 'Tab 缩进代码。';
    }
    if (event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey && !fallbackTabMovesFocus) {
      event.preventDefault();
      indentTextarea(fallback, event.shiftKey);
      persist(fallback.value);
    }
  });

  action('run').addEventListener('click', () => void run(false));
  action('submit').addEventListener('click', () => void run(true));
  action('reset').addEventListener('click', () => {
    if (busy) return;
    setValue(defaults[mode]);
    persist(defaults[mode]);
    resetResults();
    saveStatus.textContent = '已恢复初始代码。';
  });
  action('copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(currentValue());
      saveStatus.textContent = '代码已复制。';
    } catch {
      saveStatus.textContent = '无法访问剪贴板，可在编辑器内选中并复制。';
    }
  });

  const height = select<HTMLInputElement>('[data-editor-height]');
  height.addEventListener('input', () => {
    select('[data-editor-area]').style.height = height.value + 'px';
    editor?.layout();
  });
  desktop.addEventListener('change', () => showView(view));
  showMode(mode, false);
  showView(view);
}

function indentTextarea(textarea: HTMLTextAreaElement, outdent: boolean) {
  const { value, selectionStart: start, selectionEnd: end, selectionDirection } = textarea;
  const lineStart = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1;
  if (start === end && !outdent) {
    const spaces = 2 - (start - lineStart) % 2;
    textarea.setRangeText(' '.repeat(spaces), start, end, 'end');
    return;
  }

  const nextBreak = value.indexOf('\n', Math.max(start, end - 1));
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  const original = value.slice(lineStart, lineEnd);
  const lines = original.split('\n');
  const adjusted = lines.map(line => outdent ? line.replace(/^(?: {1,2}|\t)/, '') : '  ' + line);
  const replacement = adjusted.join('\n');
  const startDelta = adjusted[0].length - lines[0].length;
  const endDelta = replacement.length - original.length;
  textarea.setRangeText(replacement, lineStart, lineEnd);
  textarea.setSelectionRange(
    Math.max(lineStart, start + startDelta),
    Math.max(lineStart, end + endDelta),
    selectionDirection,
  );
}
