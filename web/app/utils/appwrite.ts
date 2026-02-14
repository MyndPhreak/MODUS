import { Client, Databases, Account } from 'appwrite';

const client = new Client();
client
    .setEndpoint('https://api.ppo.gg/v1') // Replace with your endpoint
    .setProject('69266f6e00118a9f6b58'); // Replace with your project ID

export const databases = new Databases(client);
export const account = new Account(client);
export const clientInstance = client;
