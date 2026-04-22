import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

export default function OutlookCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("Procesando conexion...");
  const hasProcessed = useRef(false);

  const callbackMutation = trpc.outlook.handleCallback.useMutation();

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const code = searchParams.get("code") ?? "";
    const error = searchParams.get("error");
    const state = sessionStorage.getItem("outlook_state") ?? "";

    if (error) {
      setStatus("error");
      setMessage(`Error de Microsoft: ${error}`);
      return;
    }

    if (!code || !state) {
      setStatus("error");
      setMessage("Faltan parametros de autorizacion");
      return;
    }

    async function processCallback() {
      try {
        await callbackMutation.mutateAsync({
          code,
          state,
        });
        setStatus("success");
        setMessage("Outlook conectado exitosamente!");
        sessionStorage.removeItem("outlook_state");
        sessionStorage.removeItem("outlook_client_id");
        setTimeout(() => {
          navigate("/");
        }, 2000);
      } catch (err) {
        setStatus("error");
        setMessage(
          err instanceof Error
            ? err.message
            : "Error al conectar Outlook",
        );
      }
    }

    processCallback();
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            {status === "loading" && (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            )}
            {status === "success" && (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            )}
            {status === "error" && <XCircle className="h-5 w-5 text-red-500" />}
            {status === "loading"
              ? "Conectando..."
              : status === "success"
                ? "Conectado"
                : "Error"}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-muted-foreground">{message}</p>
          {status === "error" && (
            <button
              onClick={() => navigate("/")}
              className="mt-4 text-primary underline text-sm"
            >
              Volver al inicio
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
