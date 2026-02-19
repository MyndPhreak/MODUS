<template>
  <div class="max-w-4xl mx-auto px-4">
    <div class="auth-glass-card rounded-3xl p-8 sm:p-10">
      <!-- Header -->
      <div class="text-center mb-10">
        <div
          class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 mb-6"
        >
          <UIcon
            name="i-heroicons-document-text"
            class="w-4 h-4 text-violet-400"
          />
          <span
            class="text-xs font-bold uppercase tracking-widest text-violet-400"
            >Legal</span
          >
        </div>
        <h1 class="text-3xl font-black text-white tracking-tight mb-2">
          Terms of Service
        </h1>
        <p class="text-sm text-gray-500">Last updated: February 18, 2026</p>
      </div>

      <!-- Content -->
      <div class="space-y-8">
        <section>
          <h2 class="text-lg font-extrabold text-slate-200 mb-3 tracking-tight">
            1. Acceptance of Terms
          </h2>
          <p class="text-sm text-slate-400 leading-7">
            By accessing or using the MODUS (Modular Discord Utility System)
            dashboard and its associated Discord bot ("the Service"), you agree
            to be bound by these Terms of Service. If you do not agree to these
            terms, you should not use the Service.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-extrabold text-slate-200 mb-3 tracking-tight">
            2. Description of Service
          </h2>
          <p class="text-sm text-slate-400 leading-7">
            MODUS is a modular Discord bot management platform that allows
            server administrators to configure and manage bot modules, commands,
            and server settings through a web dashboard. The Service includes:
          </p>
          <ul class="mt-2 space-y-1">
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-violet-500/60"
            >
              Web-based dashboard for bot configuration
            </li>
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-violet-500/60"
            >
              Discord bot functionality across configured servers
            </li>
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-violet-500/60"
            >
              Module management (music, recording, moderation, milestones, etc.)
            </li>
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-violet-500/60"
            >
              Server monitoring and status reporting
            </li>
          </ul>
        </section>

        <section>
          <h2 class="text-lg font-extrabold text-slate-200 mb-3 tracking-tight">
            3. User Accounts
          </h2>
          <p class="text-sm text-slate-400 leading-7">
            To use the Service, you must authenticate using your Discord account
            via Discord OAuth2. By signing in, you authorize us to access basic
            information from your Discord profile, including your username,
            avatar, and server memberships. You are responsible for all activity
            that occurs under your account.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-extrabold text-slate-200 mb-3 tracking-tight">
            4. Acceptable Use
          </h2>
          <p class="text-sm text-slate-400 leading-7">
            You agree not to use the Service to:
          </p>
          <ul class="mt-2 space-y-1">
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-violet-500/60"
            >
              Violate any applicable laws or regulations
            </li>
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-violet-500/60"
            >
              Violate Discord's
              <a
                href="https://discord.com/terms"
                target="_blank"
                rel="noopener noreferrer"
                class="text-violet-400 hover:text-violet-300 underline underline-offset-2"
                >Terms of Service</a
              >
              or
              <a
                href="https://discord.com/guidelines"
                target="_blank"
                rel="noopener noreferrer"
                class="text-violet-400 hover:text-violet-300 underline underline-offset-2"
                >Community Guidelines</a
              >
            </li>
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-violet-500/60"
            >
              Attempt to gain unauthorized access to the Service or its
              underlying systems
            </li>
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-violet-500/60"
            >
              Interfere with or disrupt the integrity or performance of the
              Service
            </li>
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-violet-500/60"
            >
              Use the Service for spam, harassment, or abuse of any kind
            </li>
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-violet-500/60"
            >
              Reverse-engineer, decompile, or attempt to extract the source code
              of the Service (except where permitted by law)
            </li>
          </ul>
        </section>

        <section>
          <h2 class="text-lg font-extrabold text-slate-200 mb-3 tracking-tight">
            5. Bot Permissions
          </h2>
          <p class="text-sm text-slate-400 leading-7">
            When adding the MODUS bot to a Discord server, you grant it the
            permissions required for its enabled modules to function. These may
            include reading and sending messages, managing voice channels, and
            accessing server member information. You can revoke these
            permissions at any time by removing the bot from your server.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-extrabold text-slate-200 mb-3 tracking-tight">
            6. Content and Recordings
          </h2>
          <p class="text-sm text-slate-400 leading-7">
            Certain modules (such as the Recording module) may capture audio
            from Discord voice channels. By enabling these modules, you
            acknowledge that:
          </p>
          <ul class="mt-2 space-y-1">
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-violet-500/60"
            >
              You are responsible for informing all participants in a voice
              channel that recording is taking place
            </li>
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-violet-500/60"
            >
              You comply with all applicable consent and privacy laws regarding
              audio recording in your jurisdiction
            </li>
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-violet-500/60"
            >
              MODUS is not responsible for how you use recorded content
            </li>
          </ul>
        </section>

        <section>
          <h2 class="text-lg font-extrabold text-slate-200 mb-3 tracking-tight">
            7. Service Availability
          </h2>
          <p class="text-sm text-slate-400 leading-7">
            We strive to keep the Service operational, but we do not guarantee
            100% uptime. The Service may be temporarily unavailable due to
            maintenance, updates, or circumstances beyond our control. We are
            not liable for any loss or damage arising from Service
            interruptions.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-extrabold text-slate-200 mb-3 tracking-tight">
            8. Limitation of Liability
          </h2>
          <p class="text-sm text-slate-400 leading-7">
            The Service is provided "as is" and "as available" without
            warranties of any kind. To the fullest extent permitted by law, we
            disclaim all warranties, express or implied. We shall not be liable
            for any indirect, incidental, special, consequential, or punitive
            damages resulting from your use of the Service.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-extrabold text-slate-200 mb-3 tracking-tight">
            9. Termination
          </h2>
          <p class="text-sm text-slate-400 leading-7">
            We reserve the right to suspend or terminate your access to the
            Service at any time, with or without cause. You may stop using the
            Service at any time by removing the bot from your servers and
            ceasing to access the dashboard.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-extrabold text-slate-200 mb-3 tracking-tight">
            10. Changes to These Terms
          </h2>
          <p class="text-sm text-slate-400 leading-7">
            We may update these Terms from time to time. Continued use of the
            Service after changes constitutes your acceptance of the revised
            Terms. We encourage you to review these Terms periodically.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-extrabold text-slate-200 mb-3 tracking-tight">
            11. Contact
          </h2>
          <p class="text-sm text-slate-400 leading-7">
            If you have any questions about these Terms of Service, please reach
            out through our Discord support channels.
          </p>
        </section>
      </div>

      <!-- Footer Navigation -->
      <div
        class="mt-12 pt-8 border-t border-white/8 flex flex-col sm:flex-row items-center justify-between gap-4"
      >
        <NuxtLink
          to="/legal/privacy"
          class="text-sm text-violet-400 hover:text-violet-300 transition-colors flex items-center gap-1.5"
        >
          <UIcon name="i-heroicons-shield-check" class="w-4 h-4" />
          Privacy Policy
        </NuxtLink>
        <NuxtLink
          to="/login"
          class="text-sm text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1.5"
        >
          <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" />
          Back to Login
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: "legal",
});

useHead({
  title: "Terms of Service — MODUS",
  meta: [
    {
      name: "description",
      content:
        "Terms of Service for the MODUS Modular Discord Utility System dashboard and bot.",
    },
  ],
});
</script>
