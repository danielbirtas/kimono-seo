// app/routes/api.ga4.save-property.js
// Saves selected GA4 property — called from ga4-callback picker

import prisma from "../db.server.js";

export async function action({ request }) {
  try {
    const { propertyId, propertyName, storeId } = await request.json();
    if (!propertyId || !storeId) {
      return Response.json({ success: false, error: "Missing propertyId or storeId" }, { status: 400 });
    }

    await prisma.seoSetting.upsert({
      where:  { storeId_key: { storeId, key: "ga4_property_id" } },
      create: { storeId, key: "ga4_property_id", value: propertyId },
      update: { value: propertyId },
    });
    await prisma.seoSetting.upsert({
      where:  { storeId_key: { storeId, key: "ga4_property_name" } },
      create: { storeId, key: "ga4_property_name", value: propertyName || propertyId },
      update: { value: propertyName || propertyId },
    });

    console.log(`[GA4] Property saved: ${propertyId} (${propertyName}) for store ${storeId}`);
    return Response.json({ success: true });
  } catch (err) {
    console.error("[GA4] save-property error:", err.message);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
