// app/components/HubLayout.jsx
// Polaris-native hub layout (Session 1 migration). Each category sidebar item
// (Audit / Optimize / Generate / AI Surfaces) lands here and shows a Polaris
// card grid with filter chips for plan availability.

import { useState } from "react";
import { useNavigate } from "react-router";
import {
  Page, BlockStack, InlineStack, InlineGrid, Box, Card, Text, Badge, Button,
  ChoiceList, Tag, EmptyState,
} from "@shopify/polaris";

export default function HubLayout({ category, modules, currentPlan, canAccess, statusByModule = {} }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");

  const counts = {
    all:        modules.length,
    accessible: modules.filter(m =>  canAccess(m.id)).length,
    locked:     modules.filter(m => !canAccess(m.id)).length,
  };
  const visible = filter === "all"
    ? modules
    : filter === "locked"
    ? modules.filter(m => !canAccess(m.id))
    : modules.filter(m =>  canAccess(m.id));

  const filterOptions = [
    { label: `Toate (${counts.all})`,                value: "all" },
    { label: `Plan curent (${counts.accessible})`,   value: "accessible" },
    ...(counts.locked > 0 ? [{ label: `Necesită upgrade (${counts.locked})`, value: "locked" }] : []),
  ];

  return (
    <Page title={category.label} subtitle={category.description}>
      <BlockStack gap="500">
        <ChoiceList
          title="Filter"
          titleHidden
          choices={filterOptions}
          selected={[filter]}
          onChange={(values) => setFilter(values[0])}
        />

        {visible.length === 0 ? (
          <Card>
            <EmptyState
              heading="Niciun modul în acest filtru"
              action={{ content: "Arată toate", onAction: () => setFilter("all") }}
            >
              <Text as="p" variant="bodyMd">Schimbă filtrul de mai sus pentru a vedea modulele.</Text>
            </EmptyState>
          </Card>
        ) : (
          <InlineGrid columns={{ xs: 1, sm: 2, md: 3, lg: 3 }} gap="400">
            {visible.map(m => {
              const allowed = canAccess(m.id);
              const status  = statusByModule[m.id];
              return (
                <Card key={m.id}>
                  <BlockStack gap="300">
                    <InlineStack gap="200" blockAlign="center" align="space-between">
                      <InlineStack gap="200" blockAlign="center">
                        <Text as="span" variant="headingLg">{m.icon}</Text>
                        <Text as="h3" variant="headingSm">{m.label}</Text>
                      </InlineStack>
                      {!allowed && <Badge tone="attention">Upgrade</Badge>}
                    </InlineStack>
                    <Text as="p" variant="bodySm" tone="subdued">{m.description}</Text>
                    {status && (
                      <Box paddingBlockStart="200" borderBlockStartWidth="025" borderColor="border">
                        <InlineStack gap="200" blockAlign="center">
                          <Box minWidth="8px" minHeight="8px" background={status.tone === "success" ? "bg-fill-success" : status.tone === "warning" ? "bg-fill-warning" : status.tone === "critical" ? "bg-fill-critical" : "bg-fill-tertiary"} borderRadius="full" />
                          <Text as="span" variant="bodySm" tone="subdued">{status.text}</Text>
                        </InlineStack>
                      </Box>
                    )}
                    <Box paddingBlockStart="100">
                      <Button
                        onClick={() => navigate(allowed ? m.href : `/app/billing?upgrade=GROWTH&module=${m.id}&from=${m.href}`)}
                        variant={allowed ? "primary" : "secondary"}
                        fullWidth
                      >
                        {allowed ? "Deschide →" : "Vezi planuri →"}
                      </Button>
                    </Box>
                  </BlockStack>
                </Card>
              );
            })}
          </InlineGrid>
        )}
      </BlockStack>
    </Page>
  );
}
