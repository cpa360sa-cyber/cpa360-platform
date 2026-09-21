import { signIn, signUp, sendMagicLink, sendReset, setPassword, signInWithGoogle } from "./auth.js";

// Off until the Google provider is actually turned on in Supabase (Authentication →
// Providers → Google, which needs a Google Cloud OAuth client) — see README.
// Flip window.__CPA360_ENV.GOOGLE_SIGNIN_ENABLED = true in config.js once that's done.
const googleSignInEnabled = () => !!(window.__CPA360_ENV || {}).GOOGLE_SIGNIN_ENABLED;

const esc = (s) => (s == null ? "" : String(s)).replace(/[&<>"']/g, (m) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

const BRAND = `
  <div class="auth-brand">
    <div class="auth-mark"><img src="./assets/logo-cpa360.webp" alt="CPA360"></div>
    <div><b>CPA360&trade;</b><span>Institutional Operating System</span></div>
  </div>`;

const COPY = {
  signin:  { h: "Secure login",       sub: "Access your CPA Institutional Operating System." },
  signup:  { h: "Create an account",  sub: "You'll be able to start or join a CPA." },
  magic:   { h: "Email me a link",    sub: "No password — we send a one-time sign-in link." },
  reset:   { h: "Reset your password", sub: "We'll email you a link to set a new one." },
  setpw:   { h: "Set a new password", sub: "Choose a password for your account." },
};

/**
 * Render the auth screen into `root`.
 * mode: "signin" | "signup" | "magic" | "reset" | "setpw"
 * onSignedIn: called when a session is established here (setpw success).
 */
export function renderAuth(root, mode = "signin", onSignedIn) {
  const c = COPY[mode] || COPY.signin;
  const needsPw = mode === "signin" || mode === "signup" || mode === "setpw";
  const needsEmail = mode !== "setpw";

  root.className = "";
  root.innerHTML = `
    <div class="auth-split">
      <aside class="auth-hero">
        <div class="ah-brand">
          <div class="ah-mark"><img src="./assets/logo-cpa360.webp" alt="CPA360"></div>
          <div><b>CPA360&trade;</b><span>A GAD Foundation Programme</span></div>
        </div>
        <h2>Your CPA Institutional Operating System.</h2>
        <p class="ah-sub">Governance, beneficiaries, land, finance, productivity and commercialisation — one institutional view, one score, one journey.</p>
        <ul>
          <li>See your institutional health on a standardised 100-point score</li>
          <li>Turn every gap into a tracked action with an owner and evidence</li>
          <li>Build the record funders, regulators and banks ask for</li>
        </ul>
        <p class="ah-tag">Stronger CPAs. Brighter Futures.</p>
      </aside>
      <div class="auth-side"><div class="auth-card">
        ${BRAND}
        <h1>${esc(c.h)}</h1>
        <p class="sub">${esc(c.sub)}</p>
        ${googleSignInEnabled() && (mode === "signin" || mode === "signup") ? `
          <button class="btn google" type="button" id="au-google">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.6-.2-2.3H12v4.4h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z"/><path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1C3.4 21.3 7.4 24 12 24z"/><path fill="#FBBC05" d="M5.4 14.4c-.2-.7-.4-1.4-.4-2.4s.1-1.6.4-2.4V6.5H1.4C.5 8.2 0 10 0 12s.5 3.8 1.4 5.5l4-3.1z"/><path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0 7.4 0 3.4 2.7 1.4 6.5l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"/></svg>
            Continue with Google
          </button>
          <div class="auth-or"><span>or</span></div>` : ""}
        <div id="auth-msg"></div>
        <form id="auth-form" novalidate>
          ${needsEmail ? `
            <div class="field">
              <label for="au-email">Email</label>
              <input id="au-email" type="email" autocomplete="email" required />
            </div>` : ""}
          ${needsPw ? `
            <div class="field">
              <label for="au-pw">${mode === "setpw" ? "New password" : "Password"}</label>
              <input id="au-pw" type="password" minlength="8"
                     autocomplete="${mode === "signin" ? "current-password" : "new-password"}" required />
            </div>` : ""}
          <button class="btn primary" type="submit" id="au-submit">${esc(c.h)}</button>
        </form>
        <div class="auth-alt" id="auth-alt"></div>
      </div></div>
    </div>`;

  const alt = root.querySelector("#auth-alt");
  const links = {
    signin:  [["magic", "Email me a link instead"], ["reset", "Forgot password?"], ["signup", "Create an account"]],
    signup:  [["signin", "I already have an account"]],
    magic:   [["signin", "Sign in with a password"]],
    reset:   [["signin", "Back to sign in"]],
    setpw:   [],
  }[mode] || [];
  alt.innerHTML = links.map(([m, label]) => `<button class="linkbtn" data-mode="${m}">${esc(label)}</button>`).join("");
  alt.querySelectorAll("[data-mode]").forEach((b) =>
    b.addEventListener("click", () => renderAuth(root, b.dataset.mode, onSignedIn)));

  const msg = root.querySelector("#auth-msg");
  const submit = root.querySelector("#au-submit");
  const show = (text, kind = "err") => { msg.innerHTML = `<div class="msg ${kind}">${esc(text)}</div>`; };

  const gbtn = root.querySelector("#au-google");
  if (gbtn) gbtn.addEventListener("click", async () => {
    gbtn.disabled = true;
    try {
      const { error } = await signInWithGoogle();
      if (error) throw error;
      // success redirects the whole page to Google — nothing more to do here
    } catch (err) {
      show(err.message || "Couldn't start Google sign-in.");
      gbtn.disabled = false;
    }
  });

  root.querySelector("#auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = root.querySelector("#au-email")?.value.trim() || "";
    const pw = root.querySelector("#au-pw")?.value || "";
    msg.innerHTML = "";
    submit.disabled = true;
    const label = submit.textContent;
    submit.textContent = "Working…";
    try {
      if (mode === "signin") {
        const { error } = await signIn(email, pw);
        if (error) throw error;
        // onAuth SIGNED_IN in app.js takes over
      } else if (mode === "signup") {
        const { data, error } = await signUp(email, pw);
        if (error) throw error;
        if (data.session) return; // confirmations off → signed in
        show("Check your email to confirm your address, then sign in.", "ok");
      } else if (mode === "magic") {
        const { error } = await sendMagicLink(email);
        if (error) throw error;
        show("Link sent. Open it on this device to continue.", "ok");
      } else if (mode === "reset") {
        const { error } = await sendReset(email);
        if (error) throw error;
        show("If that address has an account, a reset link is on its way.", "ok");
      } else if (mode === "setpw") {
        if (pw.length < 8) throw new Error("Use at least 8 characters.");
        const { error } = await setPassword(pw);
        if (error) throw error;
        show("Password set. Loading your workspace…", "ok");
        onSignedIn && onSignedIn();
      }
    } catch (err) {
      show(err.message || "Something went wrong. Try again.");
    } finally {
      submit.disabled = false;
      submit.textContent = label;
    }
  });

  root.querySelector("#au-email, #au-pw")?.focus();
}
