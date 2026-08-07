<template>
  <div class="p-6 lg:p-8 space-y-6">
    <div class="mb-6">
      <h2
        class="text-2xl font-bold mb-2 bg-gradient-to-r from-violet-400 to-fuchsia-500 bg-clip-text text-transparent"
      >
        Bot Identity
      </h2>
      <p class="text-sm text-gray-400">
        Give the bot a custom nickname and avatar in this server only. Other
        servers are unaffected.
      </p>
    </div>

    <div
      v-if="errorMessage"
      class="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
    >
      {{ errorMessage }}
    </div>

    <div
      class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
    >
      <div
        class="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-transparent pointer-events-none"
      />
      <div class="relative space-y-5">
        <div class="flex items-center gap-4">
          <UAvatar
            :src="avatarPreview || undefined"
            :alt="nickname || 'Bot'"
            size="3xl"
          />
          <div class="flex flex-col gap-2">
            <div class="flex gap-2">
              <UButton
                size="sm"
                variant="soft"
                :loading="uploading"
                @click="(($refs.avatarInput as HTMLInputElement).click())"
              >
                Upload avatar
              </UButton>
              <UButton
                v-if="avatarImage"
                size="sm"
                variant="ghost"
                color="error"
                @click="clearAvatar"
              >
                Remove
              </UButton>
            </div>
            <input
              ref="avatarInput"
              type="file"
              accept="image/*"
              class="sr-only"
              @change="handleAvatarUpload"
            />
            <p class="text-xs text-gray-500">PNG, JPG, or GIF. Max 8 MB.</p>
          </div>
        </div>

        <UFormField label="Nickname">
          <UInput
            v-model="nickname"
            placeholder="Leave blank to use the bot's default name"
            :maxlength="32"
            class="w-full max-w-sm"
          />
          <p class="mt-1 text-xs text-gray-500">{{ nickname.length }}/32</p>
        </UFormField>

        <div class="flex justify-end">
          <UButton color="primary" :loading="saving" @click="save">
            Save
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";

const route = useRoute();
const guildId = route.params.guild_id as string;
const toast = useToast();

const nickname = ref("");
const avatarImage = ref<string | null>(null);
const avatarPreview = ref<string | null>(null);
const uploading = ref(false);
const saving = ref(false);
const errorMessage = ref("");

const savedNickname = ref<string | null>(null);
const savedAvatarImage = ref<string | null>(null);

const avatarSrc = computed(() =>
  avatarImage.value ? avatarImage.value : null,
);

async function load() {
  try {
    const cfg = await $fetch<{ enabled: boolean; settings: Record<string, any> }>(
      `/api/guild-configs/${encodeURIComponent(guildId)}/identity`,
    );
    nickname.value = cfg.settings?.nickname ?? "";
    avatarImage.value = cfg.settings?.avatarImage ?? null;
    avatarPreview.value = avatarImage.value;
    savedNickname.value = cfg.settings?.nickname ?? null;
    savedAvatarImage.value = cfg.settings?.avatarImage ?? null;
  } catch (err: any) {
    console.error("[Identity] load error:", err);
    errorMessage.value = "Failed to load current identity settings.";
  }
}

async function handleAvatarUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    avatarPreview.value = (e.target?.result as string) || null;
  };
  reader.readAsDataURL(file);

  uploading.value = true;
  errorMessage.value = "";
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("guild_id", guildId);
    const res = await fetch("/api/identity/upload-avatar", {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.statusMessage || "Upload failed");
    }
    const { url } = await res.json();
    avatarImage.value = url;
    toast.add({
      title: "Avatar uploaded",
      description: "Remember to hit Save to apply it.",
      color: "success",
    });
  } catch (err: any) {
    errorMessage.value = err?.message || "Could not upload image.";
    avatarPreview.value = avatarImage.value;
  } finally {
    uploading.value = false;
    input.value = "";
  }
}

function clearAvatar() {
  avatarImage.value = null;
  avatarPreview.value = null;
}

async function save() {
  saving.value = true;
  errorMessage.value = "";
  try {
    await $fetch(`/api/identity/${encodeURIComponent(guildId)}`, {
      method: "PUT",
      body: {
        nickname: nickname.value.trim() || null,
        avatarImage: avatarImage.value,
      },
    });
    savedNickname.value = nickname.value.trim() || null;
    savedAvatarImage.value = avatarImage.value;
    toast.add({
      title: "Saved!",
      description: "Bot identity updated for this server.",
      color: "success",
    });
  } catch (err: any) {
    errorMessage.value =
      err?.data?.statusMessage || err?.message || "Failed to save.";
    // Roll back to the last known-applied values on failure so the form
    // doesn't show a state that Discord actually rejected.
    nickname.value = savedNickname.value || "";
    avatarImage.value = savedAvatarImage.value;
    avatarPreview.value = savedAvatarImage.value;
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>
