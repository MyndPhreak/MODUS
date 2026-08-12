export interface PageChromeState {
  fullBleed: boolean;
}

export function usePageChrome() {
  const state = useState<PageChromeState>("page-chrome", () => ({
    fullBleed: false,
  }));

  function setFullBleed(value: boolean) {
    state.value = { fullBleed: value };
  }

  function reset() {
    state.value = { fullBleed: false };
  }

  return { state, setFullBleed, reset };
}
