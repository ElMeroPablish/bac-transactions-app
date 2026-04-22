import { useState } from "react";
import AuthLayout from "@/components/AuthLayout";
import OutlookConnect from "@/components/OutlookConnect";
import TransactionList from "@/components/TransactionList";
import { trpc } from "@/providers/trpc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreditCard, Settings } from "lucide-react";

export default function Home() {
  const { data: status } = trpc.outlook.getStatus.useQuery();
  const [clientId, setClientId] = useState("");

  return (
    <AuthLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              BAC Transaction Tracker
            </h1>
            <p className="text-muted-foreground mt-1">
              Gestiona tus transacciones de BAC Credomatic MASTERCARD 6150
            </p>
          </div>
        </div>

        <Tabs defaultValue="transactions" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="transactions" className="gap-2">
              <CreditCard className="h-4 w-4" />
              Transacciones
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="h-4 w-4" />
              Configuracion
            </TabsTrigger>
          </TabsList>

          <TabsContent value="transactions" className="mt-6">
            <TransactionList
              clientId={clientId}
              outlookConnected={!!status?.connected}
            />
          </TabsContent>

          <TabsContent value="settings" className="mt-6 space-y-6">
            <OutlookConnect />

            {status?.connected && (
              <div className="rounded-lg border p-4 bg-muted/50">
                <h3 className="font-medium mb-2">
                  Configuracion de sincronizacion
                </h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Para sincronizar transacciones, necesitas ingresar tu Microsoft
                  Client ID y hacer clic en "Sincronizar" en la pestana de
                  Transacciones.
                </p>
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Microsoft Client ID
                  </label>
                  <input
                    type="text"
                    placeholder="Ingresa tu Client ID para sincronizar..."
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AuthLayout>
  );
}
