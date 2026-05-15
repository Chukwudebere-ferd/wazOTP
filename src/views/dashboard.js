import { initializeApp } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-app.js";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.7.3/firebase-auth.js";
import QRCode from "https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm";

const state = {
  auth: null,
  apiKey: null,
  idToken: null,
  user: null,
  pollTimer: null,
  isBusy: false,
};

const elements = {
  heroStatus: document.getElementById("heroStatus"),
  authPanel: document.getElementById("authPanel"),
  controlPanel: document.getElementById("controlPanel"),
  emailForm: document.getElementById("emailForm"),
  emailInput: document.getElementById("emailInput"),
  passwordInput: document.getElementById("passwordInput"),
  togglePassword: document.getElementById("togglePassword"),
  eyeIcon: document.getElementById("eyeIcon"),
  signinButton: document.getElementById("signinButton"),
  signupButton: document.getElementById("signupButton"),
  googleButton: document.getElementById("googleButton"),
  logoutButton: document.getElementById("logoutButton"),
  connectButton: document.getElementById("connectButton"),
  relinkButton: document.getElementById("relinkButton"),
  accountEmail: document.getElementById("accountEmail"),
  apiKeyValue: document.getElementById("apiKeyValue"),
  sessionState: document.getElementById("sessionState"),
  phoneValue: document.getElementById("phoneValue"),
  deviceValue: document.getElementById("deviceValue"),
  connectedValue: document.getElementById("connectedValue"),
  qrValue: document.getElementById("qrValue"),
  logoutReasonValue: document.getElementById("logoutReasonValue"),
  qrCanvas: document.getElementById("qrCanvas"),
  qrPlaceholder: document.getElementById("qrPlaceholder"),
  qrHint: document.getElementById("qrHint"),
  copyApiKeyButton: document.getElementById("copyApiKeyButton"),
  accountNavGroup: document.getElementById("accountNavGroup"),
};

function setHeroStatus(message) {
  elements.heroStatus.textContent = message;
}

function setBusy(busy, targetButton = null) {
  state.isBusy = busy;
  [
    elements.signinButton,
    elements.signupButton,
    elements.googleButton,
    elements.logoutButton,
    elements.connectButton,
    elements.relinkButton,
  ].forEach((button) => {
    if (button) button.disabled = busy;
  });

  if (targetButton) {
    if (busy) {
      targetButton.dataset.originalText = targetButton.innerHTML;
      targetButton.innerHTML = `<span class="spinner"></span> Processing...`;
      targetButton.classList.add("is-loading");
    } else {
      if (targetButton.dataset.originalText) {
        targetButton.innerHTML = targetButton.dataset.originalText;
      }
      targetButton.classList.remove("is-loading");
    }
  }
}

function createToastContainer() {
  let container = document.getElementById("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  return container;
}

function showToast(message, type = "error") {
  const container = createToastContainer();
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = "fadeOut 0.3s ease forwards";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return parsed.toLocaleString();
}

function showAuthPanel() {
  elements.authPanel.classList.remove("hidden");
  elements.controlPanel.classList.add("hidden");
  if (elements.accountNavGroup) elements.accountNavGroup.classList.add("hidden");
}

function showControlPanel() {
  elements.authPanel.classList.add("hidden");
  elements.controlPanel.classList.remove("hidden");
  if (elements.accountNavGroup) elements.accountNavGroup.classList.remove("hidden");
}

function clearQr() {
  elements.qrCanvas.classList.add("hidden");
  elements.qrPlaceholder.classList.remove("hidden");
  const context = elements.qrCanvas.getContext("2d");
  context.clearRect(0, 0, elements.qrCanvas.width, elements.qrCanvas.height);
}

async function drawQr(qr) {
  if (!qr) {
    clearQr();
    return;
  }

  elements.qrPlaceholder.classList.add("hidden");
  elements.qrCanvas.classList.remove("hidden");

  await QRCode.toCanvas(elements.qrCanvas, qr, {
    width: 280,
    margin: 1,
    color: {
      dark: "#0f172a",
      light: "#ffffff",
    },
  });
}

async function authedFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${state.idToken}`);

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const payload = await response.json();

  if (!response.ok || payload.success === false) {
    const message = payload.message || `Request failed: ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

async function syncDashboardUser() {
  await authedFetch("/v1/auth/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      idToken: state.idToken,
    }),
  });

  const payload = await authedFetch("/v1/auth/me");

  state.apiKey = payload.data.apiKey;
  state.user = payload.data.user;

  elements.accountEmail.textContent = payload.data.user.email || "No email";
  elements.apiKeyValue.textContent = payload.data.apiKey || "No API key";

  if (payload.data.session) {
    applySessionStatus(payload.data.session);
  }
}

