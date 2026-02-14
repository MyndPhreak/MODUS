import { useNuxtApp } from '#app';
import type { AppwriteContext } from '~/types/appwrite';

export const useAppwrite = (): AppwriteContext => {
    const { $appwrite } = useNuxtApp();

    return $appwrite;
};
