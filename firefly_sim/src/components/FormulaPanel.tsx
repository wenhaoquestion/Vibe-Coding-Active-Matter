export function FormulaPanel() {
  return (
    <section className="panel formula">
      <div className="panel-title">Model</div>
      <p>
        Spatial Kuramoto oscillators couple only to visible neighbors:
        <code>dtheta_i = [omega_i + K/k_i sum_j A_ij sin(theta_j - theta_i)]dt + sqrt(2Ddt)Z_i</code>.
      </p>
      <p>
        Brightness is phase-derived, and synchronization uses
        <code>r(t)=|N^-1 sum_j exp(i theta_j)|</code>. Local order uses the same complex average over each firefly&apos;s visible neighborhood.
      </p>
      <p>
        City light adds <code>epsilon_city sin(Omega_city t - theta_i)</code>; obstacles remove edges whose line of sight crosses a tree disk.
      </p>
      <p>
        Mobility adds a correlated random walk plus bat avoidance <code>v_avoid = chi_bat(1-d/R_avoid)_+ n</code>; bats patrol, chase bright nearby fireflies, and capture inside <code>R_capture</code>.
      </p>
      <p className="doc-link">Full derivation and references: <code>docs/model.tex</code></p>
    </section>
  );
}
