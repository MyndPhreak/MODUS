<template>
  <div
    class="min-h-0 h-full"
    :class="
      activeTab === 'welcome'
        ? 'flex flex-col overflow-hidden'
        : 'overflow-y-auto'
    "
  >
    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-20">
      <UIcon
        name="i-heroicons-arrow-path"
        class="w-12 h-12 animate-spin text-primary-500"
      />
    </div>

    <!-- Unauthorized -->
    <div v-else-if="unauthorized" class="text-center py-20">
      <UIcon
        name="i-heroicons-lock-closed"
        class="w-16 h-16 text-red-500 mx-auto mb-4"
      />
      <h1 class="text-3xl font-bold mb-2">Access Denied</h1>
      <p class="text-gray-500 mb-8">
        You do not have administrative privileges for this server.
      </p>
      <UButton to="/" color="primary">Back to Dashboard</UButton>
    </div>

    <!-- Content -->
    <div
      v-else-if="guild"
      :class="
        activeTab === 'welcome'
          ? 'flex-1 flex flex-col min-h-0'
          : 'p-6 lg:p-8 space-y-6'
      "
    >
      <!-- Modules Tab -->
      <section v-if="activeTab === 'modules'">
        <h2 class="text-xl font-semibold mb-4">Command Modules</h2>
        <p class="text-sm text-gray-500 mb-6">
          Enable or disable specific bot modules for this server.
        </p>

        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <UCard v-for="module in modules" :key="module.$id">
            <template #header>
              <div class="flex items-center justify-between">
                <span class="font-semibold">{{ module.name }}</span>
                <UBadge
                  :color="isModuleEnabled(module.name) ? 'success' : 'neutral'"
                  variant="soft"
                >
                  {{ isModuleEnabled(module.name) ? "Active" : "Disabled" }}
                </UBadge>
              </div>
            </template>

            <p
              class="text-xs text-gray-600 dark:text-gray-400 mb-4 h-8 overflow-hidden"
            >
              {{ module.description }}
            </p>

            <!-- Per-Module Settings Toggle -->
            <UButton
              v-if="hasModuleSettings(module.name)"
              variant="ghost"
              color="neutral"
              size="xs"
              block
              class="mb-2"
              :icon="
                expandedModule === module.name
                  ? 'i-heroicons-chevron-up'
                  : 'i-heroicons-cog-6-tooth'
              "
              @click="toggleExpand(module.name)"
            >
              {{
                expandedModule === module.name ? "Hide Settings" : "Configure"
              }}
            </UButton>

            <!-- Music Module Settings Panel -->
            <div
              v-if="
                expandedModule === module.name &&
                module.name.toLowerCase() === 'music'
              "
              class="mt-4 space-y-5 pt-4 border-t border-gray-200 dark:border-gray-700"
            >
              <div>
                <label class="block text-sm font-medium mb-2"
                  >Default Volume: {{ musicSettings.defaultVolume }}%</label
                >
                <USlider
                  v-model="musicSettings.defaultVolume"
                  :min="1"
                  :max="100"
                  :step="1"
                />
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">DJ Role ID</label>
                <UInput
                  v-model="musicSettings.djRoleId"
                  placeholder="Leave empty for no restriction"
                  size="sm"
                />
                <p class="text-[10px] text-gray-500 mt-1">
                  Only users with this role can control music. Leave empty to
                  allow everyone.
                </p>
              </div>
              <div>
                <label class="block text-sm font-medium mb-1"
                  >Max Queue Size</label
                >
                <UInput
                  v-model.number="musicSettings.maxQueueSize"
                  type="number"
                  :min="1"
                  :max="1000"
                  size="sm"
                />
              </div>
              <div class="flex items-center justify-between">
                <div>
                  <label class="text-sm font-medium"
                    >Update Channel Topic</label
                  >
                  <p class="text-[10px] text-gray-500">
                    Show current song in voice channel topic
                  </p>
                </div>
                <USwitch v-model="musicSettings.updateChannelTopic" />
              </div>
              <UButton
                block
                color="primary"
                size="sm"
                :loading="savingSettings"
                @click="saveModuleSettings(module.name)"
              >
                Save Settings
              </UButton>
            </div>

            <template #footer>
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium">Enabled</span>
                <USwitch
                  :model-value="isModuleEnabled(module.name)"
                  @update:model-value="(val) => toggleModule(module.name, val)"
                  :loading="updating === module.name"
                />
              </div>
            </template>
          </UCard>
        </div>
      </section>

      <!-- Danger Zone -->
      <section v-if="activeTab === 'modules'" class="mt-8">
        <h2 class="text-xl font-semibold mb-4 text-red-400">Danger Zone</h2>
        <UCard
          :ui="{
            root: 'border border-red-500/20',
          }"
        >
          <div class="flex items-center justify-between">
            <div>
              <h3 class="font-semibold text-white">Remove Server</h3>
              <p class="text-sm text-gray-400">
                Remove this server from your dashboard. This will delete all
                configurations and logs for this server.
              </p>
            </div>
            <UButton
              color="error"
              variant="soft"
              icon="i-heroicons-trash"
              @click="showRemoveConfirm = true"
              :loading="removing"
            >
              Remove
            </UButton>
          </div>
        </UCard>
      </section>

      <!-- Embeds Tab -->
      <section v-if="activeTab === 'embeds'">
        <div class="mb-8">
          <h2
            class="text-2xl font-bold mb-2 bg-gradient-to-r from-primary-400 to-primary-600 bg-clip-text text-transparent"
          >
            Embed Builder
          </h2>
          <p class="text-sm text-gray-400">
            Create and send stunning rich embed messages to any channel
          </p>
        </div>

        <!-- Split Layout: Form + Preview -->
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <!-- Left Column: Form -->
          <div class="space-y-5">
            <!-- Channel Selector -->
            <div
              class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
            >
              <div
                class="absolute inset-0 bg-gradient-to-br from-primary-500/5 to-transparent pointer-events-none"
              />
              <div class="relative">
                <div class="flex items-center gap-2 mb-4">
                  <div
                    class="p-2 rounded-lg bg-primary-500/10 border border-primary-500/20"
                  >
                    <UIcon
                      name="i-heroicons-hashtag"
                      class="text-primary-400 text-lg"
                    />
                  </div>
                  <h3 class="font-semibold text-white">Target Channel</h3>
                </div>
                <div
                  v-if="channelsLoading"
                  class="flex items-center gap-3 py-3 text-gray-400"
                >
                  <UIcon
                    name="i-heroicons-arrow-path"
                    class="animate-spin text-primary-400"
                  />
                  <span class="text-sm">Loading channels...</span>
                </div>
                <div v-else-if="channels.length === 0" class="py-3">
                  <p class="text-sm text-gray-400">
                    No text channels found. Make sure the bot is in this server.
                  </p>
                </div>
                <USelectMenu
                  v-else
                  v-model="embedForm.channelId"
                  :items="channelOptions"
                  placeholder="Select a channel..."
                  icon="i-heroicons-hashtag"
                  size="lg"
                />
              </div>
            </div>

            <!-- Main Content -->
            <div
              class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
            >
              <div
                class="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent pointer-events-none"
              />
              <div class="relative">
                <div class="flex items-center gap-2 mb-4">
                  <div
                    class="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20"
                  >
                    <UIcon
                      name="i-heroicons-document-text"
                      class="text-blue-400 text-lg"
                    />
                  </div>
                  <h3 class="font-semibold text-white">Content</h3>
                </div>
                <div class="space-y-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-300 mb-2"
                      >Title</label
                    >
                    <UInput
                      v-model="embedForm.title"
                      placeholder="Enter a catchy title..."
                      :maxlength="256"
                      size="lg"
                    />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-300 mb-2">
                      URL
                      <span class="text-gray-500 text-xs font-normal"
                        >(makes title clickable)</span
                      >
                    </label>
                    <UInput
                      v-model="embedForm.url"
                      placeholder="https://example.com"
                      size="lg"
                    />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-300 mb-2">
                      Description
                      <span class="text-gray-500 text-xs font-normal"
                        >(Markdown supported)</span
                      >
                    </label>
                    <UTextarea
                      v-model="embedForm.description"
                      placeholder="Enter your message..."
                      :rows="4"
                      :maxlength="4096"
                      size="lg"
                    />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-300 mb-2"
                      >Color</label
                    >
                    <div class="flex items-center gap-3">
                      <input
                        type="color"
                        v-model="embedColorHex"
                        class="w-12 h-12 rounded-xl cursor-pointer border-2 border-white/10 bg-transparent hover:border-primary-500/50 transition-colors"
                      />
                      <UInput
                        v-model="embedColorHex"
                        placeholder="#5865F2"
                        class="flex-1"
                        size="lg"
                      />
                    </div>
                    <div class="flex gap-2 mt-3">
                      <button
                        v-for="(hex, name) in presetColors"
                        :key="name"
                        :title="name"
                        class="group relative w-10 h-10 rounded-lg border-2 transition-all hover:scale-110 hover:shadow-lg"
                        :class="
                          embedColorHex === hex
                            ? 'border-white scale-110 shadow-lg'
                            : 'border-white/20'
                        "
                        :style="{ backgroundColor: hex }"
                        @click="embedColorHex = hex"
                      >
                        <span
                          class="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none"
                        >
                          {{ name }}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Author Section -->
            <div
              class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
            >
              <div
                class="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent pointer-events-none"
              />
              <div class="relative">
                <div class="flex items-center justify-between mb-4">
                  <div class="flex items-center gap-2">
                    <div
                      class="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20"
                    >
                      <UIcon
                        name="i-heroicons-user"
                        class="text-purple-400 text-lg"
                      />
                    </div>
                    <h3 class="font-semibold text-white">Author</h3>
                  </div>
                  <USwitch v-model="embedForm.showAuthor" />
                </div>
                <div v-if="embedForm.showAuthor" class="space-y-3">
                  <UInput
                    v-model="embedForm.authorName"
                    placeholder="Author name"
                    size="lg"
                  />
                  <UInput
                    v-model="embedForm.authorUrl"
                    placeholder="Author URL (optional)"
                    size="lg"
                  />
                  <UInput
                    v-model="embedForm.authorIconUrl"
                    placeholder="Author icon URL (optional)"
                    size="lg"
                  />
                </div>
                <p v-else class="text-sm text-gray-500">
                  Toggle to add an author section
                </p>
              </div>
            </div>

            <!-- Fields Section -->
            <div
              class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
            >
              <div
                class="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none"
              />
              <div class="relative">
                <div class="flex items-center justify-between mb-4">
                  <div class="flex items-center gap-2">
                    <div
                      class="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20"
                    >
                      <UIcon
                        name="i-heroicons-list-bullet"
                        class="text-emerald-400 text-lg"
                      />
                    </div>
                    <h3 class="font-semibold text-white">Fields</h3>
                    <UBadge
                      :color="
                        embedForm.fields.length >= 25 ? 'error' : 'neutral'
                      "
                      variant="soft"
                    >
                      {{ embedForm.fields.length }}/25
                    </UBadge>
                  </div>
                  <UButton
                    icon="i-heroicons-plus"
                    size="sm"
                    :disabled="embedForm.fields.length >= 25"
                    @click="addField"
                  >
                    Add
                  </UButton>
                </div>
                <div
                  v-if="embedForm.fields.length === 0"
                  class="py-6 text-center"
                >
                  <UIcon
                    name="i-heroicons-inbox"
                    class="text-4xl text-gray-600 mb-2"
                  />
                  <p class="text-sm text-gray-500">
                    No fields yet. Click "Add" to create one.
                  </p>
                </div>
                <div v-else class="space-y-3">
                  <div
                    v-for="(field, index) in embedForm.fields"
                    :key="index"
                    class="relative group p-4 rounded-lg bg-gray-800/50 border border-white/5 hover:border-white/10 transition-colors"
                  >
                    <div class="flex items-center justify-between mb-3">
                      <span class="text-xs font-medium text-gray-400"
                        >Field {{ index + 1 }}</span
                      >
                      <UButton
                        icon="i-heroicons-trash"
                        size="xs"
                        color="error"
                        variant="ghost"
                        @click="removeField(index)"
                      />
                    </div>
                    <div class="space-y-2">
                      <UInput v-model="field.name" placeholder="Field name" />
                      <UTextarea
                        v-model="field.value"
                        placeholder="Field value"
                        :rows="2"
                      />
                      <div class="flex items-center gap-2 pt-1">
                        <USwitch v-model="field.inline" size="sm" />
                        <span class="text-xs text-gray-400"
                          >Display inline</span
                        >
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Images Section -->
            <div
              class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
            >
              <div
                class="absolute inset-0 bg-gradient-to-br from-pink-500/5 to-transparent pointer-events-none"
              />
              <div class="relative">
                <div class="flex items-center gap-2 mb-4">
                  <div
                    class="p-2 rounded-lg bg-pink-500/10 border border-pink-500/20"
                  >
                    <UIcon
                      name="i-heroicons-photo"
                      class="text-pink-400 text-lg"
                    />
                  </div>
                  <h3 class="font-semibold text-white">Images</h3>
                </div>
                <div class="space-y-3">
                  <div>
                    <label class="block text-sm font-medium text-gray-300 mb-2">
                      Large Image
                      <span class="text-gray-500 text-xs font-normal"
                        >(full width)</span
                      >
                    </label>
                    <UInput
                      v-model="embedForm.imageUrl"
                      placeholder="https://example.com/image.png"
                      size="lg"
                    />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-300 mb-2">
                      Thumbnail
                      <span class="text-gray-500 text-xs font-normal"
                        >(small, top-right)</span
                      >
                    </label>
                    <UInput
                      v-model="embedForm.thumbnailUrl"
                      placeholder="https://example.com/thumb.png"
                      size="lg"
                    />
                  </div>
                </div>
              </div>
            </div>

            <!-- Footer Section -->
            <div
              class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
            >
              <div
                class="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent pointer-events-none"
              />
              <div class="relative">
                <div class="flex items-center justify-between mb-4">
                  <div class="flex items-center gap-2">
                    <div
                      class="p-2 rounded-lg bg-orange-500/10 border border-orange-500/20"
                    >
                      <UIcon
                        name="i-heroicons-chat-bubble-bottom-center-text"
                        class="text-orange-400 text-lg"
                      />
                    </div>
                    <h3 class="font-semibold text-white">Footer</h3>
                  </div>
                  <USwitch v-model="embedForm.showFooter" />
                </div>
                <div v-if="embedForm.showFooter" class="space-y-3">
                  <UInput
                    v-model="embedForm.footerText"
                    placeholder="Footer text"
                    size="lg"
                  />
                  <UInput
                    v-model="embedForm.footerIconUrl"
                    placeholder="Footer icon URL (optional)"
                    size="lg"
                  />
                  <div class="flex items-center gap-2">
                    <USwitch v-model="embedForm.showTimestamp" />
                    <span class="text-sm text-gray-400">Show timestamp</span>
                  </div>
                </div>
                <p v-else class="text-sm text-gray-500">
                  Toggle to add a footer
                </p>
              </div>
            </div>

            <!-- Action Buttons -->
            <div class="flex items-center justify-between gap-4 pt-2">
              <UButton
                variant="ghost"
                color="neutral"
                @click="resetEmbedForm"
                icon="i-heroicons-arrow-path"
                size="lg"
              >
                Reset
              </UButton>
              <UButton
                color="primary"
                size="lg"
                icon="i-heroicons-paper-airplane"
                :loading="sendingEmbed"
                :disabled="
                  !embedForm.channelId ||
                  (!embedForm.title &&
                    !embedForm.description &&
                    embedForm.fields.length === 0)
                "
                @click="sendEmbed"
                class="flex-1 max-w-xs"
              >
                Send Embed
              </UButton>
            </div>
          </div>

          <!-- Right Column: Live Preview (Sticky) -->
          <div class="xl:sticky xl:top-6 xl:h-fit">
            <div
              class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
            >
              <div
                class="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent pointer-events-none"
              />
              <div class="relative">
                <div class="flex items-center gap-2 mb-4">
                  <div
                    class="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20"
                  >
                    <UIcon
                      name="i-heroicons-eye"
                      class="text-indigo-400 text-lg"
                    />
                  </div>
                  <h3 class="font-semibold text-white">Live Preview</h3>
                  <UBadge variant="soft" color="success" class="ml-auto">
                    <span class="flex items-center gap-1">
                      <span
                        class="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"
                      />
                      Live
                    </span>
                  </UBadge>
                </div>

                <!-- Discord Preview Container -->
                <div class="bg-[#36393f] rounded-lg p-4 shadow-2xl">
                  <div class="flex gap-0">
                    <div
                      class="w-1 rounded-l flex-shrink-0"
                      :style="{
                        backgroundColor: embedColorHex || '#5865f2',
                      }"
                    />
                    <div class="bg-[#2f3136] rounded-r p-4 flex-1 min-w-0">
                      <!-- Author -->
                      <div
                        v-if="embedForm.showAuthor && embedForm.authorName"
                        class="flex items-center gap-2 mb-2"
                      >
                        <img
                          v-if="embedForm.authorIconUrl"
                          :src="embedForm.authorIconUrl"
                          class="w-6 h-6 rounded-full"
                          @error="
                            (e: Event) =>
                              ((e.target as HTMLImageElement).style.display =
                                'none')
                          "
                        />
                        <a
                          v-if="embedForm.authorUrl"
                          :href="embedForm.authorUrl"
                          class="text-sm font-semibold text-white hover:underline"
                          target="_blank"
                          >{{ embedForm.authorName }}</a
                        >
                        <span v-else class="text-sm font-semibold text-white">{{
                          embedForm.authorName
                        }}</span>
                      </div>

                      <!-- Title -->
                      <div v-if="embedForm.title" class="mb-2">
                        <a
                          v-if="embedForm.url"
                          :href="embedForm.url"
                          class="text-base font-bold text-[#00a8fc] hover:underline line-clamp-2"
                          target="_blank"
                          >{{ embedForm.title }}</a
                        >
                        <span
                          v-else
                          class="text-base font-bold text-white line-clamp-2"
                          >{{ embedForm.title }}</span
                        >
                      </div>

                      <!-- Description -->
                      <p
                        v-if="embedForm.description"
                        class="text-sm text-[#dcddde] whitespace-pre-wrap mb-3 line-clamp-6"
                      >
                        {{ embedForm.description }}
                      </p>

                      <!-- Fields Container -->
                      <div class="flex gap-3">
                        <div class="flex-1 min-w-0">
                          <div
                            v-if="embedForm.fields.length > 0"
                            class="grid gap-3 mt-2"
                            :class="
                              hasInlineFields ? 'grid-cols-3' : 'grid-cols-1'
                            "
                          >
                            <div
                              v-for="(field, i) in embedForm.fields"
                              :key="i"
                              :class="
                                field.inline ? 'col-span-1' : 'col-span-3'
                              "
                            >
                              <div class="text-sm font-bold text-white mb-0.5">
                                {{ field.name || "\u200b" }}
                              </div>
                              <div
                                class="text-sm text-[#dcddde] whitespace-pre-wrap"
                              >
                                {{ field.value || "\u200b" }}
                              </div>
                            </div>
                          </div>
                        </div>
                        <!-- Thumbnail -->
                        <img
                          v-if="embedForm.thumbnailUrl"
                          :src="embedForm.thumbnailUrl"
                          class="w-20 h-20 rounded object-cover flex-shrink-0"
                          @error="
                            (e: Event) =>
                              ((e.target as HTMLImageElement).style.display =
                                'none')
                          "
                        />
                      </div>

                      <!-- Large Image -->
                      <img
                        v-if="embedForm.imageUrl"
                        :src="embedForm.imageUrl"
                        class="rounded mt-4 w-full max-h-80 object-cover"
                        @error="
                          (e: Event) =>
                            ((e.target as HTMLImageElement).style.display =
                              'none')
                        "
                      />

                      <!-- Footer -->
                      <div
                        v-if="
                          embedForm.showFooter &&
                          (embedForm.footerText || embedForm.showTimestamp)
                        "
                        class="flex items-center gap-2 mt-3 pt-3 border-t border-white/5"
                      >
                        <img
                          v-if="embedForm.footerIconUrl"
                          :src="embedForm.footerIconUrl"
                          class="w-5 h-5 rounded-full"
                          @error="
                            (e: Event) =>
                              ((e.target as HTMLImageElement).style.display =
                                'none')
                          "
                        />
                        <span class="text-xs text-[#72767d]">
                          {{ embedForm.footerText }}
                          <template
                            v-if="
                              embedForm.footerText && embedForm.showTimestamp
                            "
                          >
                            •
                          </template>
                          <template v-if="embedForm.showTimestamp">{{
                            new Date().toLocaleDateString()
                          }}</template>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Empty State -->
                <div
                  v-if="
                    !embedForm.title &&
                    !embedForm.description &&
                    embedForm.fields.length === 0
                  "
                  class="absolute inset-0 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm rounded-lg pointer-events-none"
                >
                  <div class="text-center">
                    <UIcon
                      name="i-heroicons-document-text"
                      class="text-5xl text-gray-600 mb-2"
                    />
                    <p class="text-sm text-gray-500">
                      Start typing to see preview
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Welcome Image Tab -->
      <section
        v-if="activeTab === 'welcome'"
        class="flex-1 flex flex-col min-h-0"
      >
        <WelcomeEditor
          :guild-id="guildId"
          :channels="channels"
          :channels-loading="channelsLoading"
          class="flex-1 min-h-0"
        />
      </section>

      <!-- Logs Tab -->
      <section v-if="activeTab === 'logs'">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h2 class="text-xl font-semibold mb-1">Server Logs</h2>
            <p class="text-sm text-gray-500">
              View command usage and bot activity for this server.
            </p>
          </div>
          <UButton
            icon="i-heroicons-arrow-path"
            variant="ghost"
            size="sm"
            @click="fetchLogs"
            :loading="logsLoading"
            :ui="{ rounded: 'rounded-lg' }"
          />
        </div>

        <!-- Level Filter -->
        <div class="flex items-center gap-2 mb-4">
          <UButton
            v-for="lvl in logLevels"
            :key="lvl.value"
            size="xs"
            :variant="logLevelFilter === lvl.value ? 'solid' : 'ghost'"
            :color="lvl.color"
            @click="logLevelFilter = lvl.value"
            class="rounded-lg text-xs font-bold uppercase tracking-wider"
          >
            {{ lvl.label }}
            <UBadge
              v-if="getLogCount(lvl.value) > 0"
              variant="soft"
              :color="lvl.color"
              size="xs"
              class="ml-1"
            >
              {{ getLogCount(lvl.value) }}
            </UBadge>
          </UButton>
        </div>

        <!-- Loading State -->
        <div
          v-if="logsLoading && serverLogs.length === 0"
          class="flex flex-col items-center justify-center py-12"
        >
          <UIcon
            name="i-heroicons-arrow-path"
            class="w-10 h-10 animate-spin text-gray-400 mb-4"
          />
          <p class="text-gray-500">Loading logs...</p>
        </div>

        <!-- Empty State -->
        <div
          v-else-if="filteredServerLogs.length === 0"
          class="flex flex-col items-center justify-center py-12"
        >
          <UIcon
            name="i-heroicons-inbox"
            class="w-12 h-12 text-gray-300 mb-4"
          />
          <p class="text-gray-500 text-center">
            {{
              serverLogs.length === 0
                ? "No logs found for this server yet. Logs will appear here as commands are used."
                : `No ${logLevelFilter} logs found.`
            }}
          </p>
        </div>

        <!-- Logs Terminal -->
        <div
          v-else
          ref="logTerminalRef"
          class="bg-gray-950 rounded-xl border border-white/8 p-4 font-mono text-[11px] max-h-[600px] overflow-y-auto space-y-1"
        >
          <div
            v-for="log in filteredServerLogs"
            :key="log.$id"
            class="flex gap-3 py-1.5 px-2 rounded-md hover:bg-white/5 transition-colors"
          >
            <span class="text-gray-600 whitespace-nowrap shrink-0">{{
              formatFullTime(log.timestamp)
            }}</span>
            <span
              :class="[
                'font-black uppercase min-w-[45px] shrink-0',
                log.level === 'error'
                  ? 'text-red-400'
                  : log.level === 'warn'
                    ? 'text-amber-400'
                    : 'text-blue-400',
              ]"
              >[{{ log.level }}]</span
            >
            <span v-if="log.source" class="text-violet-400/70 shrink-0"
              >[{{ log.source }}]</span
            >
            <span
              v-if="log.shardId !== undefined"
              class="text-gray-600 shrink-0"
              >S{{ log.shardId }}</span
            >
            <span class="text-gray-300 break-words">{{ log.message }}</span>
          </div>
        </div>
      </section>
    </div>

    <!-- Remove Confirmation Modal -->
    <UModal v-model:open="showRemoveConfirm">
      <template #content>
        <div class="p-6 space-y-4">
          <div class="flex items-center gap-3">
            <div class="p-3 rounded-xl bg-red-500/20 border border-red-500/30">
              <UIcon
                name="i-heroicons-exclamation-triangle"
                class="w-6 h-6 text-red-400"
              />
            </div>
            <div>
              <h3 class="text-lg font-bold text-white">Remove Server</h3>
              <p class="text-sm text-gray-400">This action cannot be undone</p>
            </div>
          </div>

          <p class="text-gray-300">
            Are you sure you want to remove
            <strong>{{ guild?.name }}</strong> from your dashboard? All module
            configurations and logs for this server will be permanently deleted.
          </p>

          <div class="flex justify-end gap-3 pt-2">
            <UButton
              color="neutral"
              variant="ghost"
              @click="showRemoveConfirm = false"
            >
              Cancel
            </UButton>
            <UButton
              color="error"
              @click="removeServer"
              :loading="removing"
              icon="i-heroicons-trash"
            >
              Remove Server
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from "vue";
import { Query } from "appwrite";

