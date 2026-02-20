import { Client, Databases, Permission, Role } from "node-appwrite";
import "dotenv/config";

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT!)
  .setProject(process.env.APPWRITE_PROJECT_ID!)
  .setKey(process.env.APPWRITE_API_KEY!);

const databases = new Databases(client);

async function main() {
  await databases.updateCollection(
    "discord_bot",
    "automod_rules",
    "AutoMod Rules",
    [
      Permission.read(Role.users()),
      Permission.write(Role.users()),
      Permission.update(Role.users()),
      Permission.delete(Role.users()),
    ],
    true, // documentSecurity: allow documents to define logic, or just let users write. Let's just grant collection-level read/write.
  );
  console.log("Permissions updated for AutoMod Rules!");
}

main().catch(console.error);
