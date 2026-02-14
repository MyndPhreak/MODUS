import { Client, Account, OAuthProvider } from "node-appwrite";

/**
 * Server-side Discord OAuth initiation.
 * Uses node-appwrite's createOAuth2Token to generate the redirect URL.
 * This avoids the cross-origin cookie issue with createOAuth2Session.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();

  const client = new Client()
    .setEndpoint(config.public.appwriteEndpoint as string)
    .setProject(config.public.appwriteProjectId as string)
    .setKey(config.appwriteApiKey as string);

  const account = new Account(client);

  // The success URL points to our server-side callback handler
  const baseUrl = config.public.baseUrl as string;
  const successUrl = `${baseUrl}/api/auth/callback`;
  const failureUrl = `${baseUrl}/login?error=oauth_failed`;

  try {
    const redirectUrl = await account.createOAuth2Token(
      OAuthProvider.Discord,
      successUrl,
      failureUrl,
      ["identify", "guilds"],
    );

    // Redirect the user to Discord's authorization page
    await sendRedirect(event, redirectUrl);
  } catch (error: any) {
    console.error(
      "[Auth] Discord OAuth token creation failed:",
      error.message || error,
    );
    await sendRedirect(event, `${baseUrl}/login?error=oauth_init_failed`);
  }
});