const route = useRoute();
const guildId = route.params.guild_id as string;
const userStore = useUserStore();
const { databases } = useAppwrite();
const toast = useToast();
const { register: registerSidebar, unregister: unregisterSidebar } =
  useServerSidebar();

const loading = ref(true);
const unauthorized = ref(false);
const guild = ref<any>(null);
const modules = ref<any[]>([]);
const guildConfigs = ref<any[]>([]);
const updating = ref<string | null>(null);
const expandedModule = ref<string | null>(null);
const savingSettings = ref(false);
const showRemoveConfirm = ref(false);
const removing = ref(false);
const activeTab = ref<"modules" | "logs" | "embeds" | "welcome">("modules");
const musicSettings = ref({
  defaultVolume: 50,
  djRoleId: "",
  updateChannelTopic: false,
  maxQueueSize: 200,
});

// Sidebar tab definitions
const sidebarTabs = computed(() => [
  {
    id: "modules",
    label: "Modules",
    icon: "i-heroicons-squares-2x2",
    action: () => (activeTab.value = "modules"),
  },
  {
    id: "logs",
    label: "Logs",
    icon: "i-heroicons-document-text",
    action: () => switchToLogs(),
  },
  {
    id: "embeds",
    label: "Embeds",
    icon: "i-heroicons-paint-brush",
    action: () => {
      activeTab.value = "embeds";
      loadChannels();
    },
  },
  {
    id: "welcome",
    label: "Welcome Image",
    icon: "i-heroicons-sparkles",
    action: () => {
      activeTab.value = "welcome";
      loadChannels();
    },
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: "i-heroicons-bell",
    badge: "Soon",
    disabled: true,
    action: undefined,
  },
]);

