/**
 * Comparison and category landing pages.
 *
 * These exist because /vs is the highest-leverage SaaS SEO surface and the site
 * had none, and because the buy-vs-build objection has to be answered somewhere
 * honest.
 *
 * Rules for anything added here:
 *
 *   1. Competitor claims come from that vendor's published material, are dated
 *      via `reviewed`, and link to the source page where a specific figure or
 *      capability is asserted. Competitor pricing and capabilities change; a
 *      stale comparison page is a credibility liability on a security product.
 *   2. Never claim a competitor does something badly, and never manufacture a
 *      difference. Where both products do the same thing, the row says so.
 *   3. Never overstate BehalfID. Claims here must be backed by
 *      docs/CAPABILITY_MATRIX.md — in particular, do not present source-only
 *      packages (@behalfid/mcp-runtime, @behalfid/install, @behalfid/mcp-audit)
 *      as shipped capabilities. It is not universally fail-closed, it has no
 *      SOC 2, and it is early. All of that is said out loud on these pages.
 */

export type ComparisonRow = {
  dimension: string;
  behalfid: string;
  other: string;
  /** True where both products do substantially the same thing. */
  parity?: boolean;
};

/** A dated, linkable source for competitor claims. */
export type SourceLink = {
  label: string;
  url: string;
};

export type Faq = { q: string; a: string };

export type ComparisonPageData = {
  slug: string;
  kind: "versus" | "category";
  /** ISO date the competitor claims below were last checked. */
  reviewed: string;
  reviewedLabel: string;
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  heading: string;
  lede: string;
  /** The one-sentence answer, above everything else. */
  shortAnswer: string;
  competitorName?: string;
  columns?: [string, string];
  rows?: ComparisonRow[];
  sections: { heading: string; body: string[] }[];
  honesty: string[];
  faqs: Faq[];
  /** Source pages behind the competitor claims on this page. */
  sources?: SourceLink[];
};

const REVIEWED = "2026-08-11";
const REVIEWED_LABEL = "11 August 2026";

