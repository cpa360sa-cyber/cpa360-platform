import { signIn, signUp, sendMagicLink, sendReset, setPassword } from "./auth.js";

const esc = (s) => (s == null ? "" : String(s)).replace(/[&<>"']/g, (m) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

const BRAND = `
  <div class="auth-brand">
    <div class="auth-mark">C</div>
    <div><b>CPA360&trade;</b><span>Your CPA Institutional Operating System</span></div>
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
    <div class="auth-wrap"><div class="auth-card">
      ${BRAND}
      <h1>${esc(c.h)}</h1>
      <p class="sub">${esc(c.sub)}</p>
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
    </div></div>`;

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
