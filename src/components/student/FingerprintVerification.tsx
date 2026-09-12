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
import { Fingerprint } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import Button from "@/components/ui/Button";

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
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <Fingerprint className="h-3.5 w-3.5" />
            </span>
            {isCreateMode ? "Register Passkey" : "Passkey Verification"}
          </span>
        }
        description={
          isCreateMode
            ? "Register a device passkey using your fingerprint or device biometric lock. The passkey is verified by the server on every attendance mark."
            : "Use your registered passkey (fingerprint / device biometric) to authenticate attendance. The server verifies the cryptographic signature."
        }
      />
      <CardBody>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="success"
            disabled={disabled || busy}
            loading={busy}
            onClick={isCreateMode ? registerPasskey : verify}
          >
            {busy ? "Working..." : label}
          </Button>
          {!isCreateMode && needsRegistration ? (
            <Button
              variant="secondary"
              disabled={disabled || busy}
              onClick={registerPasskey}
            >
              Register Passkey
            </Button>
          ) : null}
        </div>
        {!supported ? (
          <p className="mt-3 text-xs text-amber-700">
            Passkeys are unavailable here. Use HTTPS and a browser with WebAuthn
            support, or ask your teacher to mark you via QR scan.
          </p>
        ) : null}
        {error ? <p className="mt-3 text-xs text-danger">{error}</p> : null}
      </CardBody>
    </Card>
  );
}