export const comparisons: ComparisonPageData[] = [
  {
    slug: "behalfid-vs-policylayer",
    kind: "versus",
    reviewed: REVIEWED,
    reviewedLabel: REVIEWED_LABEL,
    competitorName: "PolicyLayer",
    metaTitle: "BehalfID vs PolicyLayer — where agent authorization gets enforced",
    metaDescription:
      "Both enforce allow, deny and approval-required decisions before an agent's action runs. The difference is the integration boundary: PolicyLayer is a hosted MCP gateway, BehalfID checks in your executor, coding-agent hooks and a gateway. Reviewed August 2026.",
    eyebrow: "Comparison",
    heading: "BehalfID vs PolicyLayer",
    lede: "Both products stop an agent action before it reaches the real world, and both have allow, deny and approval-required as first-class outcomes. What differs is where the checkpoint sits and how much of your agent surface it can see.",
    shortAnswer:
      "Pick PolicyLayer if your agents act through MCP and you want a hosted gateway governing tool calls, plus a shared authority system across a team of coding agents. Pick BehalfID if the actions you need to gate run inside your own code, behind coding-agent hooks, or outside MCP entirely. There is real overlap — the deciding question is which of your agents' actions pass through each product's checkpoint.",
    columns: ["BehalfID", "PolicyLayer"],
    rows: [
      {
        dimension: "Decision before execution",
        behalfid:
          "Allow, deny, or approval required, evaluated before the integrated action runs. Deny-by-default: no permission means no action.",
        other:
          "Allow, deny, or require approval, evaluated deterministically before an MCP tool call reaches the real world. Deny-by-default policies.",
        parity: true
      },
      {
        dimension: "Human approval gates",
        behalfid:
          "An action can park and wait for a named person, who approves in the dashboard. The resulting grant covers one request and expires on its own.",
        other: "Human approval gates on tool calls, with approvals and questions shared across a team's coding agents.",
        parity: true
      },
      {
        dimension: "Audit trail",
        behalfid:
          "Every authenticated decision is logged with a request ID, outcome, reason, risk level and the policy path that produced it.",
        other: "Audit logging of policy decisions on tool calls.",
        parity: true
      },
      {
        dimension: "Where it integrates",
        behalfid:
          "Several boundaries: behalf.verify() in your own executor, action-time hooks the CLI installs for supported coding agents, the Action Gateway for supported actions, and Site Guard for website routes. Covers actions that never take the shape of an MCP tool call.",
        other:
          "A hosted gateway between MCP clients and MCP servers. Everything the agent does through MCP passes the checkpoint without changing application code."
      },
      {
        dimension: "MCP coverage",
        behalfid:
          "The shipped MCP server is advisory — it reports permissions to the agent and does not intercept other tools. An MCP interceptor package exists in our repository but is not published and not production-supported, so treat MCP as our weaker surface today.",
        other: "The core of the product: a hosted MCP gateway with an MCP server and tool registry, enforcing on tool calls."
      },
      {
        dimension: "Conditions on arguments",
        behalfid:
          "Permissions carry constraints — maximum amount and allowed vendors — plus allowed and blocked action lists, resource matching and expiry. No rate or spend-over-time limits.",
        other: "Argument conditions on tool calls, plus rate and spend limits."
      },
      {
        dimension: "Team authority model",
        behalfid:
          "Workspaces, memberships and roles, with managed profiles that put coding-agent CLIs behind a workspace policy checkpoint in unmanaged, managed or required mode.",
        other:
          "Positioned as a system of record for AI agent authority, with signed team playbooks and approvals shared across a team's coding agents."
      },
      {
        dimension: "Maturity",
        behalfid:
          "Early. CLI and SDK are on npm; hooks and managed profiles are pilot. No SOC 2, no external security audit, no named public customers.",
        other: "Check their current material for maturity, compliance posture and customer references — we do not characterise those here."
      },
      {
        dimension: "Pricing",
        behalfid: "Free tier, then $20/month self-serve. Enterprise by contact.",
        other: "See their pricing page for current figures."
      }
    ],
    sections: [
      {
        heading: "The overlap is real, so start with coverage",
        body: [
          "It would be convenient for us to claim that BehalfID intercepts and PolicyLayer only advises. That is not true. PolicyLayer's published material describes deterministic policy evaluation before MCP tool calls reach the real world, with allow, deny and require-approval outcomes, deny-by-default policies, argument conditions and audit logging. On the questions most buyers ask first — does it stop the action, can a human approve, is there a record — both products answer yes.",
          "So the useful question is not whose enforcement is more real. It is which of your agents' actions actually reach each product's checkpoint. Write down the five actions that would ruin a week and trace how each one happens.",
          "If they happen as MCP tool calls, a gateway covers all of them with no application changes, and that is the stronger position. If they happen inside your own service — a deploy function, a migration runner, a refund call behind a library — the action is not an MCP tool call, so covering it means putting a check in that code path. Many teams have both kinds, and the scope each product covers is worth confirming with the vendor rather than inferring."
        ]
      },
      {
        heading: "Where each one is stronger",
        body: [
          "PolicyLayer is stronger on MCP. It is a hosted gateway for MCP traffic with a server and tool registry, argument conditions, rate and spend limits, and a shared team authority model built around playbooks. If your agents are MCP-native, that is a shorter path to coverage than integrating a check in several places yourself.",
          "BehalfID is stronger on breadth of integration boundary. The same decision engine answers a behalf.verify() call inside your own executor, an action-time hook the CLI installs for a supported coding agent, an Action Gateway request, and a Site Guard check on a website route. Agents get explicit identities with scoped permissions, and approvals are single-use and expiring.",
          "BehalfID is weaker on MCP specifically, and we would rather say so here than have you discover it in a trial. Our shipped MCP server is advisory: it tells an agent what it is allowed to do and does not intercept other tools. An MCP interceptor does exist in our repository, but it is not published to npm and not production-supported, so it should not weigh in a buying decision today."
        ]
      },
      {
        heading: "Running both",
        body: [
          "These are not mutually exclusive, and for a team with MCP-native agents plus production code paths of its own, running both is a reasonable answer.",
          "The thing to avoid is assuming one checkpoint covers everything. Whichever you choose, attempt a high-consequence action by a route that bypasses the checkpoint and confirm what happens. Every product in this category has such a route."
        ]
      }
    ],
    honesty: [
      "PolicyLayer enforces before execution. Any framing that casts it as advisory-only, or as unable to hold an action for a human, would be wrong — both products do those things.",
      "PolicyLayer covers MCP tool calls more completely than we do. Our shipped MCP integration is advisory, and our MCP interceptor is unpublished and not production-supported.",
      "BehalfID is early. CLI and SDK are published; coding-agent hooks and managed profiles are pilot, not production-supported. No SOC 2 or ISO 27001, no formal external security audit, and no named public customers.",
      "BehalfID is not universally fail-closed. Outage behaviour differs per integration and is documented per path.",
      "We do not characterise PolicyLayer's maturity, compliance posture or customer base. We have no basis for it and it is not ours to summarise."
    ],
    sources: [
      { label: "PolicyLayer", url: "https://www.policylayer.com" },
      { label: "BehalfID capability matrix", url: "https://github.com/behalfid/behalf/blob/main/docs/CAPABILITY_MATRIX.md" }
    ],
    faqs: [
      {
        q: "What is the actual difference between BehalfID and PolicyLayer?",
        a: "The integration boundary, not the strength of enforcement. Both evaluate allow, deny or approval-required before an action executes, and both support human approval gates and audit logging. PolicyLayer is a hosted gateway between MCP clients and MCP servers, so it covers what the agent does through MCP without application changes. BehalfID checks at several boundaries — behalf.verify() inside your own executor, action-time hooks for supported coding agents, the Action Gateway, and Site Guard — so it covers actions that never take the shape of an MCP tool call."
      },
      {
        q: "Does PolicyLayer only advise, while BehalfID enforces?",
        a: "No, and we will not claim that. PolicyLayer's published material describes deterministic policy evaluation with allow, deny and require-approval outcomes before MCP tool calls reach the real world, along with deny-by-default policies. Both products enforce. Where BehalfID has an advisory-only surface is our own MCP server, which reports permissions to an agent without intercepting other tools."
      },
      {
        q: "Can BehalfID enforce on MCP tool calls?",
        a: "Not in a shipped, supported form today. The MCP server distributed with our CLI is advisory. An MCP interceptor package exists in our repository but is not published to npm and is not production-supported, so you should not count on it when comparing. If MCP is where your agents act, PolicyLayer covers that boundary and we currently do not."
      },
      {
        q: "What does an MCP gateway cover, and what sits outside it?",
        a: "A gateway evaluates the calls that pass through it, so an MCP gateway covers the agent's MCP tool calls — all of them, without application changes. Actions that run inside your own service, such as a deploy function, a migration runner or a payment call behind a library, are not MCP tool calls, so covering those means putting a check in that code path. That is the main reason a team might run both. Map your highest-consequence actions to the boundary each one crosses, and confirm coverage with each vendor rather than assuming it."
      },
      {
        q: "Do I have to choose one?",
        a: "No. If your agents are MCP-native and you also have production code paths of your own, the two cover different parts of the surface. Map your highest-consequence actions to the checkpoint each one crosses before deciding."
      }
    ]
  },
  {
    slug: "behalfid-vs-cerbos",
    kind: "versus",
    reviewed: REVIEWED,
    reviewedLabel: REVIEWED_LABEL,
    competitorName: "Cerbos",
    metaTitle: "BehalfID vs Cerbos — agent action approvals vs application authorization",
    metaDescription:
      "Cerbos is a mature policy decision point for application authorization. BehalfID is an approval gate for AI agent actions, self-serve at $20/month. What each is actually for, reviewed August 2026.",
    eyebrow: "Comparison",
    heading: "BehalfID vs Cerbos",
    lede: "Cerbos answers 'may this principal perform this operation on this resource?'. BehalfID answers 'should this agent's action run right now, or should a person look at it first?'. Related questions, different products.",
    shortAnswer:
      "Pick Cerbos if you need a mature, policy-as-code decision point for application authorization across your services. Pick BehalfID if the thing you need is a human approval gate in front of what your coding agents do, cheap enough to try this afternoon.",
    columns: ["BehalfID", "Cerbos"],
    rows: [
      {
        dimension: "The question it answers",
        behalfid:
          "Should this agent's action run now? Returns allow, deny, or approval required, before the integrated action executes.",
        other: "Is this principal permitted to perform this action on this resource? Returns a permit or deny decision."
      },
      {
        dimension: "Human approval",
        behalfid:
          "First-class approval requests: an action can park, wait for a named person to approve or deny in the dashboard, and resume with a single-use grant that expires.",
        other:
          "Primarily a policy decision point — applications or gateways query it for an authorization decision and enforce the result. Check their current documentation for how human approval fits your design."
      },
      {
        dimension: "Policy authoring",
        behalfid: "Permissions and managed profiles configured in the dashboard, with the same engine on every tier.",
        other: "Policy-as-code — YAML policies, version-controlled, tested in CI. More expressive and more to run."
      },
      {
        dimension: "Built for",
        behalfid: "Coding agents — Claude Code, Codex, Cursor — and the deploys, migrations and refunds they trigger.",
        other: "Application authorization for users and services, at scale, across a service estate."
      },
      {
        dimension: "Maturity",
        behalfid: "Early. Core enforcement loop works end to end; no SOC 2, no external security audit yet.",
        other: "Established open-source project with a managed hosted offering and production deployments."
      },
      {
        dimension: "Getting to production",
        behalfid: "$20/month, self-serve, no sales call. Free tier to evaluate against real agent traffic first.",
        other:
          "Open source and self-hostable at no licence cost — you run and operate it. Cerbos Hub Production starts at $933/month for the first 5,000 monthly active principals, per Cerbos's published pricing as reviewed 11 August 2026. That is a starting price, not a flat rate; check their pricing page for current figures."
      }
    ],
    sections: [
      {
        heading: "This is not really a head-to-head",
        body: [
          "Cerbos is a good policy decision point and has been doing that job longer than BehalfID has existed. If you need fine-grained, testable, version-controlled authorization for users and services, that is what it is built for and a comparison page will not talk you out of it.",
          "The case where the two get compared is narrower: a team has coding agents doing real work, wants production deploys to stop and wait for a person, and starts looking at authorization tooling. A policy decision point answers whether an action is permitted, and the calling application enforces that answer. BehalfID adds the loop around the decision — an approval request that holds the action, a notification to a named reviewer, a record of who decided, and a resulting grant that covers one request and expires.",
          "If you already run Cerbos, you do not need to remove it. It is worth checking whether anything in your current setup pauses an agent mid-action for a person, and building or buying only that piece."
        ]
      },
      {
        heading: "Buy versus build",
        body: [
          "The approval loop is the part teams underestimate when they decide to build it. The decision is the easy half. The rest is the approval record, single-use expiring grants, the notification path, the dashboard a non-author can act in, replay-safe webhooks, and per-integration outage semantics that you can actually explain in a security review.",
          "That is a few weeks of work to get to a demo and considerably longer to get to something you would rely on. At $20/month the question is mostly whether the enforcement points BehalfID offers line up with where your agents act.",
          "If they do not, build it. The honest answer to buy-versus-build for a product this early is that it depends on how much of your risk sits behind integration points we already cover."
        ]
      }
    ],
    honesty: [
      "Cerbos is more mature than BehalfID by a wide margin, is open source, and can be self-hosted at no licence cost.",
      "The $933/month figure is a starting price for the Cerbos Hub Production tier, not what every Cerbos customer pays, and self-hosted Cerbos has no licence cost at all. Pricing changes — verify it on their pricing page.",
      "BehalfID has no SOC 2 or ISO 27001 certification, no formal external security audit yet, and no named public customers."
    ],
    sources: [
      { label: "Cerbos pricing", url: "https://www.cerbos.dev/pricing" },
      { label: "BehalfID capability matrix", url: "https://github.com/behalfid/behalf/blob/main/docs/CAPABILITY_MATRIX.md" }
    ],
    faqs: [
      {
        q: "Is BehalfID an alternative to Cerbos?",
        a: "Only for one specific job. Cerbos is a policy decision point for application authorization — may this principal do this to this resource. BehalfID is an approval gate for AI agent actions, including the human-in-the-loop path where an action pauses and waits for a named person. Teams run both."
      },
      {
        q: "Cerbos is open source. Why pay $20 a month?",
        a: "You are not paying for the policy decision — you are paying for the approval loop around it: the approval record, single-use expiring grants, the dashboard a reviewer can act in, replay-safe webhooks, and documented per-integration outage behaviour. If you only need a decision point, Cerbos self-hosted costs nothing in licence fees and is the better fit."
      },
      {
        q: "How much does Cerbos cost in production?",
        a: "Two answers. Self-hosted Cerbos is open source with no licence cost — the cost is running and operating it yourself. For the managed service, Cerbos Hub Production starts at $933/month including the first 5,000 monthly active principals, per Cerbos's published pricing as reviewed 11 August 2026. That is a starting price rather than a flat rate, and pricing changes, so confirm current figures on their pricing page."
      },
      {
        q: "How does human approval work in each?",
        a: "Cerbos is primarily a policy decision point: applications or gateways query it for an authorization decision and enforce the result, so how a human fits into that flow is a question for their current documentation and your design. BehalfID ships the approval loop itself — an approval request holds the action, a named reviewer approves or denies it in the dashboard, the decision is recorded, and the resulting grant covers one request and expires on its own."
      }
    ]
  },
  {
    slug: "best-ai-agent-authorization",
    kind: "category",
    reviewed: REVIEWED,
    reviewedLabel: REVIEWED_LABEL,
    metaTitle: "AI agent authorization — how to choose a tool in 2026",
    metaDescription:
      "AI agent authorization tools fall into four shapes: gateway enforcement, in-executor checks, policy decision points, and sandboxing. What each covers, what it misses, and how to pick. Reviewed August 2026.",
    eyebrow: "Category guide",
    heading: "AI agent authorization: how to choose",
    lede: "Every tool in this category puts a decision between an agent and an action. They differ in where that decision sits — which determines what they can and cannot stop.",
    shortAnswer:
      "Start by listing the actions that would actually hurt: production deploys, migrations, secret rotation, payments, outbound email. Then ask, for each candidate tool, whether that specific action passes through its checkpoint. Everything else is detail.",
    sections: [
      {
        heading: "The four shapes",
        body: [
          "Gateway enforcement. A gateway sits between the agent's client and the tools or servers it calls, and evaluates each call before it reaches the real world. Covers everything that passes through the gateway with no application code changes; misses actions that never traverse it. MCP gateways such as PolicyLayer are this shape.",
          "In-executor checks. The check sits in the code path or tool invocation that performs the action — an SDK call before the executor, or an action-time hook in a coding agent. Covers effects that never take the shape of agent traffic; misses anything that skips the integration point. BehalfID is primarily this shape, and also offers a gateway for a supported action set.",
          "Both of the above enforce before execution and can hold an action for human approval. The difference between them is coverage, not whether the decision is real — do not let a comparison page tell you otherwise.",
          "Policy decision points. A service answers 'may this principal do this to this resource' from version-controlled policy, and the caller enforces the answer. Expressive, testable, mature. Whether a human review step is part of your flow depends on how the calling application is built. Cerbos and OPA are this shape.",
          "Sandboxing and capability restriction. Constrain what the agent's environment can reach at all — filesystem, network, credentials. Strong and coarse. Good at 'never', weak at 'sometimes, if a person says yes'."
        ]
      },
      {
        heading: "The question that actually decides it",
        body: [
          "Take the five actions on your list that would ruin a week. For each one, trace how the agent performs it. Does it go out as an MCP tool call a gateway would see? Does it run through a library call inside your own service? Does it happen through a coding-agent tool call on a developer's machine?",
          "Those three answers point at different tool shapes, and most teams have all three. A gateway that covers the first will not see the second. This is the coverage question, and it matters far more than feature tables.",
          "Then ask the second question: when the answer is 'a person should look at this', what happens? Some tools have no state for that. If human approval is part of your control, check that the action actually pauses rather than being denied and retried."
        ]
      },
      {
        heading: "What to test in an evaluation",
        body: [
          "Make the agent attempt a production deploy and confirm it stops, not that it logs. Then check the record: who approved, under which policy, and does the grant expire.",
          "Pull the network and see what the tool does. Fail open and fail closed are both defensible answers, but you need to know which one you have on each integration path, and the vendor should be able to tell you without hedging.",
          "Attempt the same action by a route that bypasses the checkpoint. Every tool in this category has such a route. The one worth buying is the one whose vendor tells you where it is."
        ]
      }
    ],
    honesty: [
      "BehalfID is primarily the in-executor shape. It does not cover actions that bypass its integration points, and its shipped MCP integration is advisory rather than enforcing — a hosted MCP gateway covers that boundary better than we do today.",
      "BehalfID is early: no SOC 2, no ISO 27001, no formal external security audit yet, and no named public customers. The full limitations list is published on the security page.",
      "This guide describes categories rather than ranking vendors. Gateway enforcement and in-executor checks both stop actions before they run; we are not claiming our shape is the only real enforcement."
    ],
    faqs: [
      {
        q: "What is AI agent authorization?",
        a: "Deciding, per action, whether an AI agent may do the thing it is about to do — and returning allow, deny, or approval required before the action takes effect rather than logging it afterwards. It is distinct from giving the agent an API key, which grants standing authority with no per-action decision."
      },
      {
        q: "Why are API keys and OAuth not enough for agents?",
        a: "They were designed for a human developer making deliberate calls who reads errors and is accountable. An agent acting autonomously across dozens of services holds the same standing authority for every action, including ones nobody intended. The missing piece is a per-action checkpoint, not a broader scope."
      },
      {
        q: "What should an AI agent authorization tool actually stop?",
        a: "The actions with consequences you cannot undo cheaply: production deploys, database migrations, secret rotation, payments and refunds, outbound communication, and data deletion. Everything else is usually safe to allow without friction, and a tool that gates everything gets switched off."
      },
      {
        q: "How do I know a tool actually enforces rather than advises?",
        a: "Ask where the check sits in the execution path, then test the bypass. Advisory integrations — passport links, memory blocks, and MCP servers that only report permissions to the model — describe what an agent may do and cannot stop it doing otherwise. Enforcement means a denied decision leaves the executor unrun. Note that MCP is not inherently advisory: an MCP gateway that sits between the client and the servers evaluates calls before they reach the real world, while an MCP server that merely answers questions about policy does not."
      },
      {
        q: "Gateway or in-executor check — which should I use?",
        a: "Whichever one your risky actions actually pass through, and often both. A gateway covers everything the agent sends through it with no application changes, which is the shorter path when your agents are MCP-native. An in-executor check covers effects that never take the shape of agent traffic — a deploy function or a payment call inside your own service — which a gateway cannot see. Both enforce before execution; neither covers what bypasses it."
      },
      {
        q: "Can one tool cover every agent action?",
        a: "No. Every tool in this category has a checkpoint, and anything that does not pass through it is not covered. Coverage is the thing to map during evaluation; a vendor who cannot name their own gap has not thought about it."
      }
    ]
  }
];

export function getComparison(slug: string): ComparisonPageData | undefined {
  return comparisons.find((entry) => entry.slug === slug);
}

/** Route-module lookup: a missing slug is a build-time bug, not a 404. */
export function requireComparison(slug: string): ComparisonPageData {
  const entry = getComparison(slug);
  if (!entry) throw new Error(`Missing comparison data for "${slug}"`);
  return entry;
}
