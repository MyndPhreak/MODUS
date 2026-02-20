<script setup lang="ts">
import { computed } from "vue";

const error = useError();

interface ErrorConfig {
  code: number | string;
  icon: string;
  iconColor: string;
  iconBg: string;
  glowColor: string;
  title: string;
  subtitle: string;
  hint: string;
  primaryAction: { label: string; to: string; icon: string } | null;
  secondaryAction: { label: string; to: string } | null;
}

const errorConfig = computed<ErrorConfig>(() => {
  const statusCode = error.value?.statusCode ?? 0;

  if (statusCode === 404) {
    return {
      code: "404",
      icon: "i-heroicons-map",
      iconColor: "text-violet-400",
      iconBg: "bg-violet-500/10",
      glowColor: "rgba(139, 92, 246, 0.15)",
      title: "Page Not Found",
      subtitle: "This page wandered off into the void.",
      hint: "The page you're looking for doesn't exist or may have been moved.",
      primaryAction: {
        label: "Back to Dashboard",
        to: "/",
        icon: "i-heroicons-home",
      },
      secondaryAction: { label: "Login Instead", to: "/login" },
    };
  }

  if (statusCode === 401) {
    return {
      code: "401",
      icon: "i-heroicons-lock-closed",
      iconColor: "text-amber-400",
      iconBg: "bg-amber-500/10",
      glowColor: "rgba(245, 158, 11, 0.15)",
      title: "Authentication Required",
      subtitle: "You need to sign in to access this.",
      hint: "Your session may have expired or you haven't logged in yet. Sign in with Discord to continue.",
      primaryAction: {
        label: "Sign In with Discord",
        to: "/login",
        icon: "i-simple-icons-discord",
      },
      secondaryAction: null,
    };
  }

  if (statusCode === 403) {
    return {
      code: "403",
      icon: "i-heroicons-shield-exclamation",
      iconColor: "text-red-400",
      iconBg: "bg-red-500/10",
      glowColor: "rgba(248, 113, 113, 0.15)",
      title: "Access Denied",
      subtitle: "You don't have permission to be here.",
      hint: "This area requires elevated privileges. If you think this is a mistake, contact your server administrator.",
      primaryAction: {
        label: "Back to Dashboard",
        to: "/",
        icon: "i-heroicons-home",
      },
      secondaryAction: { label: "Login as Different User", to: "/login" },
    };
  }

  if (statusCode >= 500) {
    return {
      code: "500",
      icon: "i-heroicons-server",
      iconColor: "text-blue-400",
      iconBg: "bg-blue-500/10",
      glowColor: "rgba(99, 102, 241, 0.15)",
      title: "Server Error",
      subtitle: "Something went wrong on our end.",
      hint: "MODUS encountered an unexpected issue. This is likely temporary — try again in a moment.",
      primaryAction: {
        label: "Try Again",
        to: "/",
        icon: "i-heroicons-arrow-path",
      },
      secondaryAction: null,
    };
  }

  return {
    code: String(statusCode || "Err"),
    icon: "i-heroicons-exclamation-triangle",
    iconColor: "text-orange-400",
    iconBg: "bg-orange-500/10",
    glowColor: "rgba(251, 146, 60, 0.15)",
    title: "Something Went Wrong",
    subtitle: "An unexpected error occurred.",
    hint:
      error.value?.statusMessage ||
      "Please try again or return to the dashboard.",
    primaryAction: {
      label: "Back to Dashboard",
      to: "/",
      icon: "i-heroicons-home",
    },
    secondaryAction: null,
  };
});

async function handleClearError(to?: string) {
  await clearError({ redirect: to ?? "/" });
}
</script>

