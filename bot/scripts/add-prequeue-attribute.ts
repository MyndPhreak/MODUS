import "dotenv/config";
import { Client, Databases } from "node-appwrite";

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT!)
  .setProject(process.env.APPWRITE_PROJECT_ID!)
  .setKey(process.env.APPWRITE_API_KEY!);

const db = new Databases(client);

async function main() {
  try {
    const attr = await db.createStringAttribute(
      "discord_bot",
      "guild_configs",
      "preQueueData", // new dedicated column for pre-queue JSON
      100000, // 100K chars — enough for 500+ tracks
      false, // not required
    );
    console.log(
      "✅ Created preQueueData attribute:",
      attr.key,
      `(status: ${attr.status})`,
    );
    console.log(
      "⏳ Appwrite needs a moment to provision the attribute. Wait ~10s then restart the bot.",
    );
  } catch (err: any) {
    if (err.type === "attribute_already_exists") {
      console.log("ℹ️  Attribute preQueueData already exists, nothing to do.");
    } else {
      console.error("❌ Error:", err.message || err);
      process.exit(1);
    }
  }
}

main();
