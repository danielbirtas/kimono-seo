// app/utils/safe-loader.js
// ═══ Kimono SEO — Safe Loader Wrapper ═══
// Wraps loaders/actions with try/catch and consistent error handling.
//
// Usage:
//   import { safeLoader, safeAction } from "../utils/safe-loader.js";
//
//   export const loader = safeLoader(async ({ request }) => {
//     const { admin, session } = await authenticate.admin(request);
//     // ... your loader logic
//     return { data: "whatever" };
//   });

// json and redirect not needed in react-router v7

/**
 * Wrap a loader function with error handling.
 * On error: returns { _error: true, message } as JSON with status 200
 * so the page can render an error banner instead of crashing.
 */
export function safeLoader(loaderFn) {
  return async (args) => {
    try {
      const result = await loaderFn(args);
      // If already a Response, return as-is
      if (result instanceof Response) return result;
      // Otherwise wrap in json
      return Response.json(result);
    } catch (error) {
      console.error(`[Loader Error] ${args.request.url}:`, error.message);

      // Auth errors should redirect to auth
      if (
        error.message?.includes("authenticate") ||
        error.message?.includes("session") ||
        error.status === 401
      ) {
        throw error; // Let Shopify handle re-auth
      }

      return Response.json(
        {
          _error: true,
          message: error.message || "Something went wrong.",
          stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
        },
        { status: 200 }, // 200 so the page renders with error banner
      );
    }
  };
}

/**
 * Wrap an action function with error handling.
 */
export function safeAction(actionFn) {
  return async (args) => {
    try {
      const result = await actionFn(args);
      if (result instanceof Response) return result;
      return Response.json(result);
    } catch (error) {
      console.error(`[Action Error] ${args.request.url}:`, error.message);
      return Response.json(
        { success: false, error: error.message || "Action failed." },
        { status: 500 },
      );
    }
  };
}

/**
 * React component helper — check if loader returned an error.
 * Usage in components:
 *
 *   const data = useLoaderData();
 *   if (data._error) return <ErrorBanner message={data.message} />;
 */
export function hasLoaderError(data) {
  return data?._error === true;
}