<template>
  <div
    class="min-h-screen w-full flex items-center justify-center bg-[#050507] text-slate-200 selection:bg-purple-500/30 relative overflow-hidden"
  >
    <!-- Ambient Background Glows -->
    <div
      class="absolute top-[5%] left-[5%] w-[600px] h-[600px] bg-purple-500/10 rounded-full blur-[130px] pointer-events-none animate-pulse"
      style="animation-duration: 6s"
    />
    <div
      class="absolute bottom-[5%] right-[5%] w-[500px] h-[500px] bg-indigo-500/8 rounded-full blur-[120px] pointer-events-none animate-pulse"
      style="animation-duration: 8s; animation-delay: 2s"
    />
    <!-- Dynamic error-tinted ambient orb -->
    <div
      class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full blur-[160px] pointer-events-none transition-all duration-1000"
      :style="`background: radial-gradient(circle, ${errorConfig.glowColor} 0%, transparent 70%);`"
    />

    <!-- Noise texture overlay -->
    <div
      class="absolute inset-0 opacity-20 pointer-events-none"
      style="
        background-image: url(&quot;https://grainy-gradients.vercel.app/noise.svg&quot;);
      "
    />

    <!-- Main Content -->
    <div
      class="relative z-10 w-full max-w-lg px-6 py-12 flex flex-col items-center text-center"
    >
      <!-- MODUS Logo -->
      <div class="mb-8 flex flex-col items-center">
        <div class="relative -mb-4">
          <img
            src="/modus2-animated.svg"
            alt="MODUS Logo"
            class="w-28 logo-glow"
          />
        </div>
        <h1 class="text-2xl font-black text-white tracking-tighter mt-2">
          MODUS
        </h1>
        <p
          class="text-[9px] font-bold uppercase tracking-[0.3em] text-gray-600 mt-0.5"
        >
          Modular Discord Utility System
        </p>
      </div>

      <!-- Glass Error Card -->
      <div class="error-card w-full">
        <!-- Error Code Badge -->
        <div class="flex justify-center mb-5">
          <span class="error-code-badge">
            {{ errorConfig.code }}
          </span>
        </div>

        <!-- Icon -->
        <div class="flex justify-center mb-5">
          <div
            class="w-20 h-20 rounded-2xl flex items-center justify-center border border-white/5 icon-container"
            :class="errorConfig.iconBg"
            :style="`box-shadow: 0 0 40px ${errorConfig.glowColor}, inset 0 1px 0 rgba(255,255,255,0.05);`"
          >
            <UIcon
              :name="errorConfig.icon"
              :class="['text-4xl', errorConfig.iconColor]"
            />
          </div>
        </div>

        <!-- Title + Subtitle -->
        <h2 class="text-2xl font-black text-white tracking-tight mb-2">
          {{ errorConfig.title }}
        </h2>
        <p class="text-sm font-semibold text-gray-400 mb-1">
          {{ errorConfig.subtitle }}
        </p>
        <p class="text-xs text-gray-600 leading-relaxed max-w-xs mx-auto mb-8">
          {{ errorConfig.hint }}
        </p>

        <!-- Divider -->
        <div class="divider-gradient mb-8" />

        <!-- Actions -->
        <div class="flex flex-col gap-3">
          <button
            v-if="errorConfig.primaryAction"
            class="primary-action-btn group"
            @click="handleClearError(errorConfig.primaryAction!.to)"
          >
            <div
              class="absolute -inset-0.5 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-2xl opacity-0 group-hover:opacity-60 blur transition-opacity duration-300"
            />
            <div
              class="relative flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-xl font-bold text-white text-sm transition-all duration-200 group-hover:from-violet-500 group-hover:to-indigo-500 group-hover:shadow-[0_0_30px_rgba(139,92,246,0.4)]"
            >
              <UIcon
                :name="errorConfig.primaryAction!.icon"
                class="text-base"
              />
              <span>{{ errorConfig.primaryAction!.label }}</span>
            </div>
          </button>

          <button
            v-if="errorConfig.secondaryAction"
            class="secondary-action-btn"
            @click="handleClearError(errorConfig.secondaryAction!.to)"
          >
            {{ errorConfig.secondaryAction!.label }}
          </button>
        </div>
      </div>

      <!-- Footer -->
      <p
        class="mt-8 text-[10px] font-bold uppercase tracking-widest text-gray-700"
      >
        Powered by <span class="text-purple-500/60">MODUS Engine</span>
      </p>
    </div>
  </div>
</template>

<style scoped>
.logo-glow {
  filter: drop-shadow(0 0 20px rgba(139, 92, 246, 0.4))
    drop-shadow(0 0 40px rgba(99, 102, 241, 0.2));
  animation: logo-pulse 3s ease-in-out infinite;
}

@keyframes logo-pulse {
  0%,
  100% {
    filter: drop-shadow(0 0 15px rgba(139, 92, 246, 0.3))
      drop-shadow(0 0 30px rgba(99, 102, 241, 0.15));
  }
  50% {
    filter: drop-shadow(0 0 28px rgba(139, 92, 246, 0.55))
      drop-shadow(0 0 55px rgba(99, 102, 241, 0.35));
  }
}

.error-card {
  background: rgba(13, 13, 16, 0.75);
  backdrop-filter: blur(28px);
  -webkit-backdrop-filter: blur(28px);
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow:
    0 8px 48px rgba(0, 0, 0, 0.8),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  border-radius: 24px;
  padding: 40px;
}

.error-code-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 14px;
  border-radius: 9999px;
  background: rgba(139, 92, 246, 0.08);
  border: 1px solid rgba(139, 92, 246, 0.2);
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: rgba(167, 139, 250, 0.8);
}

.icon-container {
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  animation: icon-float 4s ease-in-out infinite;
}

@keyframes icon-float {
  0%,
  100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-6px);
  }
}

.primary-action-btn {
  position: relative;
  width: 100%;
  transition: all 0.2s ease;
}

.primary-action-btn:hover {
  transform: translateY(-1px);
}

.secondary-action-btn {
  width: 100%;
  padding: 12px 24px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  color: rgba(156, 163, 175, 0.8);
  font-size: 13px;
  font-weight: 600;
  transition: all 0.2s ease;
  cursor: pointer;
}

.secondary-action-btn:hover {
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(255, 255, 255, 0.12);
  color: rgba(209, 213, 219, 1);
  transform: translateY(-1px);
}

.divider-gradient {
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.08),
    transparent
  );
}
</style>
