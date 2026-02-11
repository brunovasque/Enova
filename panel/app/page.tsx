export default function HomePage() {
  return (
    <main>
      <section className="card">
        <h1>Enova Panel</h1>
        <p>Bootstrap Next.js App Router concluído com tema dark.</p>
        <div style={{ marginTop: "16px" }}>
          <a
            href="/conversations"
            style={{
              color: "#e6edf3",
              textDecoration: "none",
              border: "1px solid #2b3440",
              borderRadius: "8px",
              padding: "8px 12px",
              background: "#131d29",
              display: "inline-block",
            }}
          >
            Abrir Conversas
          </a>
        </div>
      </section>
    </main>
  );
}