// Logs state
const serverLogs = ref<any[]>([]);
const logsLoading = ref(false);
const logLevelFilter = ref("all");
const logTerminalRef = ref<HTMLElement | null>(null);
const logSubscription = ref<(() => void) | null>(null);

const logLevels = [
  { value: "all", label: "All", color: "neutral" as const },
  { value: "info", label: "Info", color: "info" as const },
  { value: "warn", label: "Warn", color: "warning" as const },
  { value: "error", label: "Error", color: "error" as const },
];

const filteredServerLogs = computed(() => {
  if (logLevelFilter.value === "all") return serverLogs.value;
  return serverLogs.value.filter((log) => log.level === logLevelFilter.value);
});

const getLogCount = (level: string) => {
  if (level === "all") return serverLogs.value.length;
  return serverLogs.value.filter((log) => log.level === level).length;
};

const databaseId = "discord_bot";
const modulesCollectionId = "modules";
const guildConfigsCollectionId = "guild_configs";
const logsCollectionId = "logs";

// ── Embeds State ──
const channels = ref<any[]>([]);
const channelsLoading = ref(false);
const sendingEmbed = ref(false);
const embedColorHex = ref("#5865f2");

const presetColors: Record<string, string> = {
  Blurple: "#5865f2",
  Green: "#57f287",
  Yellow: "#fee75c",
  Red: "#ed4245",
  Fuchsia: "#eb459e",
  Orange: "#e67e22",
  Blue: "#3498db",
  Purple: "#9b59b6",
};

