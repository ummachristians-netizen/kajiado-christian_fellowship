import { hasSupabaseConfig, supabase } from "./supabase-config.js";

const form = document.getElementById("newPasswordForm");
const password = document.getElementById("newPassword");
const confirmation = document.getElementById("confirmNewPassword");
const saveButton = document.getElementById("savePasswordBtn");
const status = document.getElementById("resetStatus");
const returnLink = document.getElementById("returnToLogin");
const portal = new URLSearchParams(window.location.search).get("portal") === "member" ? "member" : "admin";
const loginPage = portal === "member" ? "membership.html" : "admin-login.html";

returnLink.href = loginPage;

function showStatus(message, isError = false) {
  status.textContent = message;
  status.style.color = isError ? "#b3261e" : "#0f4c81";
}

function enableForm() {
  password.disabled = false;
  confirmation.disabled = false;
  saveButton.disabled = false;
  showStatus("Recovery link verified. Enter your new password.");
  password.focus();
}

async function initializeRecovery() {
  if (!hasSupabaseConfig || !supabase) {
    showStatus("Supabase is not configured for this deployment.", true);
    return;
  }

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY" && session) enableForm();
  });

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    showStatus(error.message, true);
    return;
  }
  if (data.session) {
    enableForm();
    return;
  }

  window.setTimeout(() => {
    if (saveButton.disabled) showStatus("This recovery link is invalid or expired. Request a new password reset email.", true);
  }, 2500);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (password.value.length < 8) {
    showStatus("Use a password with at least 8 characters.", true);
    return;
  }
  if (password.value !== confirmation.value) {
    showStatus("The passwords do not match.", true);
    return;
  }

  saveButton.disabled = true;
  showStatus("Updating your password...");
  const { error } = await supabase.auth.updateUser({ password: password.value });
  if (error) {
    saveButton.disabled = false;
    showStatus(error.message, true);
    return;
  }

  showStatus("Password updated successfully. Returning to login...");
  await supabase.auth.signOut().catch(() => {});
  window.setTimeout(() => window.location.replace(loginPage), 1200);
});

initializeRecovery();
