import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  AgentStatus,
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  Checkbox,
  DarkPanel,
  DecisionBadge,
  EmptyState,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FilterBar,
  Input,
  InsetPanel,
  IntegrationStatus,
  List,
  ListRow,
  LoadingState,
  Logo,
  MetadataList,
  MetadataRow,
  PageSection,
  Pagination,
  PlanBadge,
  Radio,
  RiskIndicator,
  Select,
  Skeleton,
  Switch,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Textarea
} from "@/components/ui";
import { InteractivePreview } from "./preview";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Design-system foundation preview — BehalfID",
  description: "Internal preview of BehalfID semantic tokens and shared UI primitives.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/design-system/foundation" }
};

type TokenSpec = {
  label: string;
  token: `--${string}`;
};

const SURFACE_TOKENS = [
  { label: "Page", token: "--surface-page" },
  { label: "Elevated", token: "--surface-elevated" },
  { label: "Muted", token: "--surface-muted" },
  { label: "Inset", token: "--surface-inset" },
  { label: "Dark", token: "--surface-dark" }
] as const satisfies readonly TokenSpec[];

const TEXT_TOKENS = [
  { label: "Primary", token: "--text-primary" },
  { label: "Secondary", token: "--text-secondary" },
  { label: "Muted", token: "--text-muted" },
  { label: "Accent", token: "--accent-base" },
  { label: "Success", token: "--text-success" },
  { label: "Warning", token: "--text-warning" },
  { label: "Destructive", token: "--text-destructive" }
] as const satisfies readonly TokenSpec[];

const DECISIONS = [
  {
    agent: "deploy-agent-prod",
    action: "vercel.deployments.create",
    resource: "identity-api / production",
    decision: "approval" as const,
    request: "req_7mK4p9",
    time: "14:32:08"
  },
  {
    agent: "release-notes-agent",
    action: "github.pull_requests.read",
    resource: "behalf/web",
    decision: "allowed" as const,
    request: "req_7mK4p8",
    time: "14:29:41"
  },
  {
    agent: "finance-ops-agent",
    action: "stripe.refunds.create",
    resource: "payment_intent_4M2f…",
    decision: "denied" as const,
    request: "req_7mK4p7",
    time: "14:24:17"
  }
] as const;

function SectionHeading({
  eyebrow,
  title,
  description
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className={styles.sectionHeading}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h2 className="ui-type-section-title">{title}</h2>
      <p className="ui-type-body">{description}</p>
    </div>
  );
}

function TokenSwatch({ label, token }: TokenSpec) {
  const swatchStyle = { "--swatch": `var(${token})` } as CSSProperties;
  return (
    <div className={styles.swatch}>
      <span className={styles.swatchColor} style={swatchStyle} />
      <span>
        <strong>{label}</strong>
        <code>{token}</code>
      </span>
    </div>
  );
}

function EmptyIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 18 18" width="18">
      <path d="M3 5.5h12v8H3zM6 2.5h6M6 9h6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
    </svg>
  );
}