const embedForm = ref({
  channelId: "",
  title: "",
  url: "",
  description: "",
  showAuthor: false,
  authorName: "",
  authorUrl: "",
  authorIconUrl: "",
  fields: [] as Array<{ name: string; value: string; inline: boolean }>,
  imageUrl: "",
  thumbnailUrl: "",
  showFooter: false,
  footerText: "",
  footerIconUrl: "",
  showTimestamp: false,
});

const channelOptions = computed(() =>
  channels.value.map((c) => ({
    label: `#${c.name}`,
    value: c.id,
  })),
);

const hasInlineFields = computed(() =>
  embedForm.value.fields.some((f) => f.inline),
);

const addField = () => {
  if (embedForm.value.fields.length >= 25) return;
  embedForm.value.fields.push({ name: "", value: "", inline: false });
};

const removeField = (index: number) => {
  embedForm.value.fields.splice(index, 1);
};

const resetEmbedForm = () => {
  embedForm.value = {
    channelId: embedForm.value.channelId,
    title: "",
    url: "",
    description: "",
    showAuthor: false,
    authorName: "",
    authorUrl: "",
    authorIconUrl: "",
    fields: [],
    imageUrl: "",
    thumbnailUrl: "",
    showFooter: false,
    footerText: "",
    footerIconUrl: "",
    showTimestamp: false,
  };
  embedColorHex.value = "#5865f2";
};

