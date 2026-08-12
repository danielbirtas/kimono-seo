// app/routes/indexnow-verify.$.jsx
// Serves the IndexNow key verification file at /{key}.txt
// IndexNow requires this to prove domain ownership

import prisma from "../db.server.js";

export const loader = async ({ request, params }) => {
  const url      = new URL(request.url);
  const pathname = url.pathname; // e.g. /abc123def456.txt

  // Extract key from pathname
  const match = pathname.match(/\/([a-f0-9]{32})\.txt$/i);
  if (!match) {
    return new Response("Not found", { status: 404 });
  }

  const requestedKey = match[1].toLowerCase();

  // Find store with this IndexNow key
  const setting = await prisma.seoSetting.findFirst({
    where: { key: "seo_indexnow_key", value: requestedKey },
  });

  if (!setting) {
    return new Response("Not found", { status: 404 });
  }

  // Return the key as plain text — IndexNow spec requires this
  return new Response(requestedKey, {
    status: 200,
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "public, max-age=86400",
    },
  });
};
