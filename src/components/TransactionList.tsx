import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2,
  RefreshCw,
  CreditCard,
  CheckCircle2,
  DollarSign,
  Wallet,
  Store,
  Calendar,
} from "lucide-react";
import { useState } from "react";

interface TransactionListProps {
  clientId: string;
  outlookConnected: boolean;
}

export default function TransactionList({
  clientId,
  outlookConnected,
}: TransactionListProps) {
  const utils = trpc.useUtils();
  const [lastSyncResult, setLastSyncResult] = useState<{
    emailsFound: number;
    transactionsFound: number;
  } | null>(null);

  const {
    data: transactions,
    isLoading: transactionsLoading,
  } = trpc.transaction.list.useQuery();

  const syncMutation = trpc.transaction.sync.useMutation({
    onSuccess: (data) => {
      utils.transaction.list.invalidate();
      setLastSyncResult({
        emailsFound: data.emailsFound,
        transactionsFound: data.transactionsFound,
      });
    },
  });

  const markToPayMutation = trpc.transaction.markToPay.useMutation({
    onSuccess: () => {
      utils.transaction.list.invalidate();
    },
  });

  const markPaidMutation = trpc.transaction.markPaid.useMutation({
    onSuccess: () => {
      utils.transaction.list.invalidate();
    },
  });

  const handleSync = () => {
    if (!clientId) return;
    syncMutation.mutate({ clientId });
  };

  const totalToPay = transactions
    ?.filter((t) => t.isMarkedToPay && !t.isPaid)
    .reduce(
      (acc, t) => {
        const amt = parseFloat(t.amount);
        if (t.currency === "USD") {
          acc.usd += amt;
        } else {
          acc.hnl += amt;
        }
        return acc;
      },
      { hnl: 0, usd: 0 },
    );

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("es-HN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatAmount = (amount: string, currency: string) => {
    const num = parseFloat(amount);
    if (currency === "USD") {
      return `$${num.toFixed(2)}`;
    }
    return `L ${num.toFixed(2)}`;
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Transacciones</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {transactions && transactions.length > 0 && (
              <Badge variant="secondary">{transactions.length} total</Badge>
            )}
            <Button
              size="sm"
              onClick={handleSync}
              disabled={syncMutation.isPending || !outlookConnected || !clientId}
            >
              {syncMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Sincronizar
            </Button>
          </div>
        </div>
        <CardDescription>
          Lista de transacciones de tu tarjeta MASTERCARD 6150. Marca las que
          deseas pagar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {lastSyncResult && (
          <div className="mb-4 rounded-lg bg-muted p-3 text-sm">
            <p className="font-medium">Ultima sincronizacion:</p>
            <p className="text-muted-foreground">
              {lastSyncResult.emailsFound} correos encontrados,{" "}
              {lastSyncResult.transactionsFound} transacciones nuevas
            </p>
          </div>
        )}

        {transactionsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !transactions || transactions.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <CreditCard className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <div>
              <p className="text-muted-foreground font-medium">
                No hay transacciones
              </p>
              <p className="text-sm text-muted-foreground/70">
                {outlookConnected
                  ? "Haz clic en Sincronizar para buscar transacciones en tus correos"
                  : "Conecta tu cuenta de Outlook primero"}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {totalToPay && (totalToPay.hnl > 0 || totalToPay.usd > 0) && (
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-4">
                <p className="text-sm font-medium text-primary mb-2">
                  Total seleccionado para pagar:
                </p>
                <div className="flex flex-wrap gap-4">
                  {totalToPay.hnl > 0 && (
                    <div className="flex items-center gap-1.5">
                      <Wallet className="h-4 w-4 text-primary" />
                      <span className="font-semibold">
                        L {totalToPay.hnl.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {totalToPay.usd > 0 && (
                    <div className="flex items-center gap-1.5">
                      <DollarSign className="h-4 w-4 text-primary" />
                      <span className="font-semibold">
                        ${totalToPay.usd.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-2">
                {transactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className={`rounded-lg border p-4 transition-all ${
                      transaction.isPaid
                        ? "bg-green-50/50 border-green-200"
                        : transaction.isMarkedToPay
                          ? "bg-primary/5 border-primary/20"
                          : "bg-card hover:bg-accent/50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="pt-0.5">
                        {transaction.isPaid ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        ) : (
                          <Checkbox
                            checked={transaction.isMarkedToPay}
                            onCheckedChange={(checked) => {
                              markToPayMutation.mutate({
                                id: transaction.id,
                                isMarkedToPay: checked === true,
                              });
                            }}
                          />
                        )}
                      </div>

                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Store className="h-4 w-4 text-muted-foreground shrink-0" />
                              <p className="font-medium text-sm truncate">
                                {transaction.commerce}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              {formatDate(transaction.transactionDate)}
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <p
                              className={`font-semibold ${
                                transaction.currency === "USD"
                                  ? "text-blue-600"
                                  : "text-emerald-600"
                              }`}
                            >
                              {formatAmount(
                                transaction.amount,
                                transaction.currency,
                              )}
                            </p>
                            <Badge
                              variant="outline"
                              className={`text-xs ${
                                transaction.currency === "USD"
                                  ? "border-blue-300 text-blue-600"
                                  : "border-emerald-300 text-emerald-600"
                              }`}
                            >
                              {transaction.currency === "USD"
                                ? "Dolares"
                                : "Lempiras"}
                            </Badge>
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {transaction.cardNumber && (
                              <Badge variant="secondary" className="text-xs">
                                MASTERCARD {transaction.cardNumber}
                              </Badge>
                            )}
                            {transaction.isPaid && (
                              <Badge
                                variant="default"
                                className="bg-green-500 text-xs"
                              >
                                Pagado
                              </Badge>
                            )}
                            {transaction.isMarkedToPay && !transaction.isPaid && (
                              <Badge
                                variant="default"
                                className="text-xs"
                              >
                                Por pagar
                              </Badge>
                            )}
                          </div>

                          {!transaction.isPaid && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-green-600 hover:text-green-700 hover:bg-green-50"
                              onClick={() => {
                                markPaidMutation.mutate({
                                  id: transaction.id,
                                  isPaid: true,
                                });
                              }}
                            >
                              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                              Marcar pagado
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
