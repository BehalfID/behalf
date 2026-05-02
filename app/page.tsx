const steps = ["Create agent", "Assign permissions", "Verify action", "Audit decision"];

export default function Home() {
  return (
    <main className="home">
      <section className="home__inner" aria-labelledby="home-title">
        <p className="home__eyebrow">Agent permission passport API</p>
        <h1 id="home-title">BehalfID</h1>
        <p className="home__subtitle">Identity and permissions for AI agents.</p>
        <p className="home__body">
          Verify whether an AI agent is allowed to act on behalf of a user.
        </p>

        <div className="flow" aria-label="BehalfID flow">
          {steps.map((step, index) => (
            <div className="flow__step" key={step}>
              <span className="flow__number">{index + 1}.</span>
              <span className="flow__label">{step}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