const loadChannels = async () => {
  if (channels.value.length > 0) return;
  channelsLoading.value = true;
  try {
    const response = (await $fetch("/api/discord/channels", {
      params: { guild_id: guildId },
    })) as any;
    channels.value = response.channels || [];
  } catch (error) {
    console.error("Error loading channels:", error);
    toast.add({
      title: "Error",
      description:
        "Failed to load channels. Make sure the bot is in this server.",
      color: "error",
    });
  } finally {
    channelsLoading.value = false;
  }
};

const sendEmbed = async () => {
  const form = embedForm.value;
  if (!form.channelId) {
    toast.add({
      title: "Error",
      description: "Please select a channel.",
      color: "error",
    });
    return;
  }
  if (!form.title && !form.description && form.fields.length === 0) {
    toast.add({
      title: "Error",
      description: "Embed must have at least a title, description, or fields.",
      color: "error",
    });
    return;
  }

  sendingEmbed.value = true;
  try {
    const selectedChannelId =
      typeof form.channelId === "object" && form.channelId !== null
        ? (form.channelId as any).value
        : form.channelId;

    if (!selectedChannelId) {
      toast.add({
        title: "Error",
        description: "Please select a channel.",
        color: "error",
      });
      sendingEmbed.value = false;
      return;
    }

    const embed: Record<string, any> = {};
    if (form.title) embed.title = form.title;
    if (form.description) embed.description = form.description;
    if (form.url) embed.url = form.url;

    const colorInt = parseInt(embedColorHex.value.replace("#", ""), 16);
    embed.color = isNaN(colorInt) ? 0x5865f2 : colorInt;

    if (form.showAuthor && form.authorName) {
      embed.author = { name: form.authorName };
      if (form.authorUrl) embed.author.url = form.authorUrl;
      if (form.authorIconUrl) embed.author.icon_url = form.authorIconUrl;
    }

    if (form.fields.length > 0) {
      embed.fields = form.fields.map((f) => ({
        name: f.name || "\u200b",
        value: f.value || "\u200b",
        inline: f.inline,
      }));
    }

    if (form.imageUrl) embed.image = { url: form.imageUrl };
    if (form.thumbnailUrl) embed.thumbnail = { url: form.thumbnailUrl };

    if (form.showFooter && form.footerText) {
      embed.footer = { text: form.footerText };
      if (form.footerIconUrl) embed.footer.icon_url = form.footerIconUrl;
    }

    if (form.showTimestamp) embed.timestamp = true;

    await $fetch("/api/discord/send-embed", {
      method: "POST",
      body: {
        guild_id: guildId,
        channel_id: selectedChannelId,
        embed,
      },
    });

    const channelName =
      channels.value.find((c) => c.id === selectedChannelId)?.name || "channel";
    toast.add({
      title: "Embed Sent!",
      description: `Successfully sent to #${channelName}.`,
      color: "success",
    });

    resetEmbedForm();
  } catch (error: any) {
    console.error("Error sending embed:", error);
    toast.add({
      title: "Failed to Send",
      description:
        error?.data?.statusMessage || error?.message || "Unknown error.",
      color: "error",
    });
  } finally {
    sendingEmbed.value = false;
  }
};

