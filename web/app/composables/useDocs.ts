export interface DocsCommandOption {
  name: string;
  description: string;
  type: string;
  required: boolean;
  options: DocsCommandOption[];
}

export interface DocsCommand {
  name: string;
  description: string;
  options: DocsCommandOption[];
}

export interface DocsModule {
  name: string;
  description: string;
  commands: DocsCommand[];
}

/**
 * Fetches the module/command catalog for the public /docs pages. Cached by
 * Nuxt's useFetch under a shared key so /docs and /docs/[module] reuse one
 * request instead of both fetching independently.
 */
export function useDocs() {
  const { data, pending, error } = useFetch<DocsModule[]>(
    "/api/docs/modules",
    { key: "docs-modules" },
  );

  return {
    modules: data,
    pending,
    error,
  };
}
