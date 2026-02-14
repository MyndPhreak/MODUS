import { Client, Account, Databases } from 'appwrite';

export default defineNuxtPlugin(() => {
    const config = useRuntimeConfig();

    const client = new Client();
    client
        .setEndpoint(config.public.appwriteEndpoint)
        .setProject(config.public.appwriteProjectId);

    const account = new Account(client);
    const databases = new Databases(client);

    return {
        provide: {
            appwrite: {
                client,
                account,
                databases,
            }
        }
    }
})
