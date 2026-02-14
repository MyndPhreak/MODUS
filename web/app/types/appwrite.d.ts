import type { Client, Account, Databases } from 'appwrite';

export interface AppwriteContext {
    client: Client;
    account: Account;
    databases: Databases;
}

declare module '#app' {
    interface NuxtApp {
        $appwrite: AppwriteContext;
    }
}
export { };