const isModuleEnabled = (moduleName: string) => {
  const config = guildConfigs.value.find(
    (c) => c.moduleName === moduleName.toLowerCase(),
  );
  return config ? config.enabled : true;
};

const fetchModules = async () => {
  try {
    const response = await databases.listDocuments(
      databaseId,
      modulesCollectionId,
    );
    modules.value = response.documents;
  } catch (error) {
    console.error("Error fetching modules:", error);
  }
};

const fetchGuildConfigs = async () => {
  try {
    const response = await databases.listDocuments(
      databaseId,
      guildConfigsCollectionId,
      [Query.equal("guildId", guildId)],
    );
    guildConfigs.value = response.documents;
  } catch (error) {
    console.error("Error fetching guild configs:", error);
  }
};

const hasModuleSettings = (moduleName: string): boolean => {
  return ["music"].includes(moduleName.toLowerCase());
};

const toggleExpand = async (moduleName: string) => {
  if (expandedModule.value === moduleName) {
    expandedModule.value = null;
    return;
  }
  expandedModule.value = moduleName;

  if (moduleName.toLowerCase() === "music") {
    const config = guildConfigs.value.find((c) => c.moduleName === "music");
    if (config?.settings) {
      try {
        const saved = JSON.parse(config.settings);
        musicSettings.value = {
          defaultVolume: saved.defaultVolume ?? 50,
          djRoleId: saved.djRoleId ?? "",
          updateChannelTopic: saved.updateChannelTopic ?? false,
          maxQueueSize: saved.maxQueueSize ?? 200,
        };
      } catch {
        // Use defaults if JSON is invalid
      }
    }
  }
};

