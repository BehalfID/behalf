/**
 * Comparison and category landing pages.
 *
 * These exist because /vs is the highest-leverage SaaS SEO surface and the site
 * had none, and because the buy-vs-build and routing-vs-interception objections
 * have to be answered somewhere honest.
 *
 * Rules for anything added here:
 *
 *   1. Every claim about a competitor is stated as "as published at the time of
 *      writing" and carries `reviewed` below. Competitor pricing and
 *      architecture change; a stale comparison page is a credibility liability
 *      on a security product.
 *   2. Never claim a competitor does something badly. State what each tool is
 *      built to do and let the reader place themselves.
 *   3. Never overstate BehalfID. It is not universally fail-closed, it has no
 *      SOC 2, and it is early. All three are said out loud on these pages.
 */

export type ComparisonRow = {
  dimension: string;
  behalfid: string;
  other: string;
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
    metaTitle: "BehalfID vs PolicyLayer — interception vs routing for AI agent actions",
    metaDescription:
      "Where the check sits in the execution path is the difference. BehalfID evaluates before the integrated action runs; PolicyLayer routes agent traffic through a policy layer. An honest comparison, reviewed August 2026.",
    eyebrow: "Comparison",
    heading: "BehalfID vs PolicyLayer",
    lede: "Both put a policy decision between an AI agent and the thing it is about to do. They put it in different places, and that placement is the whole decision.",
    shortAnswer:
      "Pick BehalfID if you want the check inside your own execution path, so a deny stops the executor itself. Pick a routing layer if you want agent traffic governed centrally without touching the code that performs the action.",
    columns: ["BehalfID", "PolicyLayer"],
    rows: [
      {
        dimension: "Where the check sits",
        behalfid:
          "Pre-execution, at the integration point: behalf.verify() in your code, action-time CLI hooks, or the Action Gateway. A deny means the executor never runs.",
        other:
          "In the request path: agent traffic is routed through a policy layer that evaluates and forwards or blocks it."
      },
      {
        dimension: "What happens to an action that skips it",
        behalfid:
          "Not covered, and we say so. If the agent calls an API directly without going through the SDK, hook, or gateway, BehalfID never sees it.",
        other: "Not covered either — traffic that does not traverse the routing layer is not evaluated."
      },
      {
        dimension: "Human in the loop",
        behalfid:
          "Approval required is a first-class decision. The action pauses, a named person approves in the dashboard, and the grant is single-use and expiring.",
        other: "Depends on the deployment; routing layers typically allow or block rather than park an action for a person."
      },
      {
        dimension: "Outage behaviour",
        behalfid:
          "Path-specific and documented per integration. SDK adapters and Site Guard fail closed on verify errors; the Claude Code PreToolUse hook fails open on missing config and network timeouts.",
        other: "A routing layer sits in the traffic path, so its availability is your action path's availability."
      },
      {
        dimension: "Integration cost",
        behalfid: "One call before the action, or a CLI-installed hook. No proxy, no sidecar, no migration.",
        other: "Repoint agent traffic at the layer; no change to the code that performs the action."
      },
      {
        dimension: "Pricing",
        behalfid: "Free tier, then $20/month self-serve. Enterprise by contact.",
        other: "Check their current pricing page — we do not restate competitor prices we cannot verify today."
      }
    ],
    sections: [
      {
        heading: "Interception and routing solve different failure modes",
        body: [
          "A routing layer is the right shape when you want one place to see and govern everything an agent sends, and when you would rather not change application code. It governs the traffic it carries.",
          "Pre-execution interception is the right shape when the risky thing is not a request but an effect: a production deploy, a database migration, a secret rotation, a refund. Those actions often run inside your own code, behind a library call that never looks like agent traffic. BehalfID's check goes in that code path, so the decision lands on the effect rather than on the packet.",
          "Neither placement covers what does not pass through it. That is the honest limit on both sides, and the question worth asking about either tool is: which of my agents' actions actually go through this?"
        ]
      },
      {
        heading: "When approval required is the point",
        body: [
          "Allow and deny are easy. The case that matters for coding agents is the third one: the action is legitimate, but a person should look at it first.",
          "BehalfID treats approval required as a real decision state. The agent is told to stop and given an approval ID, a named human approves in the dashboard, and the resulting grant covers one request and expires on its own. The decision, the approver and the policy path are all recorded.",
          "If your evaluation includes 'can a human be in the loop without the agent silently proceeding', test that path in both tools specifically."
        ]
      }
    ],
    honesty: [
      "BehalfID is early. There is no completed SOC 2 or ISO 27001 audit and no formal external security review yet.",
      "BehalfID is not universally fail-closed. Outage behaviour differs per integration and is documented per path.",
      "PolicyLayer is described here as a routing-style policy layer, which is how the category positions itself. We have not re-verified their current architecture, features or pricing for this page — read their own documentation before deciding, and tell us if anything here is wrong.",
      "BehalfID has no named public customers yet. Nothing on this page should be read as evidence of adoption."
    ],
    faqs: [
      {
        q: "What is the actual difference between BehalfID and PolicyLayer?",
        a: "Where the policy decision sits. BehalfID evaluates before the integrated action executes — in your own code path via the SDK, in action-time CLI hooks, or in the Action Gateway — so a denied or approval-required decision means the executor does not run. PolicyLayer routes agent traffic through a policy layer that evaluates and forwards or blocks it. Interception acts on the effect; routing acts on the traffic."
      },
      {
        q: "Can BehalfID stop an action that does not go through the SDK?",
        a: "No. BehalfID enforces where you integrate it. If an agent calls an API directly without going through the SDK, an action-time hook, or the Action Gateway, that call is not covered. This is a real limit and it is documented on the security page rather than buried."
      },
      {
        q: "Is BehalfID fail-closed?",
        a: "At the integration point, yes: denied and approval-required decisions must not execute. Outage behaviour is path-specific. SDK adapters and Site Guard fail closed on verify errors; the Claude Code PreToolUse hook fails open on missing config and network or timeout errors, and fails closed on deny, approval-required, malformed targets and oversized policy input."
      },
      {
        q: "Do I have to choose one?",
        a: "No. A routing layer governing agent traffic and a pre-execution check on high-consequence actions cover different gaps. If you already run a routing layer, the question is which of your production-affecting actions never traverse it."
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
          "Built in. An action can park, wait for a named person, and resume with a single-use grant that expires.",
        other: "Not the model. A policy decision point evaluates and answers; parking an action for a human is your application's job."
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
          "Open source and self-hostable at no licence cost — you run and operate it. The managed Cerbos Hub tiers are priced separately; see their pricing page for current figures."
      }
    ],
    sections: [
      {
        heading: "This is not really a head-to-head",
        body: [
          "Cerbos is a good policy decision point and has been doing that job longer than BehalfID has existed. If you need fine-grained, testable, version-controlled authorization for users and services, that is what it is built for and a comparison page will not talk you out of it.",
          "The case where the two get compared is narrower: a team has coding agents doing real work, wants production deploys to stop and wait for a person, and starts looking at authorization tooling. A policy decision point will tell you whether the action is permitted. It will not hold the action open while a human decides, notify them, record who approved, and issue a grant that expires — that loop is what BehalfID is.",
          "If you already run Cerbos, you do not need to remove it. The gap to check is whether anything currently pauses an agent mid-action for a person."
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
      "We do not restate Cerbos pricing on this page. Managed-tier pricing changes, and a stale competitor price is worse than no price — read it from their pricing page.",
      "We have not re-verified Cerbos's current feature set for this page. Where this description is out of date, theirs is the authoritative source — tell us and we will correct it.",
      "BehalfID has no SOC 2 or ISO 27001 certification and no formal external security audit yet, and no named public customers."
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
        a: "Self-hosted Cerbos is open source with no licence cost — the cost is running and operating it. Managed Cerbos Hub tiers are priced separately and change over time, so read the current figures from their pricing page rather than from a comparison page written by a competitor."
      },
      {
        q: "Can Cerbos hold an action for human approval?",
        a: "Not as a built-in model. A policy decision point returns permit or deny; keeping an action parked, notifying an approver, recording who decided and issuing an expiring single-use grant is application work you would build. That loop is what BehalfID ships."
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
      "AI agent authorization tools fall into four shapes: pre-execution interception, request routing, policy decision points, and sandboxing. What each covers, what it misses, and how to pick. Reviewed August 2026.",
    eyebrow: "Category guide",
    heading: "AI agent authorization: how to choose",
    lede: "Every tool in this category puts a decision between an agent and an action. They differ in where that decision sits — which determines what they can and cannot stop.",
    shortAnswer:
      "Start by listing the actions that would actually hurt: production deploys, migrations, secret rotation, payments, outbound email. Then ask, for each candidate tool, whether that specific action passes through its checkpoint. Everything else is detail.",
    sections: [
      {
        heading: "The four shapes",
        body: [
          "Pre-execution interception. The check sits in the code path that performs the action, so a deny stops the executor itself. Covers effects rather than traffic. Misses anything that does not route through an integration point. BehalfID is this shape.",
          "Request routing. Agent traffic is routed through a policy layer that evaluates and forwards or blocks. One place to see everything the agent sends; no application code changes. Misses effects that never leave as agent-shaped traffic.",
          "Policy decision points. A service answers 'may this principal do this to this resource' from version-controlled policy. Expressive, testable, mature. Not an approval loop — parking an action for a human is your application's job. Cerbos and OPA are this shape.",
          "Sandboxing and capability restriction. Constrain what the agent's environment can reach at all — filesystem, network, credentials. Strong and coarse. Good at 'never', weak at 'sometimes, if a person says yes'."
        ]
      },
      {
        heading: "The question that actually decides it",
        body: [
          "Take the five actions on your list that would ruin a week. For each one, trace how the agent performs it. Does it go out as an HTTP request an agent proxy would see? Does it run through a library call inside your own service? Does it happen through a coding-agent tool call on a developer's machine?",
          "Those three answers point at three different tool shapes, and most teams have all three. A tool that covers the first will not see the second. This is the coverage question, and it matters far more than feature tables.",
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
      "BehalfID is one of the four shapes above and covers pre-execution interception at the integration point. It does not cover actions that bypass that point.",
      "BehalfID is early: no SOC 2, no ISO 27001, no formal external security audit yet, and no named public customers. The full limitations list is published on the security page.",
      "This guide describes categories rather than ranking vendors. Where specific products are named, the description reflects how they publicly position themselves and has not been re-verified for this page — check their documentation."
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
        a: "Ask where the check sits in the execution path, and then test the bypass. Advisory integrations — passport links, memory blocks, most MCP tooling — tell the model what it is allowed to do and cannot stop it from doing otherwise. Enforcement means a denied decision leaves the executor unrun."
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
