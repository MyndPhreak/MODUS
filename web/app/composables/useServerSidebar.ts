export interface ServerSidebarTab {
  id: string;
  label: string;
  icon: string;
  badge?: string;
  disabled?: boolean;
  action?: () => void;
}

export interface ServerSidebarState {
  guild: any;
  tabs: ServerSidebarTab[];
  activeTab: string;
}

export function useServerSidebar() {
  const state = useState<ServerSidebarState | null>(
    "server-sidebar",
    () => null,
  );

  function register(data: ServerSidebarState) {
    state.value = data;
  }

  function unregister() {
    state.value = null;
  }

  return { state, register, unregister };
}
