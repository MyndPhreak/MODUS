<template>
  <NuxtLayout name="landing">
    <!-- ========== HERO SECTION ========== -->
    <section class="hero-section">
      <div class="landing-container relative z-10">
        <div
          class="flex flex-col items-center text-center pt-32 pb-20 md:pt-40 md:pb-28"
        >
          <!-- Status badge -->
          <div v-if="stats" class="hero-badge mb-8">
            <div
              :class="[
                'w-2 h-2 rounded-full',
                stats.online
                  ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.6)]'
                  : 'bg-red-400',
              ]"
            ></div>
            <span
              class="text-xs font-bold uppercase tracking-widest text-gray-400"
            >
              {{ stats.online ? "Online" : "Offline" }}
              <span v-if="stats.online" class="text-gray-600 ml-1"
                >• v{{ stats.version }}</span
              >
            </span>
          </div>

          <!-- Logo -->
          <div class="hero-logo-wrapper mb-8">
            <div class="hero-logo-glow"></div>
            <img src="/modus2-animated.svg" alt="MODUS" class="hero-logo" />
          </div>

          <!-- Headline -->
          <h1 class="hero-headline">
            Your Discord Server,
            <span class="hero-headline-gradient">Supercharged</span>
          </h1>

          <p class="hero-subtitle">
            MODUS is a modular Discord bot with 20+ powerful features - from
            music and moderation to AI, anti-raid, recordings, and more. Take
            control of your server with ease, right from the Web Dashboard.
          </p>

          <!-- CTA Buttons -->
          <div class="flex flex-col sm:flex-row items-center gap-4 mt-10">
            <a
              :href="botInviteUrl"
              target="_blank"
              rel="noopener"
              class="hero-btn-primary group"
            >
              <UIcon name="i-simple-icons-discord" class="w-5 h-5" />
              <span>Add MODUS to Your Server</span>
              <UIcon
                name="i-heroicons-arrow-right"
                class="w-4 h-4 opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all duration-300"
              />
            </a>
            <NuxtLink to="/dashboard" class="hero-btn-secondary">
              <UIcon
                name="i-heroicons-arrow-right-on-rectangle"
                class="w-5 h-5"
              />
              <span>Open Dashboard</span>
            </NuxtLink>
          </div>
        </div>
      </div>

      <!-- Hero bottom fade -->
      <div class="hero-fade"></div>
    </section>

    <!-- ========== STATS BAR ========== -->
    <section id="stats" class="py-12 relative z-10">
      <div class="landing-container">
        <div class="stats-bar">
          <div class="stat-item">
            <span class="stat-number">{{ stats?.serverCount ?? "—" }}</span>
            <span class="stat-label">Servers</span>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item">
            <span class="stat-number">{{ moduleList.length }}+</span>
            <span class="stat-label">Modules</span>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item">
            <span class="stat-number"
              >{{ stats?.shardCount ?? "0" }}/{{
                stats?.totalShards ?? "0"
              }}</span
            >
            <span class="stat-label">Shards Online</span>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item">
            <span class="stat-number">v{{ stats?.version ?? "—" }}</span>
            <span class="stat-label">Version</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ========== FEATURES SECTION ========== -->
    <section id="features" class="py-20 relative z-10">
      <div class="landing-container">
        <div class="text-center mb-16">
          <p
            class="text-xs font-bold uppercase tracking-[0.3em] text-violet-400 mb-3"
          >
            Why MODUS
          </p>
          <h2
            class="text-4xl md:text-5xl font-black text-white tracking-tight mb-4"
          >
            Everything Your Server Needs
          </h2>
          <p class="text-gray-400 max-w-2xl mx-auto text-lg">
            One bot to replace them all. MODUS gives you a suite of
            professional-grade tools, all managed from a simple to use web
            dashboard.
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div
            v-for="feature in highlights"
            :key="feature.title"
            class="feature-card group"
          >
            <div class="feature-icon" :style="{ background: feature.gradient }">
              <UIcon :name="feature.icon" class="w-6 h-6 text-white" />
            </div>
            <h3 class="text-lg font-bold text-white mb-2">
              {{ feature.title }}
            </h3>
            <p class="text-sm text-gray-400 leading-relaxed">
              {{ feature.description }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- ========== MODULES GRID SECTION ========== -->
    <section id="modules" class="py-20 relative z-10">
      <div class="landing-container">
        <div class="text-center mb-16">
          <p
            class="text-xs font-bold uppercase tracking-[0.3em] text-indigo-400 mb-3"
          >
            Full Module List
          </p>
          <h2
            class="text-4xl md:text-5xl font-black text-white tracking-tight mb-4"
          >
            20+ Modules, One Bot
          </h2>
          <p class="text-gray-400 max-w-2xl mx-auto text-lg">
            Every module is independently configurable from the web dashboard.
            Enable what you need, disable what you don't.
          </p>
        </div>

        <div
          class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        >
          <div
            v-for="mod in moduleList"
            :key="mod.name"
            class="module-card group"
          >
            <div class="flex items-center gap-3">
              <div class="module-icon" :style="{ background: mod.color }">
                <UIcon :name="mod.icon" class="w-4 h-4 text-white" />
              </div>
              <div class="min-w-0">
                <h4 class="text-sm font-bold text-white truncate">
                  {{ mod.name }}
                </h4>
                <p class="text-[11px] text-gray-500 truncate">
                  {{ mod.tagline }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ========== HOW IT WORKS ========== -->
    <section class="py-20 relative z-10">
      <div class="landing-container">
        <div class="text-center mb-16">
          <p
            class="text-xs font-bold uppercase tracking-[0.3em] text-cyan-400 mb-3"
          >
            Get Started
          </p>
          <h2
            class="text-4xl md:text-5xl font-black text-white tracking-tight mb-4"
          >
            Up and Running in 60 Seconds
          </h2>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div
            v-for="(step, index) in steps"
            :key="step.title"
            class="step-card"
          >
            <div class="step-number">{{ index + 1 }}</div>
            <h3 class="text-lg font-bold text-white mb-2">{{ step.title }}</h3>
            <p class="text-sm text-gray-400 leading-relaxed">
              {{ step.description }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- ========== DASHBOARD PREVIEW ========== -->
    <section class="py-20 relative z-10">
      <div class="landing-container">
        <div class="text-center mb-12">
          <p
            class="text-xs font-bold uppercase tracking-[0.3em] text-violet-400 mb-3"
          >
            Web Dashboard
          </p>
          <h2
            class="text-4xl md:text-5xl font-black text-white tracking-tight mb-4"
          >
            Manage Everything from the Browser
          </h2>
          <p class="text-gray-400 max-w-2xl mx-auto text-lg">
            An easy to use Web Dashboard to configure modules, view logs, manage
            recordings, and monitor your bot - all in real time.
          </p>
        </div>

        <!-- Dashboard preview card -->
        <div class="dashboard-preview">
          <div class="dashboard-preview-header">
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 rounded-full bg-red-500/60"></div>
              <div class="w-3 h-3 rounded-full bg-yellow-500/60"></div>
              <div class="w-3 h-3 rounded-full bg-green-500/60"></div>
            </div>
            <span
              class="text-[10px] font-bold text-gray-600 uppercase tracking-widest"
              >modus.ppo.gg/dashboard</span
            >
          </div>
          <div class="dashboard-preview-body">
            <div class="dashboard-preview-sidebar">
              <div class="w-8 h-8 rounded-lg bg-violet-500/20 mb-4"></div>
              <div class="space-y-2">
                <div class="h-2.5 rounded bg-white/10 w-full"></div>
                <div class="h-2.5 rounded bg-violet-500/30 w-3/4"></div>
                <div class="h-2.5 rounded bg-white/10 w-5/6"></div>
                <div class="h-2.5 rounded bg-white/10 w-2/3"></div>
                <div class="h-2.5 rounded bg-white/10 w-4/5"></div>
              </div>
            </div>
            <div class="dashboard-preview-main">
              <div class="flex gap-4 mb-6">
                <div
                  class="flex-1 h-20 rounded-xl bg-violet-500/10 border border-violet-500/20"
                ></div>
                <div
                  class="flex-1 h-20 rounded-xl bg-emerald-500/10 border border-emerald-500/20"
                ></div>
                <div
                  class="flex-1 h-20 rounded-xl bg-blue-500/10 border border-blue-500/20 hidden sm:block"
                ></div>
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div
                  class="h-32 rounded-xl bg-white/[0.02] border border-white/5"
                ></div>
                <div
                  class="h-32 rounded-xl bg-white/[0.02] border border-white/5"
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ========== FINAL CTA ========== -->
    <section class="py-24 relative z-10">
      <div class="landing-container text-center">
        <div class="cta-card">
          <div class="cta-glow"></div>
          <div class="relative z-10">
            <img
              src="/modus2-animated.svg"
              alt="MODUS"
              class="w-16 h-16 mx-auto mb-6 rounded-xl opacity-80"
            />
            <h2
              class="text-3xl md:text-4xl font-black text-white tracking-tight mb-4"
            >
              Ready to Level Up Your Server?
            </h2>
            <p class="text-gray-400 mb-8 max-w-lg mx-auto">
              Why have multiple bots when you can have one bot that does it all?
              Add MODUS to your server and see the difference.
            </p>
            <a
              :href="botInviteUrl"
              target="_blank"
              rel="noopener"
              class="hero-btn-primary inline-flex group"
            >
              <UIcon name="i-simple-icons-discord" class="w-5 h-5" />
              <span>Add MODUS to Your Server</span>
              <UIcon
                name="i-heroicons-arrow-right"
                class="w-4 h-4 opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all duration-300"
              />
            </a>
          </div>
        </div>
      </div>
    </section>
  </NuxtLayout>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false,
});

const config = useRuntimeConfig();

const botInviteUrl = computed(() => {
  const clientId = config.public.discordClientId as string;
  if (!clientId) return "#";
  return `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot+applications.commands&permissions=8`;
});

// Fetch live stats
interface BotStats {
  online: boolean;
  serverCount: number;
  shardCount: number;
  totalShards: number;
  version: string;
}
const { data: stats } = await useFetch<BotStats>("/api/stats");

const highlights = [
  {
    title: "Music & Audio",
    icon: "i-heroicons-musical-note",
    description:
      "High-fidelity music playback with queue management, filters, and multi-channel recording with per-user audio tracks.",
    gradient: "linear-gradient(135deg, #7c3aed, #6366f1)",
  },
  {
    title: "AI Assistant",
    icon: "i-heroicons-cpu-chip",
    description:
      "Powered by GPT and Claude. Context-aware conversations, image analysis, and intelligent command suggestions.",
    gradient: "linear-gradient(135deg, #06b6d4, #3b82f6)",
  },
  {
    title: "Moderation Suite",
    icon: "i-heroicons-shield-exclamation",
    description:
      "Kick, ban, timeout, warn, and purge with full audit trails. Automod filters for spam, links, and bad words.",
    gradient: "linear-gradient(135deg, #ef4444, #f97316)",
  },
  {
    title: "Web Dashboard",
    icon: "i-heroicons-computer-desktop",
    description:
      "A premium glassmorphic control panel to configure every module, view logs, and manage your bot visually.",
    gradient: "linear-gradient(135deg, #8b5cf6, #a855f7)",
  },
  {
    title: "Anti-Raid Protection",
    icon: "i-heroicons-shield-check",
    description:
      "Detect and stop join floods in real time. Automatic lockdown, mass-kick raiders, and alert your admin team.",
    gradient: "linear-gradient(135deg, #f43f5e, #e11d48)",
  },
  {
    title: "Fully Configurable",
    icon: "i-heroicons-cog-6-tooth",
    description:
      "Every module has deep settings — enable/disable per-channel, set custom thresholds, and fine-tune behavior.",
    gradient: "linear-gradient(135deg, #10b981, #059669)",
  },
];

const moduleList = [
  {
    name: "Music",
    icon: "i-heroicons-musical-note",
    tagline: "High-fidelity playback & queue",
    color: "rgba(124,58,237,0.2)",
  },
  {
    name: "Recording",
    icon: "i-heroicons-microphone",
    tagline: "Per-user voice recording",
    color: "rgba(239,68,68,0.2)",
  },
  {
    name: "AI Assistant",
    icon: "i-heroicons-cpu-chip",
    tagline: "GPT & Claude integration",
    color: "rgba(6,182,212,0.2)",
  },
  {
    name: "Moderation",
    icon: "i-heroicons-shield-exclamation",
    tagline: "Kick, ban, warn, timeout",
    color: "rgba(249,115,22,0.2)",
  },
  {
    name: "AutoMod",
    icon: "i-heroicons-funnel",
    tagline: "Spam, link & word filters",
    color: "rgba(234,88,12,0.2)",
  },
  {
    name: "Logging",
    icon: "i-heroicons-clipboard-document-list",
    tagline: "Full audit log system",
    color: "rgba(59,130,246,0.2)",
  },
  {
    name: "Anti-Raid",
    icon: "i-heroicons-shield-check",
    tagline: "Join flood detection",
    color: "rgba(244,63,94,0.2)",
  },
  {
    name: "Verification",
    icon: "i-heroicons-check-badge",
    tagline: "Button-based member gate",
    color: "rgba(34,197,94,0.2)",
  },
  {
    name: "Welcome",
    icon: "i-heroicons-sparkles",
    tagline: "Dynamic welcome images",
    color: "rgba(168,85,247,0.2)",
  },
  {
    name: "Milestones",
    icon: "i-heroicons-trophy",
    tagline: "Level-up & XP tracking",
    color: "rgba(234,179,8,0.2)",
  },
  {
    name: "Tickets",
    icon: "i-heroicons-ticket",
    tagline: "Support ticket system",
    color: "rgba(14,165,233,0.2)",
  },
  {
    name: "Reaction Roles",
    icon: "i-heroicons-face-smile",
    tagline: "Self-assign roles via reactions",
    color: "rgba(236,72,153,0.2)",
  },
  {
    name: "Temp Voice",
    icon: "i-heroicons-speaker-wave",
    tagline: "Auto-create voice rooms",
    color: "rgba(99,102,241,0.2)",
  },
  {
    name: "Triggers",
    icon: "i-heroicons-bolt",
    tagline: "Custom auto-responses",
    color: "rgba(245,158,11,0.2)",
  },
  {
    name: "Social Alerts",
    icon: "i-heroicons-bell-alert",
    tagline: "YouTube & Twitch notifications",
    color: "rgba(239,68,68,0.2)",
  },
  {
    name: "Custom Embeds",
    icon: "i-heroicons-paint-brush",
    tagline: "Visual embed builder",
    color: "rgba(139,92,246,0.2)",
  },
  {
    name: "Tags",
    icon: "i-heroicons-tag",
    tagline: "Reusable message snippets",
    color: "rgba(20,184,166,0.2)",
  },
  {
    name: "Polls",
    icon: "i-heroicons-chart-bar",
    tagline: "Interactive voting system",
    color: "rgba(59,130,246,0.2)",
  },
  {
    name: "Events",
    icon: "i-heroicons-calendar-days",
    tagline: "Scheduled events manager",
    color: "rgba(168,85,247,0.2)",
  },
  {
    name: "Help",
    icon: "i-heroicons-question-mark-circle",
    tagline: "Auto-generated command help",
    color: "rgba(107,114,128,0.2)",
  },
];

const steps = [
  {
    title: "Invite the Bot",
    description:
      "Click 'Add MODUS' and authorize it for your Discord server with a single click.",
  },
  {
    title: "Open the Dashboard",
    description:
      "Sign in at modus.ppo.gg/dashboard with Discord and select your server.",
  },
  {
    title: "Configure & Go",
    description:
      "Enable modules, set channels, tweak settings, and you're live. It's that simple.",
  },
];
</script>

<style scoped>
/* ============================================
   LANDING PAGE STYLES
   ============================================ */

/* Hero Section */
.hero-section {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.hero-section::before {
  content: "";
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 800px;
  height: 800px;
  background: radial-gradient(
    circle,
    rgba(124, 58, 237, 0.15) 0%,
    rgba(99, 102, 241, 0.08) 30%,
    transparent 60%
  );
  filter: blur(80px);
  pointer-events: none;
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 1rem;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(10px);
}

.hero-logo-wrapper {
  position: relative;
  display: inline-block;
}

.hero-logo-glow {
  position: absolute;
  inset: -20px;
  background: radial-gradient(
    circle,
    rgba(139, 92, 246, 0.35) 0%,
    transparent 70%
  );
  filter: blur(40px);
  animation: hero-glow-pulse 3s ease-in-out infinite;
}

.hero-logo {
  position: relative;
  width: 120px;
  height: 120px;
  filter: drop-shadow(0 0 30px rgba(139, 92, 246, 0.4));
}

.hero-headline {
  font-size: clamp(2.5rem, 6vw, 4.5rem);
  font-weight: 900;
  color: white;
  letter-spacing: -0.03em;
  line-height: 1.1;
  margin-bottom: 1.25rem;
}

.hero-headline-gradient {
  background: linear-gradient(135deg, #a78bfa, #818cf8, #c084fc);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero-subtitle {
  font-size: 1.125rem;
  color: rgba(255, 255, 255, 0.45);
  max-width: 640px;
  line-height: 1.7;
}

.hero-btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.875rem 2rem;
  font-size: 1rem;
  font-weight: 700;
  color: white;
  background: linear-gradient(135deg, #7c3aed, #6366f1);
  border-radius: 1rem;
  text-decoration: none;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow:
    0 8px 32px rgba(124, 58, 237, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.hero-btn-primary:hover {
  background: linear-gradient(135deg, #8b5cf6, #818cf8);
  transform: translateY(-2px);
  box-shadow:
    0 16px 48px rgba(124, 58, 237, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.15);
}

.hero-btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.875rem 2rem;
  font-size: 1rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 1rem;
  text-decoration: none;
  transition: all 0.3s ease;
}

.hero-btn-secondary:hover {
  color: white;
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.15);
  transform: translateY(-1px);
}

.hero-fade {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 120px;
  background: linear-gradient(to bottom, transparent, #050507);
  pointer-events: none;
}

@keyframes hero-glow-pulse {
  0%,
  100% {
    opacity: 0.6;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.15);
  }
}

/* Stats Bar */
.stats-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2rem;
  padding: 1.5rem 2.5rem;
  border-radius: 1.5rem;
  background: rgba(20, 20, 26, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(20px);
  flex-wrap: wrap;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.stat-number {
  font-size: 1.5rem;
  font-weight: 900;
  color: white;
  letter-spacing: -0.02em;
}

.stat-label {
  font-size: 0.625rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: rgba(255, 255, 255, 0.3);
}

.stat-divider {
  width: 1px;
  height: 32px;
  background: rgba(255, 255, 255, 0.06);
}

@media (max-width: 640px) {
  .stat-divider {
    display: none;
  }
  .stats-bar {
    gap: 1.5rem;
  }
}

/* Feature Cards */
.feature-card {
  padding: 1.75rem;
  border-radius: 1.25rem;
  background: rgba(20, 20, 26, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.05);
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.feature-card::before {
  content: "";
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.02),
    transparent
  );
  transition: left 0.6s ease;
}

.feature-card:hover {
  background: rgba(24, 24, 32, 0.7);
  border-color: rgba(255, 255, 255, 0.1);
  transform: translateY(-4px);
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.3);
}

.feature-card:hover::before {
  left: 100%;
}

.feature-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
}

/* Module Cards */
.module-card {
  padding: 1rem 1.25rem;
  border-radius: 1rem;
  background: rgba(20, 20, 26, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.04);
  transition: all 0.3s ease;
}

.module-card:hover {
  background: rgba(28, 28, 38, 0.6);
  border-color: rgba(255, 255, 255, 0.1);
  transform: translateY(-2px);
}

.module-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* Step Cards */
.step-card {
  text-align: center;
  padding: 2rem;
  border-radius: 1.25rem;
  background: rgba(20, 20, 26, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.04);
}

.step-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: linear-gradient(
    135deg,
    rgba(124, 58, 237, 0.2),
    rgba(99, 102, 241, 0.2)
  );
  border: 1px solid rgba(124, 58, 237, 0.3);
  color: #a78bfa;
  font-size: 1.25rem;
  font-weight: 900;
  margin-bottom: 1rem;
}

/* Dashboard Preview */
.dashboard-preview {
  border-radius: 1.25rem;
  overflow: hidden;
  background: rgba(10, 10, 15, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow:
    0 32px 80px rgba(0, 0, 0, 0.5),
    0 0 60px rgba(124, 58, 237, 0.1);
}

.dashboard-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.25rem;
  background: rgba(0, 0, 0, 0.3);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.dashboard-preview-body {
  display: flex;
  min-height: 300px;
}

.dashboard-preview-sidebar {
  width: 200px;
  padding: 1.25rem;
  border-right: 1px solid rgba(255, 255, 255, 0.04);
  flex-shrink: 0;
  display: none;
}

@media (min-width: 768px) {
  .dashboard-preview-sidebar {
    display: block;
  }
}

.dashboard-preview-main {
  flex: 1;
  padding: 1.5rem;
}

/* CTA Card */
.cta-card {
  position: relative;
  padding: 4rem 2rem;
  border-radius: 2rem;
  background: rgba(20, 20, 26, 0.6);
  border: 1px solid rgba(124, 58, 237, 0.15);
  overflow: hidden;
}

.cta-glow {
  position: absolute;
  top: -50%;
  left: 50%;
  transform: translateX(-50%);
  width: 600px;
  height: 400px;
  background: radial-gradient(
    circle,
    rgba(124, 58, 237, 0.15) 0%,
    transparent 60%
  );
  filter: blur(60px);
  pointer-events: none;
}
</style>
