<template>
  <div
    class="landing-layout flex flex-col min-h-screen w-full bg-[#050507] text-slate-200 selection:bg-purple-500/30 relative"
  >
    <!-- Background Ambient Effects -->
    <div class="landing-bg-orb landing-bg-orb-1"></div>
    <div class="landing-bg-orb landing-bg-orb-2"></div>
    <div class="landing-bg-orb landing-bg-orb-3"></div>

    <!-- Grid pattern overlay -->
    <div class="landing-grid-pattern"></div>

    <!-- Sticky Navbar -->
    <nav class="landing-navbar" :class="{ scrolled: isScrolled }">
      <div class="landing-container flex items-center justify-between h-16">
        <!-- Brand -->
        <NuxtLink
          to="/"
          class="flex items-center gap-3 group"
          @click.prevent="scrollToTop"
        >
          <img
            src="/modus2-animated.svg"
            alt="MODUS"
            class="w-10 h-10 rounded-lg group-hover:scale-110 transition-transform duration-300"
          />
          <div>
            <span class="text-lg font-black text-white tracking-tight"
              >MODUS</span
            >
          </div>
        </NuxtLink>

        <!-- Nav Links (desktop) -->
        <div class="hidden md:flex items-center gap-1">
          <a
            v-for="link in navLinks"
            :key="link.href"
            :href="link.href"
            class="nav-link"
            @click.prevent="scrollToSection(link.href)"
          >
            {{ link.label }}
          </a>
        </div>

        <!-- CTA -->
        <div class="flex items-center gap-3">
          <NuxtLink
            to="/login"
            class="nav-link hidden sm:inline-flex items-center gap-2"
          >
            <UIcon name="i-heroicons-arrow-right-on-rectangle" class="w-4 h-4" />
            Dashboard
          </NuxtLink>
          <a
            :href="botInviteUrl"
            target="_blank"
            rel="noopener"
            class="landing-btn-primary"
          >
            <UIcon name="i-simple-icons-discord" class="w-4 h-4" />
            Add MODUS
          </a>
        </div>
      </div>
    </nav>

    <!-- Page Content -->
    <main class="flex-1 w-full">
      <slot />
    </main>

    <!-- Footer -->
    <footer class="landing-footer">
      <div class="landing-container">
        <div class="divider-gradient mb-8"></div>
        <div
          class="flex flex-col md:flex-row items-center justify-between gap-6"
        >
          <div class="flex items-center gap-3">
            <img
              src="/modus2-animated.svg"
              alt="MODUS"
              class="w-8 h-8 rounded-lg opacity-60"
            />
            <div>
              <p class="text-sm font-bold text-white/60">MODUS</p>
              <p
                class="text-[9px] font-bold uppercase tracking-widest text-gray-600"
              >
                Modular Discord Utility System
              </p>
            </div>
          </div>

          <div class="flex items-center gap-6">
            <NuxtLink
              to="/legal/terms"
              class="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >Terms</NuxtLink
            >
            <NuxtLink
              to="/legal/privacy"
              class="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >Privacy</NuxtLink
            >
            <NuxtLink
              to="/login"
              class="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >Dashboard</NuxtLink
            >
          </div>

          <p class="text-[10px] text-gray-600 font-medium">
            &copy; {{ new Date().getFullYear() }} MODUS. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
const config = useRuntimeConfig();
const isScrolled = ref(false);

const botInviteUrl = computed(() => {
  const clientId = config.public.discordClientId as string;
  if (!clientId) return "#";
  return `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot+applications.commands&permissions=8`;
});

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "Modules", href: "#modules" },
  { label: "Stats", href: "#stats" },
];

const scrollToSection = (hash: string) => {
  const id = hash.replace('#', '');
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
};

const scrollToTop = () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

onMounted(() => {
  const handleScroll = () => {
    isScrolled.value = window.scrollY > 20;
  };
  window.addEventListener("scroll", handleScroll, { passive: true });
  onUnmounted(() => window.removeEventListener("scroll", handleScroll));
});
</script>

<style>
/* ============================================
   LANDING PAGE LAYOUT STYLES
   ============================================ */

.landing-navbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  background: transparent;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.landing-navbar.scrolled {
  background: rgba(5, 5, 7, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: 0 4px 32px rgba(0, 0, 0, 0.4);
}

.landing-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1.5rem;
}

.nav-link {
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  border-radius: 0.75rem;
  transition: all 0.2s ease;
  text-decoration: none;
}

.nav-link:hover {
  color: rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.05);
}

.landing-btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1.25rem;
  font-size: 0.875rem;
  font-weight: 700;
  color: white;
  background: linear-gradient(135deg, #7c3aed, #6366f1);
  border-radius: 0.75rem;
  border: none;
  text-decoration: none;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 20px rgba(124, 58, 237, 0.3);
}

.landing-btn-primary:hover {
  background: linear-gradient(135deg, #8b5cf6, #818cf8);
  transform: translateY(-1px);
  box-shadow: 0 8px 32px rgba(124, 58, 237, 0.5);
}

.landing-footer {
  padding: 3rem 0;
  border-top: 1px solid rgba(255, 255, 255, 0.03);
}

/* Background Effects */
.landing-bg-orb {
  position: fixed;
  border-radius: 50%;
  filter: blur(120px);
  pointer-events: none;
  z-index: -1;
}

.landing-bg-orb-1 {
  top: -5%;
  left: 20%;
  width: 600px;
  height: 600px;
  background: radial-gradient(
    circle,
    rgba(124, 58, 237, 0.12) 0%,
    transparent 70%
  );
  animation: landing-float 20s ease-in-out infinite;
}

.landing-bg-orb-2 {
  top: 40%;
  right: -5%;
  width: 500px;
  height: 500px;
  background: radial-gradient(
    circle,
    rgba(99, 102, 241, 0.08) 0%,
    transparent 70%
  );
  animation: landing-float 25s ease-in-out infinite reverse;
}

.landing-bg-orb-3 {
  bottom: 10%;
  left: -5%;
  width: 400px;
  height: 400px;
  background: radial-gradient(
    circle,
    rgba(139, 92, 246, 0.06) 0%,
    transparent 70%
  );
  animation: landing-float 30s ease-in-out infinite;
}

.landing-grid-pattern {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: -1;
  background-image: radial-gradient(
    rgba(255, 255, 255, 0.03) 1px,
    transparent 1px
  );
  background-size: 40px 40px;
  mask-image: radial-gradient(
    ellipse 80% 50% at 50% 0%,
    black 30%,
    transparent 70%
  );
}

@keyframes landing-float {
  0%,
  100% {
    transform: translateY(0) translateX(0);
  }
  33% {
    transform: translateY(-30px) translateX(15px);
  }
  66% {
    transform: translateY(15px) translateX(-10px);
  }
}
</style>
