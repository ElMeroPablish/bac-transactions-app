import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Mail, Link2, Unlink, Loader2, HelpCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function OutlookConnect() {
  const [clientId, setClientId] = useState("");
  const utils = trpc.useUtils();

  const { data: status, isLoading: statusLoading } =
    trpc.outlook.getStatus.useQuery();

  const disconnectMutation = trpc.outlook.disconnect.useMutation({
    onSuccess: () => {
      utils.outlook.getStatus.invalidate();
    },
  });

  const handleConnect = async () => {
    if (!clientId.trim()) return;

    const redirectUri = `${window.location.origin}/outlook-callback`;

    const { authUrl, state } = await utils.client.outlook.getAuthUrl.query({
      clientId: clientId.trim(),
      redirectUri,
    });

    sessionStorage.setItem("outlook_state", state);
    sessionStorage.setItem("outlook_client_id", clientId.trim());
    window.location.href = authUrl;
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Conexion a Outlook</CardTitle>
          </div>
          {status?.connected && (
            <div className="flex items-center gap-1.5 text-sm text-green-600">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              Conectado
            </div>
          )}
        </div>
        <CardDescription>
          Conecta tu correo de Outlook para sincronizar transacciones de BAC
          Credomatic
        </CardDescription>
      </CardHeader>
      <CardContent>
        {statusLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Verificando conexion...
          </div>
        ) : status?.connected ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted p-3">
              <p className="text-sm font-medium">Cuenta conectada:</p>
              <p className="text-sm text-muted-foreground">{status.email}</p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
            >
              {disconnectMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Unlink className="mr-2 h-4 w-4" />
              )}
              Desconectar
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="client-id">Microsoft Client ID</Label>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-6 px-2">
                      <HelpCircle className="h-3.5 w-3.5 mr-1" />
                      <span className="text-xs">Como obtener?</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Configurar Microsoft Client ID</DialogTitle>
                      <DialogDescription>
                        Para conectar tu Outlook personal, necesitas crear una
                        aplicacion en Microsoft Entra ID:
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 text-sm">
                      <ol className="space-y-2 list-decimal list-inside">
                        <li>
                          Ve a{" "}
                          <a
                            href="https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline"
                          >
                            Azure Portal - App Registrations
                          </a>
                        </li>
                        <li>Haz clic en "New registration"</li>
                        <li>
                          En "Redirect URI" selecciona "Web" y agrega:{" "}
                          <code className="bg-muted px-1 py-0.5 rounded text-xs">
                            {`${typeof window !== "undefined" ? window.location.origin : ""}/outlook-callback`}
                          </code>
                        </li>
                        <li>Haz clic en "Register"</li>
                        <li>
                          Copia el "Application (client) ID" y pegalo arriba
                        </li>
                        <li>
                          Ve a "API Permissions" y agrega{" "}
                          <code className="bg-muted px-1 py-0.5 rounded text-xs">
                            Microsoft Graph - Mail.Read
                          </code>
                        </li>
                        <li>Haz clic en "Grant admin consent"</li>
                      </ol>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              <Input
                id="client-id"
                placeholder="Pega tu Microsoft Client ID aqui..."
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              />
            </div>
            <Button
              onClick={handleConnect}
              disabled={!clientId.trim()}
              className="w-full"
            >
              <Link2 className="mr-2 h-4 w-4" />
              Conectar Outlook
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
