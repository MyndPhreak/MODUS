<script setup lang="ts">
const userStore = useUserStore();

onMounted(async () => {
  await userStore.init();
});
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>

<style>
body {
  margin: 0;
}
</style>
