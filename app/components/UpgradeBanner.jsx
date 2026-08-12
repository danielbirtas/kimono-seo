export function UpgradeBanner({ feature, requiredPlan }) {
  return (
    <s-page heading={feature}>
      <s-section>
        <s-box
          padding="loose"
          borderWidth="base"
          borderRadius="base"
          background="subdued"
        >
          <s-stack direction="block" gap="base">
            <s-text variant="headingLg">
              Upgrade to unlock {feature}
            </s-text>
            <s-text variant="bodyMd" tone="subdued">
              This feature is available on the{" "}
              <s-text fontWeight="bold">{requiredPlan}</s-text> plan and above.
              Upgrade now to get access, including a 14-day free trial.
            </s-text>
            <s-link href="/app/pricing">
              <s-button variant="primary">
                View Plans & Upgrade
              </s-button>
            </s-link>
          </s-stack>
        </s-box>
      </s-section>
    </s-page>
  );
}
