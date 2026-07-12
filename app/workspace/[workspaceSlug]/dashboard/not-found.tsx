export default function WorkspaceNotFound() {
  return (
    <main className="app-shell" style={{ padding: "3rem 1.5rem", maxWidth: 640, margin: "0 auto" }}>
      <h1>Workspace not found</h1>
      <p>That workspace URL does not exist, or you do not have access to it.</p>
      <p>
        <a href="/dashboard">Go to your dashboard</a>
      </p>
    </main>
  );
}