const saveModuleSettings = async (moduleName: string) => {
  savingSettings.value = true;
  try {
    const config = guildConfigs.value.find(
      (c) => c.moduleName === moduleName.toLowerCase(),
    );
    const settingsJson = JSON.stringify(
      moduleName.toLowerCase() === "music" ? musicSettings.value : {},
    );

    if (config) {
      const updated = await databases.updateDocument(
        databaseId,
        guildConfigsCollectionId,
        config.$id,
        {
          settings: settingsJson,
        },
      );
      const index = guildConfigs.value.findIndex((c) => c.$id === config.$id);
      guildConfigs.value[index] = updated;
    } else {
      const created = await databases.createDocument(
        databaseId,
        guildConfigsCollectionId,
        "unique()",
        {
          guildId,
          moduleName: moduleName.toLowerCase(),
          enabled: true,
          settings: settingsJson,
        },
      );
      guildConfigs.value.push(created);
    }

    toast.add({
      title: "Settings Saved",
      description: `${moduleName} settings updated for this server.`,
      color: "success",
    });
  } catch (error) {
    console.error("Error saving module settings:", error);
    toast.add({
      title: "Error",
      description: "Failed to save module settings.",
      color: "error",
    });
  } finally {
    savingSettings.value = false;
  }
};

const checkPermissions = async () => {
  try {
    let discordGuilds: any[] = [];

    try {
      const response = await fetch("/api/discord/guilds");
      if (response.ok) {
        discordGuilds = await response.json();
      }
    } catch {
      // Server API failed
    }

    if (!discordGuilds || discordGuilds.length === 0) {
      discordGuilds = userStore.userGuilds;
    }

    if (discordGuilds && discordGuilds.length > 0) {
      const currentGuild = discordGuilds.find((g: any) => g.id === guildId);

      if (currentGuild) {
        const ADMIN_PERMISSION = 0x8;
        const permissions = BigInt(currentGuild.permissions);
        if (
          (permissions & BigInt(ADMIN_PERMISSION)) ===
          BigInt(ADMIN_PERMISSION)
        ) {
          guild.value = currentGuild;
          return;
        } else {
          unauthorized.value = true;
          return;
        }
      }
    }

    try {
      const serverDoc = await databases.getDocument(
        databaseId,
        "servers",
        guildId,
      );

      if (serverDoc.ownerId === userStore.user?.$id) {
        guild.value = {
          id: serverDoc.$id,
          name: serverDoc.name,
          icon: null,
          owner: true,
          permissions: "8",
        };
        return;
      }
    } catch {
      // Document not found or permission denied
    }

    unauthorized.value = true;
  } catch (error) {
    console.error("Error checking permissions:", error);
    unauthorized.value = true;
  }
};

