type Mode = 'example' | 'exercise';

interface Progress {
  last?: string;
  visited: Record<string, boolean>;
  passed: Record<string, boolean>;
  drafts: Record<string, string>;
}


function loadProgress(storageKey: string): Progress {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (value && value.visited && value.passed && value.drafts) return value;
  } catch {
    // Storage can be blocked by browser settings.
  }
  return { visited: {}, passed: {}, drafts: {} };
}

export function openProgress(course: string) {
  const storageKey = 'blog.' + course + '.v1';
  let progress = loadProgress(storageKey);

  function update(change: (state: Progress) => void) {
    const stored = loadProgress(storageKey);
    progress = {
      last: stored.last ?? progress.last,
      visited: { ...progress.visited, ...stored.visited },
      passed: { ...progress.passed, ...stored.passed },
      drafts: { ...progress.drafts, ...stored.drafts },
    };
    change(progress);
    try {
      localStorage.setItem(storageKey, JSON.stringify(progress));
      return true;
    } catch {
      return false;
    }
  }

  return {
    getProgress: () => progress,
    visit: (id: string) => update(state => {
      state.visited[id] = true;
      state.last = id;
    }),
    pass: (id: string) => update(state => { state.passed[id] = true; }),
    saveDraft: (id: string, mode: Mode, code: string) =>
      update(state => { state.drafts[id + ':' + mode] = code; }),
    getDraft: (id: string, mode: Mode) => progress.drafts[id + ':' + mode],
  };
}
