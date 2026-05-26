"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { recoverPasswordReset } from "@/lib/dashboard-api";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<{ type: "success" | "error" | null; text: string | null }>({ type: null, text: null });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      setToken(params.get("token") || "");
    }
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      setStatus({
        type: "error",
        text: "Falta el token de recuperación. Por favor, utiliza el enlace que recibiste en tu correo."
      });
      return;
    }

    if (password.length < 6) {
      setStatus({
        type: "error",
        text: "La contraseña debe tener al menos 6 caracteres."
      });
      return;
    }

    if (password !== confirmPassword) {
      setStatus({
        type: "error",
        text: "Las contraseñas no coinciden."
      });
      return;
    }

    setLoading(true);
    setStatus({ type: null, text: null });

    try {
      const res = await recoverPasswordReset({ token, new_password: password });
      if (res.ok) {
        setStatus({
          type: "success",
          text: res.message || "Tu contraseña se ha restablecido con éxito. Redirigiendo..."
        });
        setTimeout(() => {
          router.push("/barberia");
        }, 3000);
      } else {
        setStatus({
          type: "error",
          text: res.message || "No se pudo restablecer la contraseña."
        });
      }
    } catch (err) {
      setStatus({
        type: "error",
        text: err instanceof Error ? err.message : "Error al intentar restablecer contraseña."
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="ba-dashboard-shell ba-login-shell">
      <section className="ba-login-card ba-card animate-fade-in">
        <div className="ba-login-icon">
          <LockKeyhole size={24} />
        </div>
        <div>
          <p className="ba-login-kicker">Panel BarberAgency</p>
          <h1>Nueva contraseña</h1>
          <p className="ba-login-copy">Ingresa y confirma tu nueva contraseña de acceso.</p>
        </div>

        {status.text && (
          <div className="ba-alert-stack">
            <p className={`ba-alert ${status.type === "success" ? "ba-alert-ok" : "ba-alert-error"}`}>
              {status.text}
            </p>
          </div>
        )}

        {!token ? (
          <div className="ba-alert-stack" style={{ marginTop: "16px" }}>
            <p className="ba-alert ba-alert-error">
              Enlace inválido: Falta el token de recuperación en la URL.
            </p>
          </div>
        ) : (
          <form className="ba-login-form" onSubmit={handleSubmit}>
            <label className="ba-field">
              Nueva contraseña
              <input
                className="ba-input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={6}
                placeholder="Mínimo 6 caracteres"
              />
            </label>
            <label className="ba-field">
              Confirmar nueva contraseña
              <input
                className="ba-input"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                minLength={6}
                placeholder="Repite la contraseña"
              />
            </label>
            <button className="ba-btn-main" type="submit" disabled={loading}>
              {loading ? "Restableciendo..." : "Restablecer contraseña"}
            </button>
          </form>
        )}

        <div style={{ display: "flex", justifyContent: "center", marginTop: "16px" }}>
          <button
            type="button"
            onClick={() => router.push("/barberia")}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-gold, #d1a638)",
              cursor: "pointer",
              fontSize: "0.875rem",
              textDecoration: "underline",
              padding: 0
            }}
          >
            Ir al inicio de sesión
          </button>
        </div>
      </section>
    </main>
  );
}