export default function DesignSystemFoundationPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className={`${styles.root} ui-theme-light`} id="main-content" tabIndex={-1}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Logo href="/" markStyle="framed" />
          <div className={styles.headerMeta}>
            <Badge variant="accent">Foundation preview</Badge>
            <ButtonLink href="/" size="small" variant="outline">View homepage</ButtonLink>
          </div>
        </div>
      </header>

      <PageSection className={styles.hero} width="wide">
        <div className={styles.heroGrid}>
          <div>
            <p className={styles.eyebrow}>BehalfID design system · foundation</p>
            <h1 className="ui-type-display">Authority, expressed with clarity.</h1>
          </div>
          <div className={styles.heroAside}>
            <p className="ui-type-body">
              A semantic token spine and reusable interface primitives derived from the approved warm,
              editorial production-homepage direction. This route uses static examples only.
            </p>
            <dl className={styles.heroMetaList}>
              <div><dt>Theme</dt><dd>Warm neutral + pale copper</dd></div>
              <div><dt>Density</dt><dd>Editorial marketing / compact product UI</dd></div>
              <div><dt>Mode</dt><dd>Isolated preview, no application data</dd></div>
            </dl>
          </div>
        </div>
      </PageSection>

      <PageSection className={styles.section} id="tokens" spacing="compact" width="wide">
        <SectionHeading
          description="Semantic roles remain stable while their values adapt to the existing light and dark themes."
          eyebrow="01 · Tokens"
          title="Warm surfaces. Strong ink. One restrained accent."
        />
        <div className={styles.tokenGroups}>
          <Card className={styles.tokenGroup} padding="medium">
            <h3 className="ui-type-card-title">Surfaces</h3>
            <div className={styles.swatches}>
              {SURFACE_TOKENS.map((token) => <TokenSwatch key={token.token} {...token} />)}
            </div>
          </Card>
          <Card className={styles.tokenGroup} padding="medium">
            <h3 className="ui-type-card-title">Text and signal</h3>
            <div className={styles.swatches}>
              {TEXT_TOKENS.map((token) => <TokenSwatch key={token.token} {...token} />)}
            </div>
          </Card>
        </div>
        <div className={styles.foundationStrip}>
          <span><strong>Radii</strong> 6 / 10 / 14px</span>
          <span><strong>Page gutter</strong> 24px · 18px mobile</span>
          <span><strong>Content</strong> 1180px</span>
          <span><strong>Form</strong> 420px</span>
          <span><strong>Focus</strong> 2px copper + outer ring</span>
        </div>
      </PageSection>

      <PageSection className={styles.section} id="typography" spacing="compact" width="wide">
        <SectionHeading
          description="Large editorial roles are opt-in; product titles and compact data keep a controlled interface scale."
          eyebrow="02 · Typography"
          title="A role-based type system for marketing and product work."
        />
        <div className={styles.typeStack}>
          <div className={styles.typeRow}>
            <code>display</code>
            <p className="ui-type-display">Permission before execution.</p>
          </div>
          <div className={styles.typeRow}>
            <code>page title</code>
            <p className="ui-type-page-title">Agent authorization policy</p>
          </div>
          <div className={styles.typeRow}>
            <code>section title</code>
            <p className="ui-type-section-title">Production controls</p>
          </div>
          <div className={styles.typeRow}>
            <code>card title</code>
            <p className="ui-type-card-title">Protected repositories</p>
          </div>
          <div className={styles.typeRow}>
            <code>body</code>
            <p className="ui-type-body">Every proposed action is evaluated against agent identity, policy, resource, and required authority before it runs.</p>
          </div>
          <div className={styles.typeRow}>
            <code>compact / label / caption</code>
            <div className={styles.compactTypeExamples}>
              <p className="ui-type-compact">Compact body supports dense product explanations.</p>
              <span className="ui-type-label">Field label</span>
              <span className="ui-type-caption">Last verified 4 minutes ago</span>
              <code className="ui-type-mono">agent_7mK4p9 · req_92b4e1</code>
            </div>
          </div>
        </div>
      </PageSection>

      <PageSection className={styles.section} id="buttons" spacing="compact" width="wide">
        <SectionHeading
          description="All variants share hover, pressed, focus-visible, disabled, and loading behavior."
          eyebrow="03 · Actions"
          title="Buttons communicate hierarchy without overusing copper."
        />
        <Card className={styles.specimen} padding="large">
          <p className={styles.specimenLabel}>Variants and states</p>
          <div className={styles.buttonGrid}>
            <Button type="button" variant="primary">Primary action</Button>
            <Button type="button" variant="secondary">Secondary</Button>
            <Button type="button" variant="outline">Outline</Button>
            <Button type="button" variant="ghost">Ghost</Button>
            <Button type="button" variant="destructive">Revoke access</Button>
            <Button aria-label="More actions" size="icon" type="button" variant="outline">
              <span aria-hidden="true">•••</span>
            </Button>
            <Button disabled type="button" variant="primary">Disabled</Button>
            <Button loading type="button" variant="primary">Publishing policy</Button>
          </div>
        </Card>
      </PageSection>

      <PageSection className={styles.section} id="forms" spacing="compact" width="wide">
        <SectionHeading
          description="Native controls retain browser semantics, visible focus, disabled behavior, and explicit error associations."
          eyebrow="04 · Forms"
          title="Controls designed for long workflows and compact settings."
        />
        <div className={styles.formGrid}>
          <Card className={styles.formCard} padding="large">
            <Field>
              <FieldLabel htmlFor="foundation-agent-name" requiredIndicator>Agent name</FieldLabel>
              <Input
                aria-describedby="foundation-agent-name-description"
                id="foundation-agent-name"
                defaultValue="Production Deployment Agent"
                required
              />
              <FieldDescription id="foundation-agent-name-description">Shown in approvals and audit records.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="foundation-environment">Environment</FieldLabel>
              <Select defaultValue="production" id="foundation-environment">
                <option value="development">Development</option>
                <option value="staging">Staging</option>
                <option value="production">Production</option>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="foundation-notes">Policy notes</FieldLabel>
              <Textarea id="foundation-notes" placeholder="Document the purpose of this control…" rows={4} />
            </Field>
            <Field invalid>
              <FieldLabel htmlFor="foundation-agent-id">Agent identifier</FieldLabel>
              <Input
                aria-describedby="foundation-agent-id-error"
                defaultValue="deploy agent"
                id="foundation-agent-id"
                invalid
              />
              <FieldError id="foundation-agent-id-error">Use lowercase letters, numbers, hyphens, or underscores.</FieldError>
            </Field>
          </Card>

          <Card className={styles.choiceCard} padding="large" variant="inset">
            <div className={styles.choiceGroup}>
              <p className="ui-type-card-title">Verification behavior</p>
              <Checkbox defaultChecked description="Record every decision and policy match." label="Audit all actions" />
              <Checkbox description="Notify an approver when a gated action pauses." label="Approval notifications" />
              <Switch defaultChecked description="Deny when the authorization service cannot be reached." label="Fail closed" />
            </div>
            <fieldset className={styles.radioGroup}>
              <legend className="ui-type-card-title">Default risk posture</legend>
              <Radio defaultChecked label="Conservative" name="risk-posture" value="conservative" />
              <Radio label="Balanced" name="risk-posture" value="balanced" />
              <Radio disabled label="Permissive (unavailable)" name="risk-posture" value="permissive" />
            </fieldset>
          </Card>
        </div>
      </PageSection>

      <PageSection className={styles.section} id="containers" spacing="compact" width="wide">
        <SectionHeading
          description="Surface changes indicate hierarchy or context; borders and elevation remain restrained."
          eyebrow="05 · Containers"
          title="Cards and panels with intentional depth."
        />
        <div className={styles.containerGrid}>
          <Card padding="medium">
            <h3 className="ui-type-card-title">Card</h3>
            <p className="ui-type-compact">Default elevated surface with a standard border.</p>
          </Card>
          <Card padding="medium" variant="elevated">
            <h3 className="ui-type-card-title">Elevated card</h3>
            <p className="ui-type-compact">Reserved for important decisions and overlay-adjacent content.</p>
          </Card>
          <InsetPanel>
            <h3 className="ui-type-card-title">Inset panel</h3>
            <p className="ui-type-compact">Groups filters, metadata, or secondary configuration.</p>
          </InsetPanel>
          <DarkPanel>
            <h3 className="ui-type-card-title">Dark panel</h3>
            <p className="ui-type-compact">A component-specific contrast surface, not a new theme.</p>
          </DarkPanel>
        </div>
      </PageSection>

      <PageSection className={styles.section} id="status" spacing="compact" width="wide">
        <SectionHeading
          description="Text and symbols accompany every signal so status is never conveyed by color alone."
          eyebrow="06 · Status"
          title="Decision, risk, lifecycle, integration, and plan states."
        />
        <Card className={styles.statusGrid} padding="large">
          <div><span className={styles.specimenLabel}>Decision</span><DecisionBadge decision="allowed" /><DecisionBadge decision="approval" /><DecisionBadge decision="denied" /></div>
          <div><span className={styles.specimenLabel}>Risk</span><RiskIndicator risk="low" /><RiskIndicator risk="medium" /><RiskIndicator risk="high" /></div>
          <div><span className={styles.specimenLabel}>Agent</span><AgentStatus status="active" /><AgentStatus status="paused" /><AgentStatus status="disabled" /></div>
          <div><span className={styles.specimenLabel}>Integration</span><IntegrationStatus status="connected" /><IntegrationStatus status="pending" /><IntegrationStatus status="disconnected" /></div>
          <div><span className={styles.specimenLabel}>Plan</span><PlanBadge plan="free" /><PlanBadge plan="pro" /><PlanBadge plan="enterprise" /></div>
        </Card>
      </PageSection>

      <PageSection className={styles.section} id="data" spacing="compact" width="wide">
        <SectionHeading
          description="Compact variants preserve scanning speed without collapsing focus targets or status context."
          eyebrow="07 · Data display"
          title="Filters, tables, rows, metadata, tabs, and pagination."
        />
        <div className={styles.dataStack}>
          <FilterBar aria-label="Decision filters">
            <Field>
              <FieldLabel htmlFor="foundation-filter-agent">Agent</FieldLabel>
              <Input id="foundation-filter-agent" placeholder="Filter by agent" />
            </Field>
            <Field>
              <FieldLabel htmlFor="foundation-filter-decision">Decision</FieldLabel>
              <Select defaultValue="all" id="foundation-filter-decision">
                <option value="all">All decisions</option>
                <option value="allowed">Allowed</option>
                <option value="approval">Approval required</option>
                <option value="denied">Denied</option>
              </Select>
            </Field>
            <Button type="button" variant="primary">Apply filters</Button>
          </FilterBar>

          <TableContainer>
            <Table density="compact">
              <TableCaption>Typed static verification examples</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Decision</TableHead>
                  <TableHead>Request</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {DECISIONS.map((item) => (
                  <TableRow key={item.request}>
                    <TableCell>{item.agent}</TableCell>
                    <TableCell><code>{item.action}</code></TableCell>
                    <TableCell>{item.resource}</TableCell>
                    <TableCell><DecisionBadge decision={item.decision} /></TableCell>
                    <TableCell><code>{item.request}</code></TableCell>
                    <TableCell numeric>{item.time}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Pagination page={2} totalPages={8} />

          <div className={styles.dataGrid}>
            <List>
              <ListRow
                action={<AgentStatus status="active" />}
                description="12 active permissions · last verified 4 minutes ago"
                title="deploy-agent-prod"
              />
              <ListRow
                action={<IntegrationStatus status="pending" />}
                description="Awaiting a successful verification handshake"
                title="finance-ops-agent"
              />
              <ListRow
                action={<AgentStatus status="disabled" />}
                description="Disabled by Engineering Lead · 2026-07-14"
                title="legacy-release-agent"
              />
            </List>
            <Card padding="medium">
              <h3 className="ui-type-card-title">Decision metadata</h3>
              <MetadataList>
                <MetadataRow label="Request" value={<code>req_7mK4p9</code>} />
                <MetadataRow label="Policy" value="production-change-control" />
                <MetadataRow label="Authority" value="Engineering Lead" />
                <MetadataRow label="Evaluation" value="41ms · signed" />
              </MetadataList>
            </Card>
          </div>
        </div>
        <InteractivePreview />
      </PageSection>

      <PageSection className={styles.section} id="feedback" spacing="compact" width="wide">
        <SectionHeading
          description="Loading, empty, and error treatments remain composed without inventing application data."
          eyebrow="08 · Feedback"
          title="Clear states for every point in the workflow."
        />
        <div className={styles.feedbackGrid}>
          <EmptyState
            action={<Button type="button" variant="primary">Add first integration</Button>}
            description="Connect a tool boundary to start verifying agent actions."
            icon={<EmptyIcon />}
            title="No integrations yet"
          />
          <Card className={styles.loadingCard} padding="medium">
            <LoadingState label="Loading verification history" />
            <div className={styles.skeletonStack} aria-hidden="true">
              <Skeleton className={styles.skeletonWide} />
              <Skeleton className={styles.skeletonMedium} />
              <Skeleton className={styles.skeletonShort} />
            </div>
          </Card>
          <div className={styles.alertStack}>
            <Alert title="Policy published" tone="success">The change applies to 12 agents.</Alert>
            <Alert title="Approval window closes soon" tone="warning">This request expires in 8 minutes.</Alert>
            <Alert title="Connection failed" tone="destructive">We could not load the latest decisions. Try again.</Alert>
          </div>
        </div>
      </PageSection>

      <footer className={styles.footer}>
        <span>BehalfID design-system foundation · static preview</span>
        <span>Not included in production navigation</span>
      </footer>
    </main>
  );
}
