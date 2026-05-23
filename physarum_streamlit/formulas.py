"""LaTeX snippets and document loaders for the app."""

from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parent


def get_key_equations() -> dict[str, str]:
    """Return equations shown in the Streamlit Mathematical Model tab."""

    return {
        "Trail field": r"T_{t+\Delta t}=(1-\lambda_T\Delta t)\left[G_{\sigma_T}*(T_t+D_t)\right]",
        "Food attractant": r"A_t(x,y)=\sum_k q_k\,\frac{C_k(t)}{C_k(t)+C_{1/2}+\varepsilon}\exp\left(-\frac{\|(x,y)-f_k\|_2^2}{2\sigma_{A,k}^2}\right)",
        "Sensor locations": r"z_i^\delta(t)=p_i(t)+d_s u(\theta_i(t)+\delta\alpha),\quad \delta\in\{0,+1,-1\}",
        "Search probability": r"P_i^{\mathrm{search}}=\sigma\left(k_E\left[\frac{E_i}{E_{\max}}-\theta_E\right]\right)\left(1-\sigma\left(k_S[S_i^{\max}-\tau_S]\right)\right)",
        "Energy budget": r"\hat E_i(t+\Delta t)=\operatorname{clip}\left(E_i(t)+G_i^{\mathrm{food}}(t)-L_i(t),0,E_{\max}\right)",
        "Growth": r"\Delta m_i=r_g\left[\frac{\hat E_i}{E_{\max}}-\theta_g\right]_+m_i\Delta t",
        "Network pressure": r"L_D(t)P(t)=b(t),\qquad L_D=B\,\operatorname{diag}\left(\frac{D_e}{\ell_e+\varepsilon}\right)B^\top",
        "Conductance adaptation": r"D_e(t+\Delta t)=\max\left(D_{\min},D_e(t)+\Delta t\left[\alpha_D\frac{|Q_e|^\gamma}{|Q_e|^\gamma+q_0^\gamma+\varepsilon}-\mu_DD_e(t)\right]\right)",
        "Shortest-path cost": r"c_e^{\mathrm{path}}=\frac{\ell_e}{(D_e+\varepsilon)^\eta}",
    }


def get_latex_document() -> str:
    """Return the full LaTeX model document."""

    return (ROOT / "docs" / "model.tex").read_text(encoding="utf-8")


def get_bibtex() -> str:
    """Return the BibTeX references."""

    return (ROOT / "docs" / "references.bib").read_text(encoding="utf-8")