function applySessionStatus(session) {
  elements.sessionState.textContent = session.status || "idle";
  elements.phoneValue.textContent = session.phoneNumber || "-";
  elements.deviceValue.textContent = session.deviceName || "-";
  elements.connectedValue.textContent = formatDate(session.lastConnectedAt);
  elements.qrValue.textContent = formatDate(session.lastQrAt);
  elements.logoutReasonValue.textContent = session.logoutReason || "-";

  const waitingForQr = session.status === "qr_ready" || session.status === "initializing" || session.status === "reconnecting";
  elements.qrHint.textContent = waitingForQr
    ? "Scan the QR in WhatsApp Linked Devices. If the code changes, this page will pull the latest one."
    : "The page keeps polling session state. If WhatsApp logs out, use relink to generate a fresh scan.";
}

async function refreshSessionStatus() {
  const payload = await authedFetch("/v1/whatsapp/session/status");
  const session = payload.data;
  applySessionStatus(session);

  if (session.hasQr || session.status === "qr_ready") {
    const qrPayload = await authedFetch("/v1/whatsapp/session/qr");
    await drawQr(qrPayload.data.qr);
  } else {
    clearQr();
  }

  if (session.status === "connected") {
    setHeroStatus("WhatsApp is connected and ready to send notifications.");
  } else if (session.status === "relink_required") {
    setHeroStatus("WhatsApp needs a fresh scan. Use relink to generate a new QR.");
  } else {
    setHeroStatus(`Current session state: ${session.status}.`);
  }
}

function stopPolling() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

function startPolling() {
  stopPolling();
  state.pollTimer = setInterval(() => {
    if (!state.idToken) {
      stopPolling();
      return;
    }

    refreshSessionStatus().catch((error) => {
      showToast(error.message);
    });
  }, 5000);
}

async function handleAuthenticatedUser(user) {
  state.idToken = await user.getIdToken();
  await syncDashboardUser();
  showControlPanel();
  await refreshSessionStatus();
  startPolling();
}

async function initializeDashboard() {
  setHeroStatus("Loading dashboard...");

  const configResponse = await fetch("/v1/dashboard/firebase-config");
  const configPayload = await configResponse.json();
  const app = initializeApp(configPayload.data);
  state.auth = getAuth(app);

  onAuthStateChanged(state.auth, async (user) => {
    stopPolling();

    if (!user) {
      state.idToken = null;
      state.apiKey = null;
      state.user = null;
      clearQr();
      showAuthPanel();
      setHeroStatus("Sign in to manage OTP and notification delivery.");
      return;
    }

    try {
      await handleAuthenticatedUser(user);
    } catch (error) {
      showToast(error.message);
    }
  });

  bindEvents();
  setHeroStatus("Sign in to manage OTP and notification delivery.");
}

