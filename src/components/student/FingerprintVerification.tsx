"use client";

import React, { useState } from "react";
import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import {
  getPasskeyAuthenticationOptions,
  getPasskeyRegistrationOptions,
  verifyPasskeyRegistration,
} from "@/lib/client/attendanceService";

const resolveErrorMessage = (error: any, mode: any) => {
  const fallback =
    mode === "create"
      ? "Passkey registration failed."
      : "Passkey verification failed.";

  if (!error) {
    return fallback;
  }

  if (error.name === "NotAllowedError") {
    return mode === "create"
      ? "Passkey creation was cancelled or no compatible authenticator is available."
      : "Verification was cancelled or no passkey is available on this device.";
  }

  if (error.name === "InvalidStateError") {
    return mode === "create"
      ? "A passkey for this account may already exist on this device."
      : fallback;
  }

  if (error.name === "SecurityError") {
    return "Passkeys require a secure (HTTPS) context.";
  }

  return error.message || fallback;
};

export default function FingerprintVerification({
  onVerified,
  disabled,
  actionLabel,
  mode = "verify",
  sessionId = "",
}: any) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsRegistration, setNeedsRegistration] = useState(false);

  const supported =
    typeof window !== "undefined" &&
    Boolean(window.PublicKeyCredential && window.isSecureContext);

  const registerPasskey = async () => {
    setError("");
    setBusy(true);

    try {
      if (!supported) {
        throw new Error(
          "Passkeys require a secure (HTTPS) context and a compatible browser.",
        );
      }

      const { challengeId, options } = await getPasskeyRegistrationOptions();
      const credential = await startRegistration(options);
      const result = await verifyPasskeyRegistration({
        challengeId,
        credential,
      });

      setNeedsRegistration(false);
      onVerified?.({ registered: true, credentialId: result.credentialId });
    } catch (registerError) {
      setError(resolveErrorMessage(registerError, "create"));
      onVerified?.({ registered: false });
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setError("");
    setBusy(true);

    try {
      if (!supported) {
        throw new Error(
          "Passkeys require a secure (HTTPS) context and a compatible browser.",
        );
      }

      if (!sessionId) {
        throw new Error("Join an attendance session first.");
      }

      const { challengeId, options } =
        await getPasskeyAuthenticationOptions(sessionId);
      const credential = await startAuthentication(options);

      onVerified?.({ verified: true, challengeId, credential });
    } catch (verifyError: any) {
      if (/no passkey/i.test(verifyError?.message || "")) {
        setNeedsRegistration(true);
        setError(
          "No passkey is registered for your account yet. Register one below first.",
        );
      } else {
        setError(resolveErrorMessage(verifyError, "verify"));
      }
      onVerified?.({ verified: false });
    } finally {
      setBusy(false);
    }
  };

  const isCreateMode = mode === "create";
  const label =
    actionLabel || (isCreateMode ? "Register Passkey" : "Verify Passkey");

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-700">
        {isCreateMode ? "Register Passkey" : "Passkey Verification"}
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        {isCreateMode
          ? "Register a device passkey using your fingerprint or device biometric lock. The passkey is verified by the server on every attendance mark."
          : "Use your registered passkey (fingerprint / device biometric) to authenticate attendance. The server verifies the cryptographic signature."}
      </p>
      <button
        type="button"
        disabled={disabled || busy}
        onClick={isCreateMode ? registerPasskey : verify}
        className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {busy ? "Working..." : label}
      </button>
      {!isCreateMode && needsRegistration ? (
        <button
          type="button"
          disabled={disabled || busy}
          onClick={registerPasskey}
          className="mt-3 ml-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 disabled:opacity-60"
        >
          Register Passkey
        </button>
      ) : null}
      {!supported ? (
        <p className="mt-2 text-xs text-amber-700">
          Passkeys are unavailable here. Use HTTPS and a browser with WebAuthn
          support, or ask your teacher to mark you via QR scan.
        </p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
