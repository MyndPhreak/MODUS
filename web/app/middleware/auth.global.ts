export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return;

  if (to.path === "/dashboard" || to.path.startsWith("/dashboard/")) {
    const userStore = useUserStore();
    if (!userStore.initialized) {
      await userStore.init();
    }
    if (!userStore.isLoggedIn) {
      return navigateTo("/login");
    }
  }
});