function bindEvents() {
  if (elements.copyApiKeyButton) {
    elements.copyApiKeyButton.addEventListener("click", async () => {
      if (!state.apiKey) return;
      try {
        await navigator.clipboard.writeText(state.apiKey);
        showToast("API Key copied to clipboard", "success");
      } catch (err) {
        showToast("Failed to copy API key");
      }
    });
  }

  if (elements.togglePassword) {
    elements.togglePassword.addEventListener("click", () => {
      const type = elements.passwordInput.getAttribute("type") === "password" ? "text" : "password";
      elements.passwordInput.setAttribute("type", type);
      
      if (type === "text") {
        elements.eyeIcon.innerHTML = `
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        `;
      } else {
        elements.eyeIcon.innerHTML = `
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        `;
      }
    });
  }

  elements.emailForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setBusy(true, elements.signinButton);

    try {
      await signInWithEmailAndPassword(
        state.auth,
        elements.emailInput.value.trim(),
        elements.passwordInput.value,
      );
    } catch (error) {
      showToast(error.message);
    } finally {
      setBusy(false, elements.signinButton);
    }
  });

  elements.signupButton.addEventListener("click", async () => {
    setBusy(true, elements.signupButton);

    try {
      await createUserWithEmailAndPassword(
        state.auth,
        elements.emailInput.value.trim(),
        elements.passwordInput.value,
      );
      showToast("Account created successfully", "success");
    } catch (error) {
      showToast(error.message);
    } finally {
      setBusy(false, elements.signupButton);
    }
  });

  elements.googleButton.addEventListener("click", async () => {
    setBusy(true, elements.googleButton);

    try {
      await signInWithPopup(state.auth, new GoogleAuthProvider());
    } catch (error) {
      showToast(error.message);
    } finally {
      setBusy(false, elements.googleButton);
    }
  });

  elements.logoutButton.addEventListener("click", async () => {
    setBusy(true, elements.logoutButton);

    try {
      stopPolling();
      await signOut(state.auth);
    } catch (error) {
      showToast(error.message);
    } finally {
      setBusy(false, elements.logoutButton);
    }
  });

  elements.connectButton.addEventListener("click", async () => {
    setBusy(true, elements.connectButton);

    try {
      await authedFetch("/v1/whatsapp/session/connect", { method: "POST" });
      await refreshSessionStatus();
    } catch (error) {
      showToast(error.message);
    } finally {
      setBusy(false, elements.connectButton);
    }
  });

  elements.relinkButton.addEventListener("click", async () => {
    setBusy(true, elements.relinkButton);

    try {
      await authedFetch("/v1/whatsapp/session/relink", { method: "POST" });
      await refreshSessionStatus();
    } catch (error) {
      showToast(error.message);
    } finally {
      setBusy(false, elements.relinkButton);
    }
  });
}

initializeDashboard().catch((error) => {
  setHeroStatus(error.message);
});

// Chatbot Logic
const chatBtn = document.getElementById('chatWidgetBtn');
const chatWindow = document.getElementById('chatWindow');
const closeBtn = document.getElementById('chatCloseBtn');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('chatSendBtn');
const chatBody = document.getElementById('chatBody');

if (chatBtn && chatWindow) {
  chatBtn.addEventListener('click', () => {
    chatWindow.classList.add('open');
    chatBtn.style.transform = 'scale(0)';
    chatInput.focus();
  });

  closeBtn.addEventListener('click', () => {
    chatWindow.classList.remove('open');
    chatBtn.style.transform = 'scale(1)';
  });

  chatInput.addEventListener('input', () => {
    sendBtn.disabled = chatInput.value.trim().length === 0;
  });

  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !sendBtn.disabled) {
      sendMessage();
    }
  });

  sendBtn.addEventListener('click', sendMessage);

  async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    appendMessage(text, 'user');
    chatInput.value = '';
    sendBtn.disabled = true;

    const typingId = 'typing-' + Date.now();
    appendTypingIndicator(typingId);

    try {
      const response = await fetch('/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });

      const data = await response.json();
      removeElement(typingId);

      if (response.ok) {
        let formattedReply = data.reply
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/`(.*?)`/g, '<code class="code">$1</code>')
          .replace(/\n/g, '<br/>');
        appendMessage(formattedReply, 'bot', true);
      } else {
        appendMessage("Sorry, I encountered an error: " + (data.error || "Unknown error"), 'bot');
      }
    } catch (err) {
      removeElement(typingId);
      appendMessage("Network error. Could not reach the server.", 'bot');
    }
  }

  function appendMessage(text, sender, isHtml = false) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message ${sender}`;
    if (isHtml) {
      msgDiv.innerHTML = text;
    } else {
      msgDiv.textContent = text;
    }
    chatBody.appendChild(msgDiv);
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  function appendTypingIndicator(id) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message bot';
    msgDiv.id = id;
    msgDiv.innerHTML = '<div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>';
    chatBody.appendChild(msgDiv);
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  function removeElement(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }
}
