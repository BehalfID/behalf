"use client";
import { useEffect, useRef, useState } from "react";

// Each "scene" is one decision being rendered line by line
const SCENES = [
  {
    lines: [
      { delay: 0,    cls: "fd-line--label", text: "$ behalf verify" },
      { delay: 120,  cls: "fd-line--dim",   text: "" },
      { delay: 200,  cls: "fd-line--key",   text: "  agent    agent_claude_code" },
      { delay: 300,  cls: "fd-line--key",   text: "  action   deploy" },
      { delay: 400,  cls: "fd-line--key",   text: "  vendor   vercel.com" },
      { delay: 500,  cls: "fd-line--warn",  text: "  env      production" },
      { delay: 620,  cls: "fd-line--dim",   text: "" },
      { delay: 720,  cls: "fd-line--muted", text: "  checking passport_claude..." },
      { delay: 1100, cls: "fd-line--muted", text: "  3 permissions active" },
      { delay: 1400, cls: "fd-line--dim",   text: "" },
      { delay: 1500, cls: "fd-line--deny",  text: "  DECISION   denied" },
      { delay: 1620, cls: "fd-line--key",   text: "  reason     requires_approval" },
      { delay: 1720, cls: "fd-line--key",   text: "  executed   false" },
      { delay: 1820, cls: "fd-line--key",   text: "  requestId  req_K9mXp2qR" },
    ],
    verdict: "denied" as const,
  },
  {
    lines: [
      { delay: 0,    cls: "fd-line--label", text: "$ behalf verify" },
      { delay: 120,  cls: "fd-line--dim",   text: "" },
      { delay: 200,  cls: "fd-line--key",   text: "  agent    agent_cursor" },
      { delay: 300,  cls: "fd-line--key",   text: "  action   git_push" },
      { delay: 400,  cls: "fd-line--key",   text: "  repo     behalfid/app" },
      { delay: 500,  cls: "fd-line--warn",  text: "  branch   main" },
      { delay: 620,  cls: "fd-line--dim",   text: "" },
      { delay: 720,  cls: "fd-line--muted", text: "  checking passport_cursor..." },
      { delay: 1100, cls: "fd-line--muted", text: "  rule: no direct pushes to main" },
      { delay: 1400, cls: "fd-line--dim",   text: "" },
      { delay: 1500, cls: "fd-line--deny",  text: "  DECISION   denied" },
      { delay: 1620, cls: "fd-line--key",   text: "  reason     protected_branch" },
      { delay: 1720, cls: "fd-line--key",   text: "  executed   false" },
      { delay: 1820, cls: "fd-line--key",   text: "  requestId  req_B4xWq8mN" },
    ],
    verdict: "denied" as const,
  },
  {
    lines: [
      { delay: 0,    cls: "fd-line--label", text: "$ behalf verify" },
      { delay: 120,  cls: "fd-line--dim",   text: "" },
      { delay: 200,  cls: "fd-line--key",   text: "  agent    agent_claude_code" },
      { delay: 300,  cls: "fd-line--key",   text: "  action   read_file" },
      { delay: 400,  cls: "fd-line--key",   text: "  vendor   github.com" },
      { delay: 500,  cls: "fd-line--key",   text: "  scope    repo:behalfid/sdk" },
      { delay: 620,  cls: "fd-line--dim",   text: "" },
      { delay: 720,  cls: "fd-line--muted", text: "  checking passport_claude..." },
      { delay: 1100, cls: "fd-line--muted", text: "  rule: allow read on github.com" },
      { delay: 1400, cls: "fd-line--dim",   text: "" },
      { delay: 1500, cls: "fd-line--allow", text: "  DECISION   allowed" },
      { delay: 1620, cls: "fd-line--key",   text: "  executed   true" },
      { delay: 1720, cls: "fd-line--key",   text: "  requestId  req_C2pLr5hK" },
    ],
    verdict: "allowed" as const,
  },
];

export function FlowDiagram() {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [visibleCount, setVisibleCount] = useState(0);
  const timerRefs = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    timerRefs.current.forEach(clearTimeout);
    timerRefs.current = [];
    setVisibleCount(0);

    const scene = SCENES[sceneIdx];

    // Reveal each line at its delay
    scene.lines.forEach((line, i) => {
      const t = setTimeout(() => {
        setVisibleCount(i + 1);
      }, line.delay);
      timerRefs.current.push(t);
    });

    // Pause 1.8s on the completed scene then advance
    const lastDelay = scene.lines[scene.lines.length - 1].delay;
    const advance = setTimeout(() => {
      setSceneIdx((s) => (s + 1) % SCENES.length);
    }, lastDelay + 1800);
    timerRefs.current.push(advance);

    return () => timerRefs.current.forEach(clearTimeout);
  }, [sceneIdx]);

  const scene = SCENES[sceneIdx];

  return (
    <div className="fd-wrap">
      {/* Title bar */}
      <div className="fd-bar">
        <div className="fd-bar__dots">
          <span /><span /><span />
        </div>
        <span className="fd-bar__title">behalf · verify</span>
        <span className={`fd-bar__badge fd-bar__badge--${scene.verdict}`}>
          {scene.verdict === "denied" ? "DENIED" : "ALLOWED"}
        </span>
      </div>

      {/* Terminal body */}
      <div className="fd-body">
        {scene.lines.map((line, i) => (
          <div
            key={`${sceneIdx}-${i}`}
            className={`fd-line ${line.cls} ${i < visibleCount ? "fd-line--visible" : ""}`}
          >
            <pre>{line.text}</pre>
          </div>
        ))}
        {/* Blinking cursor */}
        <div className="fd-cursor" />
      </div>

      {/* Footer event stream */}
      <div className="fd-footer">
        <div className={`fd-event fd-event--${scene.verdict}`}>
          <span className="fd-event__dot" />
          <span className="fd-event__name">
            verification.{scene.verdict}
          </span>
          <span className="fd-event__time">just now</span>
        </div>
        <div className="fd-event fd-event--allowed">
          <span className="fd-event__dot" />
          <span className="fd-event__name">verification.allowed</span>
          <span className="fd-event__time">4s ago</span>
        </div>
        <div className="fd-event fd-event--denied">
          <span className="fd-event__dot" />
          <span className="fd-event__name">verification.denied</span>
          <span className="fd-event__time">8s ago</span>
        </div>
      </div>
    </div>
  );
}
