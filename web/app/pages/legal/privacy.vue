<template>
  <div class="max-w-4xl mx-auto px-4">
    <div class="auth-glass-card rounded-3xl p-8 sm:p-10">
      <!-- Header -->
      <div class="text-center mb-10">
        <div
          class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-6"
        >
          <UIcon
            name="i-heroicons-shield-check"
            class="w-4 h-4 text-emerald-400"
          />
          <span
            class="text-xs font-bold uppercase tracking-widest text-emerald-400"
            >Privacy</span
          >
        </div>
        <h1 class="text-3xl font-black text-white tracking-tight mb-2">
          Privacy Policy
        </h1>
        <p class="text-sm text-gray-500">Last updated: February 18, 2026</p>
      </div>

      <!-- Content -->
      <div class="space-y-8">
        <!-- Intro -->
        <section>
          <p class="text-sm text-slate-400 leading-7">
            Your privacy matters to us. This Privacy Policy explains what
            information we collect, how we use it, and your rights regarding
            that data when you use MODUS (Modular Discord Utility System) and
            its web dashboard.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-extrabold text-slate-200 mb-3 tracking-tight">
            1. Information We Collect
          </h2>
          <p class="text-sm text-slate-400 leading-7 mb-3">
            We collect the minimum amount of information necessary to provide
            the Service. When you sign in via Discord OAuth2, we receive:
          </p>
          <ul class="mt-2 space-y-1">
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-emerald-500/60"
            >
              <strong class="text-slate-300">Discord User ID</strong> — Your
              unique Discord identifier
            </li>
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-emerald-500/60"
            >
              <strong class="text-slate-300">Username & Avatar</strong> — For
              display within the dashboard
            </li>
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-emerald-500/60"
            >
              <strong class="text-slate-300">Server Memberships</strong> — To
              determine which servers you can manage
            </li>
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-emerald-500/60"
            >
              <strong class="text-slate-300">Email Address</strong> — If
              provided by Discord as part of OAuth, used solely for account
              identification
            </li>
          </ul>
          <p class="text-sm text-slate-400 leading-7 mt-4">
            Additionally, the bot may process the following in the context of
            enabled modules:
          </p>
          <ul class="mt-2 space-y-1">
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-emerald-500/60"
            >
              <strong class="text-slate-300">Message Metadata</strong> —
              Character counts for milestone tracking (message content is not
              stored)
            </li>
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-emerald-500/60"
            >
              <strong class="text-slate-300">Voice Channel Audio</strong> — Only
              when the Recording module is explicitly enabled and active
            </li>
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-emerald-500/60"
            >
              <strong class="text-slate-300">Server Configuration Data</strong>
              — Module settings, enabled features, and preferences you configure
            </li>
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-emerald-500/60"
            >
              <strong class="text-slate-300">Music Queue Data</strong> — Song
              titles, URLs, and queue preferences for the Music module
            </li>
          </ul>
        </section>

        <section>
          <h2 class="text-lg font-extrabold text-slate-200 mb-3 tracking-tight">
            2. How We Use Your Information
          </h2>
          <p class="text-sm text-slate-400 leading-7">
            Your information is used exclusively to:
          </p>
          <ul class="mt-2 space-y-1">
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-emerald-500/60"
            >
              Authenticate you and provide access to the dashboard
            </li>
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-emerald-500/60"
            >
              Display your servers and their configuration status
            </li>
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-emerald-500/60"
            >
              Persist your module settings and preferences
            </li>
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-emerald-500/60"
            >
              Operate the bot's features as you've configured them
            </li>
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-emerald-500/60"
            >
              Monitor system health and troubleshoot issues (via server logs)
            </li>
          </ul>
        </section>

        <section
          class="bg-emerald-500/5 border border-emerald-500/15 rounded-2xl p-6"
        >
          <h2
            class="text-lg font-extrabold text-slate-200 mb-3 tracking-tight flex items-center gap-2"
          >
            <UIcon
              name="i-heroicons-shield-exclamation"
              class="w-5 h-5 text-emerald-400"
            />
            3. We Do Not Sell Your Data
          </h2>
          <p class="text-sm text-slate-400 leading-7">
            <strong class="text-white">
              We will never sell, rent, trade, or otherwise provide your
              personal information to third parties for marketing or commercial
              purposes.
            </strong>
            Your data is used solely to operate the Service. Period.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-extrabold text-slate-200 mb-3 tracking-tight">
            4. Data Sharing
          </h2>
          <p class="text-sm text-slate-400 leading-7">
            We only share your information in the following limited cases:
          </p>
          <ul class="mt-2 space-y-1">
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-emerald-500/60"
            >
              <strong class="text-slate-300">With Discord</strong> — As required
              for the bot to function within Discord's platform via their API
            </li>
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-emerald-500/60"
            >
              <strong class="text-slate-300">Infrastructure Providers</strong> —
              Data is stored on our hosting and database providers (such as
              Appwrite) solely for Service operation
            </li>
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-emerald-500/60"
            >
              <strong class="text-slate-300">Legal Requirements</strong> — If
              required to comply with a legal obligation, court order, or
              governmental request
            </li>
          </ul>
        </section>

        <section>
          <h2 class="text-lg font-extrabold text-slate-200 mb-3 tracking-tight">
            5. Data Retention
          </h2>
          <p class="text-sm text-slate-400 leading-7">
            We retain your data only as long as necessary to provide the
            Service:
          </p>
          <ul class="mt-2 space-y-1">
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-emerald-500/60"
            >
              <strong class="text-slate-300">Account Data</strong> — Retained
              while you actively use the Service. If you remove the bot and
              discontinue usage, your data may be deleted upon request.
            </li>
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-emerald-500/60"
            >
              <strong class="text-slate-300">Server Configurations</strong> —
              Retained while the bot is present in your server. Configurations
              may be removed when the bot leaves.
            </li>
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-emerald-500/60"
            >
              <strong class="text-slate-300">Recordings</strong> — Audio
              recordings are stored only for the duration you specify and are
              accessible only to authorized server members.
            </li>
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-emerald-500/60"
            >
              <strong class="text-slate-300">Logs</strong> — Server and
              operational logs are retained for a limited period for
              troubleshooting and are not used for profiling.
            </li>
          </ul>
        </section>

        <section>
          <h2 class="text-lg font-extrabold text-slate-200 mb-3 tracking-tight">
            6. Data Security
          </h2>
          <p class="text-sm text-slate-400 leading-7">
            We implement reasonable security measures to protect your data,
            including:
          </p>
          <ul class="mt-2 space-y-1">
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-emerald-500/60"
            >
              Encrypted authentication via Discord OAuth2 (we never see or store
              your Discord password)
            </li>
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-emerald-500/60"
            >
              Secure, authenticated API communications
            </li>
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-emerald-500/60"
            >
              Restricted access to database and infrastructure
            </li>
          </ul>
          <p class="text-sm text-slate-400 leading-7 mt-3">
            While we take security seriously, no system is completely immune to
            risk. We cannot guarantee absolute security of your data.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-extrabold text-slate-200 mb-3 tracking-tight">
            7. Your Rights
          </h2>
          <p class="text-sm text-slate-400 leading-7">You have the right to:</p>
          <ul class="mt-2 space-y-1">
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-emerald-500/60"
            >
              <strong class="text-slate-300">Access</strong> — Request a copy of
              the data we hold about you
            </li>
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-emerald-500/60"
            >
              <strong class="text-slate-300">Deletion</strong> — Request that we
              delete your data by removing the bot from your servers and
              contacting us
            </li>
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-emerald-500/60"
            >
              <strong class="text-slate-300">Withdraw Consent</strong> — Revoke
              Discord OAuth access at any time via your Discord
              <a
                href="https://discord.com/settings/authorized-apps"
                target="_blank"
                rel="noopener noreferrer"
                class="text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
                >Authorized Apps settings</a
              >
            </li>
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-emerald-500/60"
            >
              <strong class="text-slate-300">Opt Out of Modules</strong> —
              Disable any module at any time to stop the associated data
              processing
            </li>
          </ul>
        </section>

        <section>
          <h2 class="text-lg font-extrabold text-slate-200 mb-3 tracking-tight">
            8. Children's Privacy
          </h2>
          <p class="text-sm text-slate-400 leading-7">
            The Service is not intended for users under the age of 13 (or the
            minimum age required by Discord in your jurisdiction). We do not
            knowingly collect data from children. If you believe a child has
            provided data to us, please contact us for removal.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-extrabold text-slate-200 mb-3 tracking-tight">
            9. Third-Party Services
          </h2>
          <p class="text-sm text-slate-400 leading-7">
            The Service interacts with third-party platforms (primarily
            Discord). Their privacy policies govern the data they collect. We
            encourage you to review:
          </p>
          <ul class="mt-2 space-y-1">
            <li
              class="relative pl-5 text-sm text-slate-400 leading-7 before:content-[''] before:absolute before:left-0 before:top-[0.65rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-emerald-500/60"
            >
              <a
                href="https://discord.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                class="text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
                >Discord Privacy Policy</a
              >
            </li>
          </ul>
        </section>

        <section>
          <h2 class="text-lg font-extrabold text-slate-200 mb-3 tracking-tight">
            10. Changes to This Policy
          </h2>
          <p class="text-sm text-slate-400 leading-7">
            We may update this Privacy Policy from time to time. Any changes
            will be reflected on this page with an updated "Last updated" date.
            Continued use of the Service after changes constitutes acceptance of
            the revised policy.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-extrabold text-slate-200 mb-3 tracking-tight">
            11. Contact
          </h2>
          <p class="text-sm text-slate-400 leading-7">
            If you have questions about this Privacy Policy or wish to exercise
            your data rights, please reach out through our Discord support
            channels.
          </p>
        </section>
      </div>

      <!-- Footer Navigation -->
      <div
        class="mt-12 pt-8 border-t border-white/8 flex flex-col sm:flex-row items-center justify-between gap-4"
      >
        <NuxtLink
          to="/legal/terms"
          class="text-sm text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1.5"
        >
          <UIcon name="i-heroicons-document-text" class="w-4 h-4" />
          Terms of Service
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
  title: "Privacy Policy — MODUS",
  meta: [
    {
      name: "description",
      content:
        "Privacy Policy for the MODUS Modular Discord Utility System. Learn how we handle your data — we never sell it.",
    },
  ],
});
</script>