const toggleModule = async (moduleName: string, enabled: boolean) => {
  updating.value = moduleName;
  try {
    const existingConfig = guildConfigs.value.find(
      (c) => c.moduleName === moduleName.toLowerCase(),
    );

    if (existingConfig) {
      const updated = await databases.updateDocument(
        databaseId,
        guildConfigsCollectionId,
        existingConfig.$id,
        {
          enabled,
        },
      );
      const index = guildConfigs.value.findIndex(
        (c) => c.$id === existingConfig.$id,
      );
      guildConfigs.value[index] = updated;
    } else {
      const created = await databases.createDocument(
        databaseId,
        guildConfigsCollectionId,
        "unique()",
        {
          guildId,
          moduleName: moduleName.toLowerCase(),
          enabled,
          settings: "{}",
        },
      );
      guildConfigs.value.push(created);
    }

    toast.add({
      title: "Success",
      description: `Module ${moduleName} ${enabled ? "enabled" : "disabled"} for this server.`,
      color: "success",
    });
  } catch (error) {
    console.error("Error toggling module:", error);
    toast.add({
      title: "Error",
      description: "Failed to update module status.",
      color: "error",
    });
  } finally {
    updating.value = null;
  }
};

// ── Logs ──
const fetchLogs = async () => {
  logsLoading.value = true;
  try {
    const response = await databases.listDocuments(
      databaseId,
      logsCollectionId,
      [
        Query.equal("guildId", guildId),
        Query.orderDesc("timestamp"),
        Query.limit(100),
      ],
    );
    serverLogs.value = response.documents;
  } catch (error) {
    console.error("Error fetching logs:", error);
  } finally {
    logsLoading.value = false;
  }
};

const switchToLogs = async () => {
  activeTab.value = "logs";
  if (serverLogs.value.length === 0) {
    await fetchLogs();
  }
  if (logSubscription.value) logSubscription.value();
  const { client } = useAppwrite();
  logSubscription.value = client.subscribe(
    `databases.${databaseId}.collections.${logsCollectionId}.documents`,
    (response: any) => {
      if (response.events.some((e: string) => e.includes(".create"))) {
        const newLog = response.payload;
        if (newLog.guildId === guildId) {
          serverLogs.value = [newLog, ...serverLogs.value].slice(0, 100);
        }
      }
    },
  );
};

const formatFullTime = (dateString: string) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const removeServer = async () => {
  removing.value = true;
  try {
    for (const config of guildConfigs.value) {
      try {
        await databases.deleteDocument(
          databaseId,
          guildConfigsCollectionId,
          config.$id,
        );
      } catch (err) {
        console.warn("Failed to delete config:", config.$id, err);
      }
    }

    await databases.deleteDocument(databaseId, "servers", guildId);

    toast.add({
      title: "Server Removed",
      description: `${guild.value?.name || "Server"} has been removed from your dashboard.`,
      color: "success",
    });

    showRemoveConfirm.value = false;
    navigateTo("/");
  } catch (error) {
    console.error("Error removing server:", error);
    toast.add({
      title: "Error",
      description: "Failed to remove server. Please try again.",
      color: "error",
    });
  } finally {
    removing.value = false;
  }
};
// Register sidebar when guild data becomes available
watch(
  [guild, activeTab, sidebarTabs],
  () => {
    if (guild.value) {
      registerSidebar({
        guild: guild.value,
        tabs: sidebarTabs.value,
        activeTab: activeTab.value,
      });
    }
  },
  { immediate: true, deep: true },
);

onMounted(async () => {
  try {
    if (!userStore.isLoggedIn) {
      await userStore.fetchUserSession();
    }

    if (!userStore.isLoggedIn) {
      useRouter().push("/login");
      return;
    }

    await checkPermissions();

    if (!unauthorized.value) {
      await Promise.all([fetchModules(), fetchGuildConfigs()]);
    }
  } catch (error) {
    console.error("Error initializing settings:", error);
  } finally {
    loading.value = false;
  }
});

onUnmounted(() => {
  unregisterSidebar();
  if (logSubscription.value) {
    logSubscription.value();
  }
});
</script>
